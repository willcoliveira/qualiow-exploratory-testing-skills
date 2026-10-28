/**
 * How finalize, archive, delete and prune write output/sessions/INDEX.md,
 * output/bugs/all-bugs.md and output/metrics.jsonl.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runSessionFinalize } from '../../src/cli/commands/session.js';
import { INDEX_MD_HEADER } from '../../src/utils/index-files.js';
import { C2_NAME, cleanup, copySession, silentLog } from './contract2-helpers.js';

const registry: string[] = [];
afterEach(() => cleanup(registry));

const indexPathOf = (cwd: string) => join(cwd, 'output', 'sessions', 'INDEX.md');
const OTHER_ROW = '| 2026-10-01 | explore | other | 0 | 10 min | complete | 2026-10-01-0900-explore-other/session-report.md |';

describe('index rows — a file without a trailing newline', () => {
  it('a row appended to a file with no table starts on its own line', async () => {
    const { cwd } = copySession(registry);
    writeFileSync(indexPathOf(cwd), '# Exploratory Testing Sessions');
    expect((await runSessionFinalize(C2_NAME, {}, { cwd, log: silentLog })).ok).toBe(true);
    const lines = readFileSync(indexPathOf(cwd), 'utf-8').split('\n');
    expect(lines[0]).toBe('# Exploratory Testing Sessions');
    expect(lines[1].startsWith(`| 2026-10-05 | explore |`)).toBe(true);
  });

  it('a row inserted after the last table line leaves the file ending in a newline', async () => {
    const { cwd } = copySession(registry);
    writeFileSync(indexPathOf(cwd), `${INDEX_MD_HEADER}${OTHER_ROW}`);
    expect((await runSessionFinalize(C2_NAME, {}, { cwd, log: silentLog })).ok).toBe(true);
    const text = readFileSync(indexPathOf(cwd), 'utf-8');
    expect(text.endsWith('\n')).toBe(true);
    expect(text.split('\n').filter((l) => l.startsWith('| 2026-'))).toEqual([
      OTHER_ROW,
      expect.stringContaining(`${C2_NAME}/session-report.md`),
    ]);
  });
});
