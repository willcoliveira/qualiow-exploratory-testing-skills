/**
 * Backwards compatibility with output written before the current column set and
 * the current session directory scheme: a project initialised by an earlier
 * version has a six-column INDEX.md (no Kind) and directories named without a
 * kind segment. Rows must be written in the layout the file already has, and the
 * legacy directories must stay visible to prune and to the unindexed scan.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, cpSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  runSessionArchive,
  runSessionDelete,
  runSessionFinalize,
  runSessionPrune,
} from '../../src/cli/commands/session.js';
import { runList } from '../../src/cli/commands/list.js';
import { parseMarkdownTable } from '../../src/utils/markdown-table.js';
import { ALL_BUGS_MD_HEADER, INDEX_MD_HEADER } from '../../src/utils/index-files.js';

const REPO_ROOT = resolve(process.cwd());
const CANONICAL_SESSION_DIR = join(
  REPO_ROOT,
  'tests',
  'fixtures',
  'canonical-session',
  '2026-09-08-1813-explore-example',
);
const SESSION_NAME = '2026-09-08-1813-explore-example';
const LEGACY_SESSION_NAME = '2026-05-22-1045-demo-target';

/** The pre-2.0 INDEX.md: six columns, Kind had not been added yet. */
const LEGACY_INDEX_HEADER =
  '# Exploratory Testing Sessions\n\n' +
  '_Index of exploratory testing sessions. Newest last._\n\n' +
  '| Date | Target | Bugs | Duration | Status | Report |\n' +
  '|---|---|---|---|---|---|\n';

/** A row written by that earlier version, report cell in the markdown-link form. */
const LEGACY_INDEX_ROW =
  `| 2026-05-22 | demo-target | 7 | ~75 min | complete | [report](${LEGACY_SESSION_NAME}/session-report.md) |\n`;

const tmpDirs: string[] = [];

function makeTmpCwd(): string {
  const dir = mkdtempSync(join(tmpdir(), 'qualiow-legacy-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tmpDirs.length) {
    rmSync(tmpDirs.pop()!, { recursive: true, force: true });
  }
});

const silentLog = () => {};

const indexPathOf = (cwd: string) => join(cwd, 'output', 'sessions', 'INDEX.md');
const allBugsPathOf = (cwd: string) => join(cwd, 'output', 'bugs', 'all-bugs.md');

/** A copy of the canonical session fixture under a fresh working directory. */
function makeTmpSessionCwd(): string {
  const cwd = makeTmpCwd();
  cpSync(CANONICAL_SESSION_DIR, join(cwd, 'output', 'sessions', SESSION_NAME), { recursive: true });
  return cwd;
}

/** Writes the pre-2.0 INDEX.md, with one row already in it. */
function writeLegacyIndex(cwd: string, extraRows = LEGACY_INDEX_ROW): string {
  const path = indexPathOf(cwd);
  mkdirSync(join(cwd, 'output', 'sessions'), { recursive: true });
  writeFileSync(path, LEGACY_INDEX_HEADER + extraRows);
  return path;
}

/** Cell count of a markdown row, outer pipes excluded. */
function cellCount(line: string): number {
  return line.trim().replace(/^\||\|$/g, '').split('|').length;
}

/** Every data row of a markdown table, as raw lines. */
function dataLines(content: string): string[] {
  const lines = content.split('\n');
  const sepIdx = lines.findIndex((l) => /^\|(\s*:?-{2,}\s*\|)+\s*$/.test(l.trim()));
  return lines.slice(sepIdx + 1).filter((l) => l.trim().startsWith('|'));
}

/** Fabricates a minimal session directory (any name) with a bug report in it. */
function fabricateSessionDir(cwd: string, name: string): string {
  const sessionDir = join(cwd, 'output', 'sessions', name);
  mkdirSync(join(sessionDir, 'bugs'), { recursive: true });
  writeFileSync(join(sessionDir, 'session-report.md'), '# Session Report\n');
  writeFileSync(join(sessionDir, 'bugs', 'BUG-001.md'), '# BUG-001\n');
  return sessionDir;
}

// ─── finalize into a legacy index ───────────────────────────────────

