/**
 * Containment for paths a session names: the evidence files a contract-2
 * `stats.json` cites, and the session files the CLI reads on the session's
 * behalf. Shared with the decision-model triage (`src/triage/triage.ts`).
 *
 * Every check is made on what is on disk, not on how the path is spelled: the
 * real path (with the on-disk case, `realpathSync.native`) must sit inside the
 * real session directory, and the top-level directory is read from it. A link
 * is never followed into a citation, and a file with a second hard link is
 * refused, since either lets one file stand in for another.
 */

import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, join, relative, sep } from 'node:path';

/** `rel` of `abs` inside `root`, '/'-separated, or null when it is not inside. */
export function relInside(root: string, abs: string): string | null {
  const rel = relative(root, abs);
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return null;
  return rel.split(sep).join('/');
}

/**
 * True when any segment of `p` is `.auth` (a storage state or browser profile), in any
 * case — a case-insensitive file system resolves `.AUTH/` to the same directory.
 */
export const isAuthPath = (p: string): boolean => p.split(/[\\/]/).some((s) => s.toLowerCase() === '.auth');

// ─── Evidence ────────────────────────────────────────────────────────

/** Top-level session directories a contract-2 area may cite, exact case. */
export const EVIDENCE_DIRS = ['screenshots', 'videos', 'traces', 'logs', 'evidence'] as const;
/** Where the per-area `A<N>-…` file must live. */
export const AREA_EVIDENCE_DIRS = ['screenshots', 'evidence'] as const;
/** Segments never cited, compared case-folded (a case-insensitive disk serves `.AUTH/` as `.auth/`). */
const DENIED_SEGMENTS = new Set(['.auth', 'snapshots']);

export const MAX_EVIDENCE_PATH_CHARS = 200;
export const MAX_AREAS = 40;
export const MAX_EVIDENCE_PER_AREA = 20;
export const MAX_EVIDENCE_TOTAL = 400;

export type EvidenceResult =
  | {
      ok: true;
      /** Path inside the real session directory, '/'-separated, on-disk case. */
      rel: string;
      /** Its top-level directory, one of `EVIDENCE_DIRS`. */
      top: string;
      /** Its file name, on-disk case. */
      base: string;
      size: number;
    }
  | { ok: false; reason: string };

function deniedSegment(p: string): string | undefined {
  return p.split('/').find((seg) => DENIED_SEGMENTS.has(seg.toLowerCase()));
}

/**
 * Resolves one evidence path a contract-2 area cites, relative to the session
 * directory. Refused, with the reason: anything but a printable-ASCII relative
 * path of at most 200 characters with no `\`, `:`, `.` or `..` segment; a path
 * under `.auth/` or `snapshots/` (any case); a missing, empty, non-regular,
 * symbolically linked or hard-linked file; a path whose real location is
 * outside the session or outside `screenshots/ videos/ traces/ logs/ evidence/`.
 */
export function resolveEvidence(sessionDir: string, p: unknown): EvidenceResult {
  const refuse = (reason: string): EvidenceResult => ({ ok: false, reason });
  if (typeof p !== 'string' || p.length === 0) return refuse('is not a path');
  if (p.length > MAX_EVIDENCE_PATH_CHARS) return refuse(`is longer than ${MAX_EVIDENCE_PATH_CHARS} characters`);
  // Printable ASCII only: no NUL, no control character, nothing non-ASCII.
  if (/[^\x20-\x7e]/.test(p)) return refuse('contains a control or non-ASCII character');
  if (p.includes('\\')) return refuse('contains a backslash');
  if (p.includes(':')) return refuse('contains a colon');
  if (p.startsWith('/')) return refuse('is absolute — cite it relative to the session directory');
  if (p.startsWith('~')) return refuse('starts with ~ — cite it relative to the session directory');
  const segments = p.split('/');
  if (segments.some((s) => s === '' || s === '.' || s === '..')) {
    return refuse('has an empty, "." or ".." segment');
  }
  const denied = deniedSegment(p);
  if (denied) return refuse(`is under ${denied.toLowerCase()}/, which is never evidence`);

  let realSession: string;
  try {
    realSession = realpathSync.native(sessionDir);
  } catch {
    return refuse('cannot be checked: the session directory is unreadable');
  }
  const abs = join(realSession, ...segments);

  let st: ReturnType<typeof lstatSync>;
  try {
    st = lstatSync(abs);
  } catch {
    return refuse('does not exist');
  }
  if (st.isSymbolicLink()) {
    let target: string | null = null;
    try {
      target = relInside(realSession, realpathSync.native(abs));
    } catch {
      /* a dangling link */
    }
    return refuse(
      target === null
        ? 'is a symbolic link leading out of the session — cite a real file'
        : 'is a symbolic link — cite the file itself',
    );
  }
  if (!st.isFile()) return refuse('is not a regular file');
  if (st.nlink > 1) return refuse('is a hard link — cite a file with a single link');
  if (st.size === 0) return refuse('is an empty file');

  let real: string;
  try {
    real = realpathSync.native(abs);
  } catch {
    return refuse('does not exist');
  }
  const rel = relInside(realSession, real);
  if (rel === null) return refuse('leads out of the session directory');
  const realDenied = deniedSegment(rel);
  if (realDenied) return refuse(`is under ${realDenied.toLowerCase()}/, which is never evidence`);
  const relSegments = rel.split('/');
  const top = relSegments[0];
  if (relSegments.length < 2 || !(EVIDENCE_DIRS as readonly string[]).includes(top)) {
    return refuse(`is not under ${EVIDENCE_DIRS.map((d) => `${d}/`).join(' ')}`);
  }
  return { ok: true, rel, top, base: relSegments[relSegments.length - 1], size: st.size };
}

// ─── Contained reads ─────────────────────────────────────────────────

/**
 * Reads at most `maxBytes` of a regular file. Returns null for anything that
 * is not one (checked before opening, so a FIFO never blocks, and again on
 * the open descriptor).
 */
export function readCapped(path: string, maxBytes: number): { text: string; partial: boolean } | null {
  if (!statSync(path).isFile()) return null;
  const fd = openSync(path, constants.O_RDONLY | (constants.O_NONBLOCK ?? 0));
  try {
    const st = fstatSync(fd);
    if (!st.isFile()) return null;
    const want = Math.min(st.size, maxBytes);
    const buf = Buffer.alloc(want);
    let got = 0;
    while (got < want) {
      const n = readSync(fd, buf, got, want - got, got);
      if (n === 0) break;
      got += n;
    }
    return { text: buf.subarray(0, got).toString('utf-8'), partial: st.size > maxBytes };
  } finally {
    closeSync(fd);
  }
}

/**
 * A text file of the session read under containment — real path inside the
 * real session directory, never under `.auth/`, a regular file, at most
 * `maxBytes` — or null.
 */
export function readContainedText(sessionDir: string, rel: string, maxBytes: number): string | null {
  try {
    // `.native` returns the on-disk case, so the `.auth` check sees what the disk holds.
    const realSession = realpathSync.native(sessionDir);
    const real = realpathSync.native(join(sessionDir, rel));
    if (relInside(realSession, real) === null || isAuthPath(real)) return null;
    if (lstatSync(real).nlink > 1) return null;
    return readCapped(real, maxBytes)?.text ?? null;
  } catch {
    return null;
  }
}
