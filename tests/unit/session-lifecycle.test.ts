/**
 * Session lifecycle: what finalize cross-checks before it indexes a session, and
 * how the index files are written.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runSessionFinalize } from '../../src/cli/commands/session.js';
import { compareBugIds } from '../../src/utils/parse-session.js';
import {
  C2_NAME,
  CANONICAL_FIXTURE,
  CANONICAL_NAME,
  cleanup,
  copySession,
  editStats,
  silentLog,
} from './contract2-helpers.js';

const registry: string[] = [];
afterEach(() => cleanup(registry));

const allBugsPathOf = (cwd: string) => join(cwd, 'output', 'bugs', 'all-bugs.md');

/** The canonical (contract-1) fixture, copied. */
function canonicalCopy() {
  return copySession(registry, CANONICAL_FIXTURE, CANONICAL_NAME);
}

/** Adds bug files cloned from BUG-001 under new ids and keeps stats.json in step. */
function addBugs(sessionDir: string, ids: string[]): void {
  const source = readFileSync(join(sessionDir, 'bugs', 'BUG-001.md'), 'utf-8');
  for (const id of ids) {
    writeFileSync(join(sessionDir, 'bugs', `${id}.md`), source.replace('# BUG-001:', `# ${id}:`));
  }
  editStats(sessionDir, (s) => {
    s.bugs_found = (s.bugs_found as number) + ids.length;
    const counts = s.severity_counts as Record<string, number>;
    counts.high += ids.length;
  });
}

describe('finalize — bug id order', () => {
  it('compareBugIds orders by number, not by string', () => {
    const ids = ['BUG-1000', 'BUG-010', 'BUG-999', 'BUG-002', 'BUG-R2-010', 'BUG-R2-002'];
    expect([...ids].sort(compareBugIds)).toEqual([
      'BUG-002',
      'BUG-010',
      'BUG-999',
      'BUG-1000',
      'BUG-R2-002',
      'BUG-R2-010',
    ]);
  });

  it('appends all-bugs rows in numeric id order past BUG-999', async () => {
    const { cwd, sessionDir } = canonicalCopy();
    addBugs(sessionDir, ['BUG-1000', 'BUG-010', 'BUG-999']);
    const result = await runSessionFinalize(CANONICAL_NAME, { redact: true }, { cwd, log: silentLog });
    expect(result.violations).toEqual([]);
    expect(result.bugRowsAdded).toEqual(['BUG-001', 'BUG-002', 'BUG-010', 'BUG-999', 'BUG-1000']);
    const ids = readFileSync(allBugsPathOf(cwd), 'utf-8')
      .split('\n')
      .filter((l) => l.startsWith('| BUG-'))
      .map((l) => l.split('|')[1].trim());
    expect(ids).toEqual(['BUG-001', 'BUG-002', 'BUG-010', 'BUG-999', 'BUG-1000']);
  });
});

