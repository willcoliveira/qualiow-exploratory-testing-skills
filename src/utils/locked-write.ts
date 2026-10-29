/**
 * Writes to the files every session of a project shares — `output/sessions/INDEX.md`,
 * `output/bugs/all-bugs.md` and `output/metrics.jsonl`.
 *
 * Each is changed by reading it, editing it and writing it back. Two `qualiow` runs
 * doing that at once (two sessions finalizing, a prune beside a finalize) would each
 * write back a copy without the other's rows, and a reader catching a file mid-write
 * would see half of it. So every such change runs under one advisory lock file in
 * `output/`, created with O_EXCL, and every write is a temporary file renamed over
 * the target.
 */

import { randomBytes } from 'node:crypto';
import { closeSync, lstatSync, mkdirSync, openSync, renameSync, rmSync, statSync, writeSync } from 'node:fs';
import { basename, resolve } from 'node:path';

/** The lock file, in `output/`. Present only while a run is changing an index file. */
export const INDEX_LOCK_FILE = '.qualiow-index.lock';

/**
 * Lock timing. A lock older than `staleMs` belongs to a run that died before releasing
 * it and is taken over; a live one is waited on for up to `waitMs`. Mutable for tests.
 */
export const indexLockTiming = { staleMs: 10_000, waitMs: 5_000, pollMs: 50 };

/** Lock files this process holds, so a nested call under the same lock does not wait on itself. */
const held = new Set<string>();

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Runs `fn` while holding the index lock in `outputDir`, creating the directory if it
 * is missing. Re-entrant within one process. The lock is released on every exit path.
 * Throws, naming the lock file, when another run holds a live lock past the wait.
 */
export function withIndexLock<T>(outputDir: string, fn: () => T): T {
  const lockPath = resolve(outputDir, INDEX_LOCK_FILE);
  if (held.has(lockPath)) return fn();
  mkdirSync(outputDir, { recursive: true });

  const deadline = Date.now() + indexLockTiming.waitMs;
  for (;;) {
    try {
      const fd = openSync(lockPath, 'wx', 0o644);
      try {
        writeSync(fd, `${process.pid} ${new Date().toISOString()}\n`);
      } finally {
        closeSync(fd);
      }
      break;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    }
    let ageMs: number;
    try {
      ageMs = Date.now() - statSync(lockPath).mtimeMs;
    } catch {
      continue; // released between the open and the stat: try again
    }
    if (ageMs > indexLockTiming.staleMs) {
      rmSync(lockPath, { force: true });
      continue;
    }
    if (Date.now() >= deadline) {
      throw new Error(
        `Another qualiow command is updating the index files (lock ${lockPath}). ` +
          'Re-run this once it has finished; if no qualiow command is running, delete the lock file.',
      );
    }
    sleepSync(indexLockTiming.pollMs);
  }

  held.add(lockPath);
  try {
    return fn();
  } finally {
    held.delete(lockPath);
    rmSync(lockPath, { force: true });
  }
}

/**
 * Atomic, link-safe write: the target must be absent or a regular file with one link;
 * the content goes to a fresh `<file>.<pid>.<random>.tmp` opened with `wx`, which is then
 * renamed over the target — a rename replaces a link, it never writes through one.
 */
export function writeFileAtomic(path: string, content: string): void {
  let st: ReturnType<typeof lstatSync> | undefined;
  try {
    st = lstatSync(path);
  } catch {
    st = undefined;
  }
  if (st?.isSymbolicLink()) throw new Error(`Refusing to write: ${basename(path)} is a symbolic link`);
  if (st && !st.isFile()) throw new Error(`Refusing to write: ${basename(path)} is not a regular file`);
  if (st && st.nlink > 1) throw new Error(`Refusing to write: ${basename(path)} is a hard link`);

  const tmp = `${path}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  const fd = openSync(tmp, 'wx', 0o644);
  try {
    writeSync(fd, content);
  } catch (err) {
    closeSync(fd);
    rmSync(tmp, { force: true });
    throw err;
  }
  closeSync(fd);
  try {
    renameSync(tmp, path);
  } catch (err) {
    rmSync(tmp, { force: true });
    throw err;
  }
}
