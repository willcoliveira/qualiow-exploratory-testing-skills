/**
 * Session lifecycle: what finalize cross-checks before it indexes a session, and
 * how the index files are written.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runSessionFinalize } from '../../src/cli/commands/session.js';
import { compareBugIds } from '../../src/utils/parse-session.js';
import {
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