describe('runSessionFinalize — INDEX.md written before the Kind column existed', () => {
  it('appends a six-cell row that reads back with every value under its own column', async () => {
    const cwd = makeTmpSessionCwd();
    writeLegacyIndex(cwd);

    const lines: string[] = [];
    const result = await runSessionFinalize(
      'latest',
      { redact: true },
      { cwd, log: (l) => lines.push(l) },
    );
    expect(result.ok).toBe(true);
    expect(result.indexRowAdded).toBe(true);

    const content = readFileSync(indexPathOf(cwd), 'utf-8');

    // The appended row has the file's own width, not the current seven columns.
    const appended = content.split('\n').find((l) => l.includes(`${SESSION_NAME}/`));
    expect(appended).toBeDefined();
    expect(cellCount(appended!)).toBe(6);
    expect(dataLines(content).every((l) => cellCount(l) === 6)).toBe(true);

    // Read back by column name, nothing has shifted: the report link survives.
    const table = parseMarkdownTable(content)!;
    expect(table.headers).toEqual(['Date', 'Target', 'Bugs', 'Duration', 'Status', 'Report']);
    const row = table.rows.find((r) => r.report.includes(SESSION_NAME))!;
    expect(row).toBeDefined();
    expect(row.date).toBe('2026-09-08');
    expect(row.target).toBe('Example App');
    expect(row.bugs).toBe('2');
    expect(row.duration).toBe('42 min');
    expect(row.status).toBe('complete');
    expect(row.report).toBe(`${SESSION_NAME}/session-report.md`);

    // The layout is reported rather than silently accommodated.
    expect(lines.some((l) => l.includes('INDEX.md') && l.includes('Kind'))).toBe(true);

    // The pre-existing row is left exactly as it was.
    expect(content).toContain(LEGACY_INDEX_ROW.trimEnd());
  });

  it('leaves the finalized session out of the unindexed list afterwards', async () => {
    const cwd = makeTmpSessionCwd();
    writeLegacyIndex(cwd);
    await runSessionFinalize('latest', { redact: true }, { cwd, log: silentLog });

    const lines: string[] = [];
    await runList('sessions', cwd, {}, (l) => lines.push(l));
    const output = lines.join('\n');

    expect(output).toContain(SESSION_NAME);
    expect(output).not.toContain('unindexed');
  });

  it('recognises a legacy row whose report cell is a markdown link', async () => {
    const cwd = makeTmpCwd();
    writeLegacyIndex(cwd);
    fabricateSessionDir(cwd, LEGACY_SESSION_NAME);

    const lines: string[] = [];
    await runList('sessions', cwd, {}, (l) => lines.push(l));
    const output = lines.join('\n');

    expect(output).toContain(LEGACY_SESSION_NAME);
    expect(output).not.toContain('unindexed');
  });

  it('is idempotent: a second finalize leaves the file byte-identical', async () => {
    const cwd = makeTmpSessionCwd();
    writeLegacyIndex(cwd);

    await runSessionFinalize('latest', { redact: true }, { cwd, log: silentLog });
    const indexAfterFirst = readFileSync(indexPathOf(cwd), 'utf-8');
    const allBugsAfterFirst = readFileSync(allBugsPathOf(cwd), 'utf-8');

    const second = await runSessionFinalize('latest', {}, { cwd, log: silentLog });
    expect(second.ok).toBe(true);
    expect(second.indexRowAdded).toBe(false);
    expect(second.bugRowsAdded).toEqual([]);
    expect(readFileSync(indexPathOf(cwd), 'utf-8')).toBe(indexAfterFirst);
    expect(readFileSync(allBugsPathOf(cwd), 'utf-8')).toBe(allBugsAfterFirst);
  });

  it('writes the current seven-column row unchanged when the header is current', async () => {
    const cwd = makeTmpSessionCwd();
    mkdirSync(join(cwd, 'output', 'sessions'), { recursive: true });
    writeFileSync(indexPathOf(cwd), INDEX_MD_HEADER);

    const lines: string[] = [];
    const result = await runSessionFinalize(
      'latest',
      { redact: true },
      { cwd, log: (l) => lines.push(l) },
    );
    expect(result.ok).toBe(true);

    expect(readFileSync(indexPathOf(cwd), 'utf-8')).toBe(
      `${INDEX_MD_HEADER}| 2026-09-08 | explore | Example App | 2 | 42 min | complete | ${SESSION_NAME}/session-report.md |\n`,
    );
    // No layout notice for a current file.
    expect(lines.some((l) => l.includes('column set'))).toBe(false);
  });
});

// ─── prune and the unindexed scan see legacy directories ────────────

