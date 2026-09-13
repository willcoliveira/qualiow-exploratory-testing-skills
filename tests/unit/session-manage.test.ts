import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runSessionArchive, runSessionDelete, runSessionPrune } from '../../src/cli/commands/session.js';
import { INDEX_MD_HEADER, ALL_BUGS_MD_HEADER } from '../../src/utils/index-files.js';

const tmpDirs: string[] = [];

function makeTmpCwd(): string {
  const dir = mkdtempSync(join(tmpdir(), 'qualiow-session-manage-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tmpDirs.length) {
    rmSync(tmpDirs.pop()!, { recursive: true, force: true });
  }
});

const silentLog = () => {};

/** Fabricates a minimal session directory plus matching INDEX.md / all-bugs.md rows. */
function fabricateSession(cwd: string, name: string): { sessionDir: string; indexPath: string; allBugsPath: string } {
  const sessionsDir = join(cwd, 'output', 'sessions');
  const sessionDir = join(sessionsDir, name);
  mkdirSync(join(sessionDir, 'bugs'), { recursive: true });
  writeFileSync(join(sessionDir, 'session-report.md'), '# Session Report\n');
  writeFileSync(join(sessionDir, 'bugs', 'BUG-001.md'), '# BUG-001\n');

  const indexPath = join(sessionsDir, 'INDEX.md');
  if (!existsSync(indexPath)) writeFileSync(indexPath, INDEX_MD_HEADER);
  const indexRow = `| 2026-01-01 | explore | Example | 1 | 10 min | complete | ${name}/session-report.md |\n`;
  writeFileSync(indexPath, readFileSync(indexPath, 'utf-8') + indexRow);

  const bugsDir = join(cwd, 'output', 'bugs');
  mkdirSync(bugsDir, { recursive: true });
  const allBugsPath = join(bugsDir, 'all-bugs.md');
  if (!existsSync(allBugsPath)) writeFileSync(allBugsPath, ALL_BUGS_MD_HEADER);
  const bugRow = `| BUG-001 | ${name} | Something breaks | High | open | ${name}/bugs/BUG-001.md |\n`;
  writeFileSync(allBugsPath, readFileSync(allBugsPath, 'utf-8') + bugRow);

  return { sessionDir, indexPath, allBugsPath };
}

// ─── archive ────────────────────────────────────────────────────────

describe.skipIf(process.platform === 'win32')('runSessionArchive', () => {
  it('produces a .tar.gz next to the session directory', () => {
    const cwd = makeTmpCwd();
    const name = '2026-01-01-1000-explore-alpha';
    const { sessionDir } = fabricateSession(cwd, name);

    const result = runSessionArchive(name, {}, { cwd, log: silentLog });

    expect(result.ok).toBe(true);
    expect(result.removed).toBe(false);
    expect(existsSync(result.tarPath)).toBe(true);
    expect(result.tarPath.endsWith(`${name}.tar.gz`)).toBe(true);
    expect(statSync(result.tarPath).size).toBeGreaterThan(0);
    // Without --remove the session directory stays.
    expect(existsSync(sessionDir)).toBe(true);
  });

  it('--remove deletes the directory and marks the INDEX.md row archived', () => {
    const cwd = makeTmpCwd();
    const name = '2026-01-01-1000-explore-beta';
    const { sessionDir, indexPath } = fabricateSession(cwd, name);

    const result = runSessionArchive(name, { remove: true }, { cwd, log: silentLog });

    expect(result.ok).toBe(true);
    expect(result.removed).toBe(true);
    expect(existsSync(result.tarPath)).toBe(true);
    expect(existsSync(sessionDir)).toBe(false);

    const indexContent = readFileSync(indexPath, 'utf-8');
    const row = indexContent.split('\n').find((l) => l.includes(`${name}/`));
    expect(row).toBeDefined();
    const statusCell = row!.split('|').map((c) => c.trim())[6];
    expect(statusCell).toBe('archived');
  });
});

// ─── delete ─────────────────────────────────────────────────────────

