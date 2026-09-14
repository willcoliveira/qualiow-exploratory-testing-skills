/**
 * A hand-maintained INDEX.md can carry blank lines between its rows, which splits
 * one markdown table into several one-row blocks: a reader stops at the first
 * blank line, so the rows under it are on disk and invisible. Finalize must write
 * its row next to the last row rather than at end of file, report the rows a
 * reader cannot see, and `session repair-index` must close the gap without
 * touching anything else in the file.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  runSessionFinalize,
  runSessionRepairIndex,
  sessionCommand,
} from '../../src/cli/commands/session.js';
import { readSessionIndex } from '../../src/cli/commands/list.js';
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

const TABLE_HEAD =
  '# Exploratory Testing Sessions\n\n' +
  '_Index of exploratory testing sessions. Newest last._\n\n' +
  '| Date | Target | Bugs | Duration | Status | Report |\n' +
  '|---|---|---|---|---|---|\n';

const ROW_1 = '| 2026-05-22 | demo-target | 7 | ~75 min | complete | 2026-05-22-1045-demo-target/session-report.md |';
const ROW_2 = '| 2026-06-01 | demo-target | 1 | ~20 min | complete | 2026-06-01-0900-demo-target/session-report.md |';
/** A row someone typed a stray pipe into: seven cells in a six-column table. */
const ROW_3_STRAY_PIPE = '| 2026-08-13 | demo-target | staging | 3 | ~40 min | complete | 2026-08-13-1100-demo-target/session-report.md |';
const ROW_4 = '| 2026-08-26 | demo-target | 2 | ~30 min | complete | 2026-08-26-1400-demo-target/session-report.md |';

/** Rows 1-2 contiguous, then a blank line around each of the rest, including at EOF. */
const SPLIT_INDEX = `${TABLE_HEAD}${ROW_1}\n${ROW_2}\n\n${ROW_3_STRAY_PIPE}\n\n${ROW_4}\n\n`;
/** What repairing SPLIT_INDEX produces: the trailing blank line is not between rows. */
const MERGED_INDEX = `${TABLE_HEAD}${ROW_1}\n${ROW_2}\n${ROW_3_STRAY_PIPE}\n${ROW_4}\n\n`;
/** A file that was never split. */
const WELL_FORMED_INDEX = `${TABLE_HEAD}${ROW_1}\n${ROW_2}\n${ROW_3_STRAY_PIPE}\n${ROW_4}\n`;

const tmpDirs: string[] = [];