describe('runSessionPrune — directories named before the current scheme', () => {
  it('selects a legacy directory and labels it in the dry run', () => {
    const cwd = makeTmpCwd();
    writeLegacyIndex(cwd);
    fabricateSessionDir(cwd, LEGACY_SESSION_NAME);
    fabricateSessionDir(cwd, '2026-07-09-quick-preprod-product-search');
    fabricateSessionDir(cwd, '2026-09-10-1000-explore-recent');
    fabricateSessionDir(cwd, 'notes'); // not date-prefixed: not a session
    const now = new Date(2026, 8, 13);

    const lines: string[] = [];
    const result = runSessionPrune({ olderThan: '30' }, { cwd, log: (l) => lines.push(l), now });

    expect(result.dryRun).toBe(true);
    expect(result.candidates).toEqual([LEGACY_SESSION_NAME, '2026-07-09-quick-preprod-product-search']);
    expect(lines.some((l) => l.includes(LEGACY_SESSION_NAME) && l.includes('(legacy name)'))).toBe(true);
    expect(lines.join('\n')).not.toContain('notes');
    expect(existsSync(join(cwd, 'output', 'sessions', LEGACY_SESSION_NAME))).toBe(true);
  });

  it('--yes removes the legacy directory and its INDEX.md row', () => {
    const cwd = makeTmpCwd();
    const indexPath = writeLegacyIndex(cwd);
    fabricateSessionDir(cwd, LEGACY_SESSION_NAME);
    const now = new Date(2026, 8, 13);

    const result = runSessionPrune({ olderThan: 30, yes: true }, { cwd, log: silentLog, now });

    expect(result.candidates).toEqual([LEGACY_SESSION_NAME]);
    expect(existsSync(join(cwd, 'output', 'sessions', LEGACY_SESSION_NAME))).toBe(false);
    const content = readFileSync(indexPath, 'utf-8');
    expect(content).not.toContain(LEGACY_SESSION_NAME);
    expect(content.startsWith(LEGACY_INDEX_HEADER)).toBe(true);
  });

  it('lists a legacy directory as unindexed when no row references it', async () => {
    const cwd = makeTmpCwd();
    writeLegacyIndex(cwd, '');
    fabricateSessionDir(cwd, LEGACY_SESSION_NAME);

    const lines: string[] = [];
    await runList('sessions', cwd, {}, (l) => lines.push(l));
    const row = lines.find((l) => l.includes(LEGACY_SESSION_NAME));

    expect(row).toBeDefined();
    expect(row).toContain('unindexed (legacy)');
  });
});

// ─── row rewriting on a legacy-width table ──────────────────────────

describe('archive --remove and delete --yes on a six-column INDEX.md', () => {
  it.skipIf(process.platform === 'win32')(
    '--remove marks the Status cell of the legacy row, leaving the width alone',
    () => {
      const cwd = makeTmpCwd();
      const indexPath = writeLegacyIndex(cwd);
      fabricateSessionDir(cwd, LEGACY_SESSION_NAME);

      const result = runSessionArchive(LEGACY_SESSION_NAME, { remove: true }, { cwd, log: silentLog });
      expect(result.removed).toBe(true);

      const content = readFileSync(indexPath, 'utf-8');
      const row = content.split('\n').find((l) => l.includes(`${LEGACY_SESSION_NAME}/`))!;
      const cells = row.split('|').map((c) => c.trim());
      // | Date | Target | Bugs | Duration | Status | Report |
      expect(cells[5]).toBe('archived');
      expect(cells[6]).toContain(`${LEGACY_SESSION_NAME}/session-report.md`);
      expect(dataLines(content).every((l) => cellCount(l) === 6)).toBe(true);
    },
  );

  it('--yes removes the row and leaves every remaining row well formed', () => {
    const cwd = makeTmpCwd();
    const extraRow = '| 2026-06-01 | other-target | 1 | ~20 min | complete | [report](2026-06-01-0900-other-target/session-report.md) |\n';
    const indexPath = writeLegacyIndex(cwd, LEGACY_INDEX_ROW + extraRow);
    fabricateSessionDir(cwd, LEGACY_SESSION_NAME);

    const allBugsPath = allBugsPathOf(cwd);
    mkdirSync(join(cwd, 'output', 'bugs'), { recursive: true });
    writeFileSync(
      allBugsPath,
      `${ALL_BUGS_MD_HEADER}| BUG-001 | ${LEGACY_SESSION_NAME} | Something breaks | High | open | ${LEGACY_SESSION_NAME}/bugs/BUG-001.md |\n`,
    );

    const result = runSessionDelete(LEGACY_SESSION_NAME, { yes: true }, { cwd, log: silentLog });
    expect(result.indexRows).toBe(1);
    expect(result.bugRows).toBe(1);

    const content = readFileSync(indexPath, 'utf-8');
    expect(content).not.toContain(LEGACY_SESSION_NAME);
    expect(content).toContain('2026-06-01-0900-other-target');
    expect(dataLines(content).every((l) => cellCount(l) === 6)).toBe(true);
    expect(readFileSync(allBugsPath, 'utf-8')).not.toContain(LEGACY_SESSION_NAME);
  });
});