describe('runSessionDelete', () => {
  it('dry run (default) writes nothing and reports what would be removed', () => {
    const cwd = makeTmpCwd();
    const name = '2026-01-01-1000-explore-gamma';
    const { sessionDir, indexPath, allBugsPath } = fabricateSession(cwd, name);
    const indexBefore = readFileSync(indexPath, 'utf-8');
    const allBugsBefore = readFileSync(allBugsPath, 'utf-8');

    const result = runSessionDelete(name, {}, { cwd, log: silentLog });

    expect(result.ok).toBe(true);
    expect(result.dryRun).toBe(true);
    expect(result.fileCount).toBeGreaterThan(0);
    expect(result.indexRows).toBe(1);
    expect(result.bugRows).toBe(1);

    // Nothing written.
    expect(existsSync(sessionDir)).toBe(true);
    expect(readFileSync(indexPath, 'utf-8')).toBe(indexBefore);
    expect(readFileSync(allBugsPath, 'utf-8')).toBe(allBugsBefore);
  });

  it('--yes removes the directory and both index rows', () => {
    const cwd = makeTmpCwd();
    const name = '2026-01-01-1000-explore-delta';
    const other = '2026-01-02-1000-explore-epsilon';
    const { sessionDir, indexPath, allBugsPath } = fabricateSession(cwd, name);
    fabricateSession(cwd, other);

    const result = runSessionDelete(name, { yes: true }, { cwd, log: silentLog });

    expect(result.ok).toBe(true);
    expect(result.dryRun).toBe(false);
    expect(existsSync(sessionDir)).toBe(false);

    const indexContent = readFileSync(indexPath, 'utf-8');
    expect(indexContent).not.toContain(`${name}/`);
    expect(indexContent).toContain(`${other}/`); // the other session's row survives

    const allBugsContent = readFileSync(allBugsPath, 'utf-8');
    expect(allBugsContent).not.toContain(`| ${name} |`);
    expect(allBugsContent).toContain(`| ${other} |`);
  });
});

// ─── prune ──────────────────────────────────────────────────────────

describe('runSessionPrune', () => {
  it('dry run selects only sessions older than --older-than days', () => {
    const cwd = makeTmpCwd();
    const oldName = '2026-01-01-1000-explore-old';
    const recentName = '2026-09-10-1000-explore-recent';
    const { sessionDir: oldDir } = fabricateSession(cwd, oldName);
    const { sessionDir: recentDir } = fabricateSession(cwd, recentName);
    const now = new Date(2026, 8, 13); // 2026-09-13, matches "today" in this environment

    const result = runSessionPrune(
      { olderThan: '30' },
      { cwd, log: silentLog, now },
    );

    expect(result.ok).toBe(true);
    expect(result.dryRun).toBe(true);
    expect(result.candidates).toEqual([oldName]);
    expect(result.candidates).not.toContain(recentName);
    // Dry run deletes nothing.
    expect(existsSync(oldDir)).toBe(true);
    expect(existsSync(recentDir)).toBe(true);
  });

  it('--yes deletes only the candidates and cleans up their index rows', () => {
    const cwd = makeTmpCwd();
    const oldName = '2026-01-01-1000-explore-old2';
    const recentName = '2026-09-10-1000-explore-recent2';
    const { sessionDir: oldDir, indexPath } = fabricateSession(cwd, oldName);
    const { sessionDir: recentDir } = fabricateSession(cwd, recentName);
    const now = new Date(2026, 8, 13);

    const result = runSessionPrune(
      { olderThan: 30, yes: true },
      { cwd, log: silentLog, now },
    );

    expect(result.ok).toBe(true);
    expect(result.dryRun).toBe(false);
    expect(result.candidates).toEqual([oldName]);
    expect(existsSync(oldDir)).toBe(false);
    expect(existsSync(recentDir)).toBe(true);

    const indexContent = readFileSync(indexPath, 'utf-8');
    expect(indexContent).not.toContain(`${oldName}/`);
    expect(indexContent).toContain(`${recentName}/`);
  });

  it('rejects a non-numeric --older-than', () => {
    const cwd = makeTmpCwd();
    fabricateSession(cwd, '2026-01-01-1000-explore-zeta');
    expect(() => runSessionPrune({ olderThan: 'nope' }, { cwd, log: silentLog })).toThrow(
      /--older-than/,
    );
  });
});
