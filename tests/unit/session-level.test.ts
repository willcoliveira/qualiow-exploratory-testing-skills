import { describe, it, expect, afterEach } from 'vitest';
import {
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { runSessionLevel } from '../../src/cli/commands/session.js';
import { INDEX_MD_HEADER } from '../../src/utils/index-files.js';
import {
  C2_FIXTURE,
  C2_NAME,
  C2_QUICK_FIXTURE,
  C2_QUICK_NAME,
  CANONICAL_FIXTURE,
  CANONICAL_NAME,
  cleanup,
  copySession,
  editStats,
  makeTmpRoot,
  readJson,
  silentLog,
} from './contract2-helpers.js';

const dirs: string[] = [];
afterEach(() => cleanup(dirs));

const GENERATED = ['evidence-level.md', 'backlog.md'];

/** A copy of the c2 fixture with the level, evidence-level.md and backlog.md removed. */
function unlevelled() {
  const s = copySession(dirs);
  for (const f of GENERATED) rmSync(join(s.sessionDir, f));
  editStats(s.sessionDir, (stats) => {
    delete stats.coverage_level;
  });
  return s;
}

describe('qualiow session level — read-only', () => {
  it('prints the level and writes nothing without --write', async () => {
    const { cwd, sessionDir } = unlevelled();
    const before = readdirSync(sessionDir).sort();
    const statsBefore = readFileSync(join(sessionDir, 'stats.json'), 'utf-8');
    const lines: string[] = [];
    const result = await runSessionLevel(C2_NAME, {}, { cwd, log: (l) => lines.push(l) });
    expect(result.ok).toBe(true);
    expect(result.level?.level).toBe('qualified');
    expect(result.written).toBeUndefined();
    expect(lines.join('\n')).toContain('Coverage level: qualified');
    expect(readdirSync(sessionDir).sort()).toEqual(before);
    expect(readFileSync(join(sessionDir, 'stats.json'), 'utf-8')).toBe(statsBefore);
  });

  it('exits non-zero on a contract violation, writing nothing', async () => {
    const { cwd, sessionDir } = unlevelled();
    rmSync(join(sessionDir, 'screenshots', 'A3-search.png'));
    const result = await runSessionLevel(C2_NAME, { write: true }, { cwd, log: silentLog });
    expect(result.ok).toBe(false);
    expect(result.violations).toEqual([
      expect.stringContaining('area A3 evidence "screenshots/A3-search.png" does not exist'),
      expect.stringContaining('area A3 is tested but cites no `A3-…` file'),
    ]);
    for (const f of GENERATED) expect(existsSync(join(sessionDir, f))).toBe(false);
  });

  it('refuses a contract-1 session', async () => {
    const { cwd } = copySession(dirs, CANONICAL_FIXTURE, CANONICAL_NAME);
    const result = await runSessionLevel(CANONICAL_NAME, {}, { cwd, log: silentLog });
    expect(result.ok).toBe(false);
    expect(result.violations).toEqual([expect.stringContaining('no "contract": 2')]);
  });

  it('accepts the output/sessions/<dir> path form the skills pass', async () => {
    const { cwd } = copySession(dirs);
    const result = await runSessionLevel(`output/sessions/${C2_NAME}`, {}, { cwd, log: silentLog });
    expect(result.ok).toBe(true);
  });
});

describe('qualiow session level --write', () => {
  it('writes evidence-level.md, backlog.md and coverage_level — identical to the committed fixture', async () => {
    const { cwd, sessionDir } = unlevelled();
    const result = await runSessionLevel(C2_NAME, { write: true }, { cwd, log: silentLog });
    expect(result.ok).toBe(true);
    expect(result.written).toEqual(['evidence-level.md', 'backlog.md', 'stats.json']);
    for (const f of [...GENERATED, 'stats.json']) {
      expect(readFileSync(join(sessionDir, f), 'utf-8')).toBe(readFileSync(join(C2_FIXTURE, f), 'utf-8'));
    }
    // No temporary file is left behind.
    expect(readdirSync(sessionDir).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });

  it('rewrites stats.json from its own JSON: key order kept, the directory-name kind never added', async () => {
    const { cwd, sessionDir } = unlevelled();
    editStats(sessionDir, (stats) => {
      delete stats.kind;
    });
    const keysBefore = Object.keys(readJson(join(sessionDir, 'stats.json')));
    await runSessionLevel(C2_NAME, { write: true }, { cwd, log: silentLog });
    const after = readJson(join(sessionDir, 'stats.json'));
    expect('kind' in after).toBe(false);
    expect(Object.keys(after)).toEqual([...keysBefore, 'coverage_level']);
  });

  it('replaces a stale or hand-edited coverage_level instead of refusing it', async () => {
    const { cwd, sessionDir } = copySession(dirs);
    editStats(sessionDir, (stats) => {
      stats.coverage_level = { level: 'complete', hand: 'edited' };
    });
    const result = await runSessionLevel(C2_NAME, { write: true }, { cwd, log: silentLog });
    expect(result.ok).toBe(true);
    expect(readJson(join(sessionDir, 'stats.json')).coverage_level).toEqual(readJson(join(C2_FIXTURE, 'stats.json')).coverage_level);
  });

  it('writes the quick fixture capped at qualified', async () => {
    const { cwd, sessionDir } = copySession(dirs, C2_QUICK_FIXTURE, C2_QUICK_NAME);
    const result = await runSessionLevel(C2_QUICK_NAME, { write: true }, { cwd, log: silentLog });
    expect(result.level?.level).toBe('qualified');
    expect(readFileSync(join(sessionDir, 'evidence-level.md'), 'utf-8')).toBe(
      readFileSync(join(C2_QUICK_FIXTURE, 'evidence-level.md'), 'utf-8'),
    );
  });
});

describe('qualiow session level --write — refusals [H1]', () => {
  function outsideFile(cwd: string, name: string, content: string): string {
    const dir = join(cwd, 'elsewhere');
    mkdirSync(dir, { recursive: true });
    const p = join(dir, name);
    writeFileSync(p, content);
    return p;
  }

  it('a symlinked stats.json — refused, its target untouched', async () => {
    const { cwd, sessionDir } = unlevelled();
    const target = outsideFile(cwd, 'stats.json', readFileSync(join(sessionDir, 'stats.json'), 'utf-8'));
    const original = readFileSync(target, 'utf-8');
    rmSync(join(sessionDir, 'stats.json'));
    symlinkSync(target, join(sessionDir, 'stats.json'));
    await expect(runSessionLevel(C2_NAME, { write: true }, { cwd, log: silentLog })).rejects.toThrow(
      'stats.json is a symbolic link',
    );
    expect(readFileSync(target, 'utf-8')).toBe(original);
    for (const f of GENERATED) expect(existsSync(join(sessionDir, f))).toBe(false);
  });

  it('a symlinked evidence-level.md — refused, its target untouched', async () => {
    const { cwd, sessionDir } = unlevelled();
    const target = outsideFile(cwd, 'victim.md', 'do not overwrite');
    symlinkSync(target, join(sessionDir, 'evidence-level.md'));
    await expect(runSessionLevel(C2_NAME, { write: true }, { cwd, log: silentLog })).rejects.toThrow(
      'evidence-level.md is a symbolic link',
    );
    expect(readFileSync(target, 'utf-8')).toBe('do not overwrite');
    expect(lstatSync(join(sessionDir, 'evidence-level.md')).isSymbolicLink()).toBe(true);
  });

  it('a hardlinked stats.json — refused, the other name untouched', async () => {
    const { cwd, sessionDir } = unlevelled();
    const other = join(cwd, 'other-name.json');
    linkSync(join(sessionDir, 'stats.json'), other);
    const original = readFileSync(other, 'utf-8');
    await expect(runSessionLevel(C2_NAME, { write: true }, { cwd, log: silentLog })).rejects.toThrow(
      'stats.json is a hard link',
    );
    expect(readFileSync(other, 'utf-8')).toBe(original);
  });

  it('a planted temporary file — the exclusive create fails, nothing is written through it', async () => {
    const { cwd, sessionDir } = unlevelled();
    const target = outsideFile(cwd, 'victim.md', 'do not overwrite');
    symlinkSync(target, join(sessionDir, `evidence-level.md.${process.pid}.tmp`));
    await expect(runSessionLevel(C2_NAME, { write: true }, { cwd, log: silentLog })).rejects.toThrow(/EEXIST/);
    expect(readFileSync(target, 'utf-8')).toBe('do not overwrite');
  });

  it('a finalized session (INDEX row) — refused', async () => {
    const { cwd, sessionsDir } = copySession(dirs);
    writeFileSync(
      join(sessionsDir, 'INDEX.md'),
      `${INDEX_MD_HEADER}| 2026-10-05 | explore | example-shop | 3 | 45 min | complete | ${C2_NAME}/session-report.md |\n`,
    );
    await expect(runSessionLevel(C2_NAME, { write: true }, { cwd, log: silentLog })).rejects.toThrow('is finalized');
  });

  it('a finalized session (progress.json complete) — refused', async () => {
    const { cwd, sessionDir } = copySession(dirs);
    writeFileSync(join(sessionDir, 'progress.json'), JSON.stringify({ status: 'complete' }));
    await expect(runSessionLevel(C2_NAME, { write: true }, { cwd, log: silentLog })).rejects.toThrow('is finalized');
  });

  it('a session directory that is a symbolic link under output/sessions/ is never resolved', async () => {
    const cwd = makeTmpRoot('qualiow-c2-', dirs);
    const real = copySession(dirs, C2_FIXTURE, C2_NAME, makeTmpRoot('qualiow-c2-real-', dirs)).sessionDir;
    mkdirSync(join(cwd, 'output', 'sessions'), { recursive: true });
    symlinkSync(real, join(cwd, 'output', 'sessions', C2_NAME));
    await expect(runSessionLevel(C2_NAME, { write: true }, { cwd, log: silentLog })).rejects.toThrow(/No session matches/);
  });
});