describe('finalize — stats.json against the bug files', () => {
  const collect = () => {
    const lines: string[] = [];
    return { lines, log: (line: string) => void lines.push(line) };
  };

  it('contract 2: a bugs_found that disagrees with bugs/ is a violation', async () => {
    const { cwd, sessionDir } = copySession(registry);
    editStats(sessionDir, (s) => void (s.bugs_found = 4));
    const result = await runSessionFinalize(C2_NAME, { check: true }, { cwd, log: silentLog });
    expect(result.ok).toBe(false);
    expect(result.violations).toEqual([
      'stats.json bugs_found is 4, but bugs/ holds 3 bug file(s) — count the shipped bugs only (bugs/refuted/ is not counted)',
    ]);
  });

  it('contract 2: severity_counts that disagree with the bugs’ **Severity:** lines are a violation', async () => {
    const { cwd, sessionDir } = copySession(registry);
    editStats(sessionDir, (s) => void (s.severity_counts = { critical: 1, high: 0, medium: 1, low: 1 }));
    const result = await runSessionFinalize(C2_NAME, { check: true }, { cwd, log: silentLog });
    expect(result.ok).toBe(false);
    expect(result.violations).toEqual([
      'stats.json severity_counts (critical 1, high 0, medium 1, low 1) do not match the bug files ' +
        '(critical 0, high 1, medium 1, low 1)',
    ]);
  });

  it('contract 1: the same disagreement is a warning, and the session still finalizes', async () => {
    const { cwd, sessionDir } = canonicalCopy();
    editStats(sessionDir, (s) => void (s.bugs_found = 5));
    const out = collect();
    const result = await runSessionFinalize(CANONICAL_NAME, { redact: true }, { cwd, log: out.log });
    expect(result.ok).toBe(true);
    expect(result.warnings).toEqual([
      'stats.json bugs_found is 5, but bugs/ holds 2 bug file(s) — count the shipped bugs only (bugs/refuted/ is not counted)',
    ]);
    expect(out.lines.some((l) => l.includes('bugs_found is 5'))).toBe(true);
  });

  it('a session_id that is not the directory name is a warning', async () => {
    const { cwd, sessionDir } = copySession(registry);
    editStats(sessionDir, (s) => void (s.session_id = '2026-01-01-0000-explore-other'));
    const result = await runSessionFinalize(C2_NAME, { check: true }, { cwd, log: silentLog });
    expect(result.ok).toBe(true);
    expect(result.warnings).toEqual([
      `stats.json session_id is "2026-01-01-0000-explore-other", not the directory name "${C2_NAME}" — ` +
        'metrics.jsonl dedupes on it, so a copied stats.json can hide this session’s metrics line',
    ]);
  });

  it('logs when the metrics line is skipped because session_id is already recorded', async () => {
    const { cwd } = copySession(registry);
    expect((await runSessionFinalize(C2_NAME, {}, { cwd, log: silentLog })).ok).toBe(true);
    const out = collect();
    expect((await runSessionFinalize(C2_NAME, {}, { cwd, log: out.log })).ok).toBe(true);
    expect(out.lines.some((l) => l.includes(`metrics.jsonl already has a line for session_id "${C2_NAME}"`))).toBe(true);
    expect(readFileSync(join(cwd, 'output', 'metrics.jsonl'), 'utf-8').trim().split('\n')).toHaveLength(1);
  });
});

describe('finalize — session-report.md', () => {
  const report = (sessionDir: string) => join(sessionDir, 'session-report.md');
  const MISSING =
    'session-report.md is missing — the INDEX.md row points at it; write it (the qa-reporting-agent assembles it) and re-run finalize';

  it('contract 2: a missing session-report.md is a violation, and no index row points at it', async () => {
    const { cwd, sessionDir } = copySession(registry);
    rmSync(report(sessionDir));
    const result = await runSessionFinalize(C2_NAME, {}, { cwd, log: silentLog });
    expect(result.ok).toBe(false);
    expect(result.violations).toEqual([MISSING]);
    expect(existsSync(join(cwd, 'output', 'sessions', 'INDEX.md'))).toBe(false);
  });

  it('contract 2: a report without the `# Session Report — <target>` heading is a violation', async () => {
    const { cwd, sessionDir } = copySession(registry);
    writeFileSync(report(sessionDir), readFileSync(report(sessionDir), 'utf-8').replace('# Session Report — Example Shop', '# Notes'));
    const result = await runSessionFinalize(C2_NAME, { check: true }, { cwd, log: silentLog });
    expect(result.ok).toBe(false);
    expect(result.violations).toEqual([
      'session-report.md does not open with `# Session Report — <target>` after the confidentiality header',
    ]);
  });

  it('contract 2: the heading is found in a CRLF report too', async () => {
    const { cwd, sessionDir } = copySession(registry);
    writeFileSync(report(sessionDir), readFileSync(report(sessionDir), 'utf-8').replace(/\n/g, '\r\n'));
    const result = await runSessionFinalize(C2_NAME, { check: true }, { cwd, log: silentLog });
    expect(result.violations).toEqual([]);
  });

  it('contract 1: a missing report is a warning, and the session still finalizes', async () => {
    const { cwd, sessionDir } = canonicalCopy();
    rmSync(report(sessionDir));
    const result = await runSessionFinalize(CANONICAL_NAME, { redact: true }, { cwd, log: silentLog });
    expect(result.ok).toBe(true);
    expect(result.warnings).toEqual([MISSING]);
  });
});
