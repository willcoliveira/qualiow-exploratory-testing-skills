/**
 * INDEX.md, all-bugs.md and metrics.jsonl are shared by every session of a project.
 * Each is rewritten whole — a temporary file renamed over it — while one advisory
 * lock under output/ is held, so a reader never sees half a file and two writers
 * never interleave a read-modify-write.
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  existsSync,
  linkSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { runSessionFinalize } from '../../src/cli/commands/session.js';
import { ALL_BUGS_MD_HEADER, INDEX_MD_HEADER } from '../../src/utils/index-files.js';
import { INDEX_LOCK_FILE, indexLockTiming, withIndexLock, writeFileAtomic } from '../../src/utils/locked-write.js';
import { C2_NAME, cleanup, copySession, makeTmpRoot, silentLog } from './contract2-helpers.js';

const registry: string[] = [];
const timing = { ...indexLockTiming };
afterEach(() => {
  Object.assign(indexLockTiming, timing);
  cleanup(registry);
});

const OTHER_ROW = '| 2026-10-01 | explore | other | 0 | 10 min | complete | 2026-10-01-0900-explore-other/session-report.md |';
const OTHER_BUG_ROW = '| BUG-001 | 2026-10-01-0900-explore-other | [X] y | Low | open | 2026-10-01-0900-explore-other/bugs/BUG-001.md |';

function project() {
  const p = copySession(registry);
  const output = join(p.cwd, 'output');
  mkdirSync(join(output, 'bugs'), { recursive: true });
  const files = {
    index: join(output, 'sessions', 'INDEX.md'),
    bugs: join(output, 'bugs', 'all-bugs.md'),
    metrics: join(output, 'metrics.jsonl'),
    lock: join(output, INDEX_LOCK_FILE),
  };
  writeFileSync(files.index, `${INDEX_MD_HEADER}${OTHER_ROW}\n`);
  writeFileSync(files.bugs, `${ALL_BUGS_MD_HEADER}${OTHER_BUG_ROW}\n`);
  writeFileSync(files.metrics, '{"session_id":"2026-10-01-0900-explore-other"}\n');
  return { ...p, output, files };
}

const leftovers = (dir: string) => readdirSync(dir).filter((n) => n.endsWith('.tmp') || n === INDEX_LOCK_FILE);

describe('finalize writes the index files atomically', () => {
  it('replaces INDEX.md, all-bugs.md and metrics.jsonl by rename and leaves no temporary or lock file', async () => {
    const { cwd, output, files } = project();
    const before = { index: statSync(files.index).ino, bugs: statSync(files.bugs).ino, metrics: statSync(files.metrics).ino };
    expect((await runSessionFinalize(C2_NAME, {}, { cwd, log: silentLog })).ok).toBe(true);

    expect(statSync(files.index).ino).not.toBe(before.index);
    expect(statSync(files.bugs).ino).not.toBe(before.bugs);
    expect(statSync(files.metrics).ino).not.toBe(before.metrics);
    expect(readFileSync(files.index, 'utf-8')).toContain(`${C2_NAME}/session-report.md`);
    const metrics = readFileSync(files.metrics, 'utf-8').split('\n');
    expect(metrics[0]).toBe('{"session_id":"2026-10-01-0900-explore-other"}');
    expect(JSON.parse(metrics[1]).session_id).toBe(C2_NAME);
    for (const dir of [output, join(output, 'sessions'), join(output, 'bugs')]) expect(leftovers(dir)).toEqual([]);
  });

  it.skipIf(process.platform === 'win32')('refuses to write through a symbolic link at INDEX.md', async () => {
    const { cwd, files } = project();
    const elsewhere = join(makeTmpRoot('qualiow-elsewhere-', registry), 'INDEX.md');
    writeFileSync(elsewhere, `${INDEX_MD_HEADER}${OTHER_ROW}\n`);
    rmSync(files.index);
    symlinkSync(elsewhere, files.index);

    await expect(runSessionFinalize(C2_NAME, {}, { cwd, log: silentLog })).rejects.toThrow(/INDEX\.md is a symbolic link/);
    expect(readFileSync(elsewhere, 'utf-8')).toBe(`${INDEX_MD_HEADER}${OTHER_ROW}\n`);
  });
});

describe('finalize holds the index lock', () => {
  it('waits for a lock another run holds, then fails without touching the index files', async () => {
    const { cwd, files } = project();
    indexLockTiming.waitMs = 150;
    writeFileSync(files.lock, '12345 2026-10-28T00:00:00.000Z\n');
    const index = readFileSync(files.index, 'utf-8');

    await expect(runSessionFinalize(C2_NAME, {}, { cwd, log: silentLog })).rejects.toThrow(
      /Another qualiow command is updating the index files/,
    );
    expect(readFileSync(files.index, 'utf-8')).toBe(index);
    expect(existsSync(files.lock)).toBe(true);
  });

  it('takes over a lock older than the stale timeout, and releases it', async () => {
    const { cwd, files } = project();
    writeFileSync(files.lock, '12345 2026-10-28T00:00:00.000Z\n');
    const past = new Date(Date.now() - 10 * 60 * 1000);
    utimesSync(files.lock, past, past);

    expect((await runSessionFinalize(C2_NAME, {}, { cwd, log: silentLog })).ok).toBe(true);
    expect(readFileSync(files.index, 'utf-8')).toContain(`${C2_NAME}/session-report.md`);
    expect(existsSync(files.lock)).toBe(false);
  });
});

describe('withIndexLock / writeFileAtomic', () => {
  it('is re-entrant within one process and always releases', () => {
    const dir = makeTmpRoot('qualiow-lock-', registry);
    const lock = join(dir, INDEX_LOCK_FILE);
    const value = withIndexLock(dir, () => withIndexLock(dir, () => (existsSync(lock) ? 'held' : 'free')));
    expect(value).toBe('held');
    expect(existsSync(lock)).toBe(false);
    expect(() => withIndexLock(dir, () => { throw new Error('boom'); })).toThrow('boom');
    expect(existsSync(lock)).toBe(false);
  });

  it('writes a new file and replaces an existing one, refusing a hard link', () => {
    const dir = makeTmpRoot('qualiow-atomic-', registry);
    const path = join(dir, 'all-bugs.md');
    writeFileAtomic(path, 'one\n');
    writeFileAtomic(path, 'two\n');
    expect(readFileSync(path, 'utf-8')).toBe('two\n');
    expect(leftovers(dir)).toEqual([]);
    linkSync(path, join(dir, 'copy.md'));
    expect(() => writeFileAtomic(path, 'three\n')).toThrow(/all-bugs\.md is a hard link/);
    expect(readFileSync(join(dir, 'copy.md'), 'utf-8')).toBe('two\n');
  });
});