function makeTmpCwd(): string {
  const dir = mkdtempSync(join(tmpdir(), 'qualiow-repair-'));
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

function writeIndex(cwd: string, content: string): string {
  const path = indexPathOf(cwd);
  mkdirSync(join(cwd, 'output', 'sessions'), { recursive: true });
  writeFileSync(path, content);
  return path;
}

/** A copy of the canonical session fixture under a fresh working directory. */
function makeTmpSessionCwd(): string {
  const cwd = makeTmpCwd();
  cpSync(CANONICAL_SESSION_DIR, join(cwd, 'output', 'sessions', SESSION_NAME), { recursive: true });
  return cwd;
}

const NEW_ROW = `| 2026-09-08 | Example App | 2 | 42 min | complete | ${SESSION_NAME}/session-report.md |`;

// ─── finalize writes next to the last row ───────────────────────────

describe('runSessionFinalize — a table split into blocks by blank lines', () => {
  it('writes the row directly after the last existing row, not at end of file', async () => {
    const cwd = makeTmpSessionCwd();
    const indexPath = writeIndex(cwd, SPLIT_INDEX);

    const result = await runSessionFinalize('latest', { redact: true }, { cwd, log: silentLog });
    expect(result.ok).toBe(true);
    expect(result.indexRowAdded).toBe(true);

    // Directly after ROW_4, above the blank line that ends the file — an append
    // at EOF would have put it below that blank line, in a block of its own.
    expect(readFileSync(indexPath, 'utf-8')).toBe(
      `${TABLE_HEAD}${ROW_1}\n${ROW_2}\n\n${ROW_3_STRAY_PIPE}\n\n${ROW_4}\n${NEW_ROW}\n\n`,
    );
  });

  it('reports the rows a reader cannot see, counted from the file', async () => {
    const cwd = makeTmpSessionCwd();
    writeIndex(cwd, SPLIT_INDEX);

    const lines: string[] = [];
    await runSessionFinalize('latest', { redact: true }, { cwd, log: (l) => lines.push(l) });

    // 5 rows on disk after the append, 2 of them in the first block.
    const notice = lines.find((l) => l.includes('outside the first table block'));
    expect(notice).toBeDefined();
    expect(notice).toContain('INDEX.md has 3 row(s)');
    expect(notice).toContain('readers see 2 of 5');
    expect(notice).toContain('qualiow session repair-index');
  });

  it('makes every row visible to readSessionIndex after repair-index --yes', async () => {
    const cwd = makeTmpSessionCwd();
    const indexPath = writeIndex(cwd, SPLIT_INDEX);
    await runSessionFinalize('latest', { redact: true }, { cwd, log: silentLog });

    expect(readSessionIndex(indexPath)).toHaveLength(2);

    runSessionRepairIndex({ yes: true }, { cwd, log: silentLog });

    const rows = readSessionIndex(indexPath);
    expect(rows).toHaveLength(5);
    expect(rows.map((r) => r.date)).toEqual([
      '2026-05-22',
      '2026-06-01',
      '2026-08-13',
      '2026-08-26',
      '2026-09-08',
    ]);
    expect(rows[4].report).toBe(`${SESSION_NAME}/session-report.md`);
  });

  it('does not write a second copy of the row when run again on a split table', async () => {
    const cwd = makeTmpSessionCwd();
    const indexPath = writeIndex(cwd, SPLIT_INDEX);

    await runSessionFinalize('latest', { redact: true }, { cwd, log: silentLog });
    const afterFirst = readFileSync(indexPath, 'utf-8');

    const second = await runSessionFinalize('latest', {}, { cwd, log: silentLog });
    expect(second.indexRowAdded).toBe(false);
    expect(readFileSync(indexPath, 'utf-8')).toBe(afterFirst);
  });

  it('appends to a well-formed table exactly as before', async () => {
    const cwd = makeTmpSessionCwd();
    const indexPath = writeIndex(cwd, WELL_FORMED_INDEX);

    const lines: string[] = [];
    await runSessionFinalize('latest', { redact: true }, { cwd, log: (l) => lines.push(l) });

    expect(readFileSync(indexPath, 'utf-8')).toBe(`${WELL_FORMED_INDEX}${NEW_ROW}\n`);
    expect(lines.some((l) => l.includes('outside the first table block'))).toBe(false);
  });

  it('appends to a freshly created index exactly as before', async () => {
    const cwd = makeTmpSessionCwd();
    const indexPath = writeIndex(cwd, INDEX_MD_HEADER);

    await runSessionFinalize('latest', { redact: true }, { cwd, log: silentLog });

    expect(readFileSync(indexPath, 'utf-8')).toBe(
      `${INDEX_MD_HEADER}| 2026-09-08 | explore | Example App | 2 | 42 min | complete | ${SESSION_NAME}/session-report.md |\n`,
    );
  });
});

// ─── repair-index ───────────────────────────────────────────────────

describe('runSessionRepairIndex', () => {
  it('is registered in the session command group with a --yes flag', () => {
    const sub = sessionCommand().commands.find((c) => c.name() === 'repair-index');
    expect(sub).toBeDefined();
    expect(sub!.options.some((o) => o.long === '--yes')).toBe(true);
  });

  it('dry run (default) writes nothing and reports the counts', () => {
    const cwd = makeTmpCwd();
    const indexPath = writeIndex(cwd, SPLIT_INDEX);

    const lines: string[] = [];
    const result = runSessionRepairIndex({}, { cwd, log: (l) => lines.push(l) });

    expect(result.dryRun).toBe(true);
    expect(result.files).toEqual([
      { file: 'INDEX.md', blankLines: 2, hiddenRows: 2, repaired: false },
    ]);
    expect(lines.some((l) => l.includes('2 blank line(s)') && l.includes('2 row(s) would become visible'))).toBe(true);
    expect(readFileSync(indexPath, 'utf-8')).toBe(SPLIT_INDEX);
  });

  it('--yes merges the blocks and leaves every row byte-identical', () => {
    const cwd = makeTmpCwd();
    const indexPath = writeIndex(cwd, SPLIT_INDEX);

    const result = runSessionRepairIndex({ yes: true }, { cwd, log: silentLog });

    expect(result.files[0].repaired).toBe(true);
    expect(readFileSync(indexPath, 'utf-8')).toBe(MERGED_INDEX);
    expect(readSessionIndex(indexPath)).toHaveLength(4);
  });

  it('leaves a row carrying a stray pipe exactly as it was', () => {
    const cwd = makeTmpCwd();
    const indexPath = writeIndex(cwd, SPLIT_INDEX);

    runSessionRepairIndex({ yes: true }, { cwd, log: silentLog });

    const lines = readFileSync(indexPath, 'utf-8').split('\n');
    expect(lines).toContain(ROW_3_STRAY_PIPE);
    expect(lines.filter((l) => l.startsWith('| 2026-08-13'))).toHaveLength(1);
  });

  it('is idempotent: a second --yes reports nothing to do and changes nothing', () => {
    const cwd = makeTmpCwd();
    const indexPath = writeIndex(cwd, SPLIT_INDEX);
    runSessionRepairIndex({ yes: true }, { cwd, log: silentLog });
    const afterFirst = readFileSync(indexPath, 'utf-8');

    const lines: string[] = [];
    const second = runSessionRepairIndex({ yes: true }, { cwd, log: (l) => lines.push(l) });

    expect(second.files).toEqual([
      { file: 'INDEX.md', blankLines: 0, hiddenRows: 0, repaired: false },
    ]);
    expect(lines.some((l) => l.includes('nothing to repair'))).toBe(true);
    expect(readFileSync(indexPath, 'utf-8')).toBe(afterFirst);
  });

  it('preserves blank lines that are not between two table rows', () => {
    const cwd = makeTmpCwd();
    // Blank lines before the table (title, note) and two at end of file.
    const content = `${TABLE_HEAD}${ROW_1}\n\n${ROW_2}\n\n\n`;
    const indexPath = writeIndex(cwd, content);

    runSessionRepairIndex({ yes: true }, { cwd, log: silentLog });

    expect(readFileSync(indexPath, 'utf-8')).toBe(`${TABLE_HEAD}${ROW_1}\n${ROW_2}\n\n\n`);
  });

  it('repairs all-bugs.md the same way', () => {
    const cwd = makeTmpCwd();
    const bugRow1 = '| BUG-001 | 2026-05-22-1045-demo-target | [Checkout] Total is wrong | High | open | 2026-05-22-1045-demo-target/bugs/BUG-001.md |';
    const bugRow2 = '| BUG-002 | 2026-05-22-1045-demo-target | [Login] Session drops | Medium | open | 2026-05-22-1045-demo-target/bugs/BUG-002.md |';
    const allBugsPath = allBugsPathOf(cwd);
    mkdirSync(join(cwd, 'output', 'bugs'), { recursive: true });
    writeFileSync(allBugsPath, `${ALL_BUGS_MD_HEADER}${bugRow1}\n\n${bugRow2}\n`);

    const result = runSessionRepairIndex({ yes: true }, { cwd, log: silentLog });

    expect(result.files).toEqual([
      { file: 'all-bugs.md', blankLines: 1, hiddenRows: 1, repaired: true },
    ]);
    expect(readFileSync(allBugsPath, 'utf-8')).toBe(`${ALL_BUGS_MD_HEADER}${bugRow1}\n${bugRow2}\n`);
  });

  it('leaves a second table under its own heading alone', () => {
    const cwd = makeTmpCwd();
    const second = '## Archived\n\n| Date | Note |\n|---|---|\n| 2026-01-01 | kept |\n\n| 2026-02-01 | kept |\n';
    const indexPath = writeIndex(cwd, `${SPLIT_INDEX}${second}`);

    const result = runSessionRepairIndex({ yes: true }, { cwd, log: silentLog });

    expect(result.files[0].blankLines).toBe(2);
    expect(readFileSync(indexPath, 'utf-8')).toBe(`${MERGED_INDEX}${second}`);
  });

  it('says so when there is no index file at all', () => {
    const cwd = makeTmpCwd();
    const lines: string[] = [];
    const result = runSessionRepairIndex({}, { cwd, log: (l) => lines.push(l) });

    expect(result.files).toEqual([]);
    expect(lines.some((l) => l.includes('No output/sessions/INDEX.md'))).toBe(true);
  });
});
