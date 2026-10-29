/**
 * `evidence-manifest.json` — written by `qualiow session finalize` on a passing run,
 * never by hand. One row per file under the evidence directories, with its size, its
 * SHA-256 and what the secret scan could vouch for: a text file passed the scan
 * (`text-clean`); an image, video or trace archive was not read by it
 * (`binary-not-scanned`) — nobody has vouched for the pixels or for what a trace holds.
 *
 * The content is a pure function of the evidence on disk (no timestamp), so finalize
 * can rewrite it on every run and `finalize --check` can tell a stale or hand-edited
 * manifest from the one it would write.
 */

import { closeSync, lstatSync, openSync, readSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, sep } from 'node:path';
import { EVIDENCE_DIRS, isAuthPath, relInside } from '../utils/session-paths.js';

export const EVIDENCE_MANIFEST_FILE = 'evidence-manifest.json';
export const EVIDENCE_MANIFEST_GENERATOR = 'qualiow session finalize';

export type EvidenceScan = 'text-clean' | 'binary-not-scanned';

export interface EvidenceManifestEntry {
  /** Relative to the session directory, `/`-separated. */
  path: string;
  size: number;
  sha256: string;
  scan: EvidenceScan;
}

export interface EvidenceManifest {
  generated_by: typeof EVIDENCE_MANIFEST_GENERATOR;
  files: EvidenceManifestEntry[];
}

export interface EvidenceCandidate {
  /** Path read from disk. */
  path: string;
  /** Path relative to the session, platform separators. */
  rel: string;
}

const HASH_CHUNK_BYTES = 1024 * 1024;

/** SHA-256 and byte count of a file, read in chunks so a long video is never held whole. */
function hashFile(path: string): { sha256: string; size: number } {
  const hash = createHash('sha256');
  const buf = Buffer.alloc(HASH_CHUNK_BYTES);
  const fd = openSync(path, 'r');
  let size = 0;
  try {
    for (;;) {
      const n = readSync(fd, buf, 0, HASH_CHUNK_BYTES, null);
      if (n === 0) break;
      hash.update(buf.subarray(0, n));
      size += n;
    }
  } finally {
    closeSync(fd);
  }
  return { sha256: hash.digest('hex'), size };
}

/** True when `rel` sits under one of the evidence directories at the session's top level. */
export function isEvidencePath(rel: string): boolean {
  const segments = rel.split(sep).join('/').split('/');
  return segments.length >= 2 && (EVIDENCE_DIRS as readonly string[]).includes(segments[0]);
}

/**
 * The manifest for the evidence among `files`, sorted by path. `isText` says whether
 * the secret scan read a file as text — only call this once the scan has passed.
 */
export function buildEvidenceManifest(
  files: readonly EvidenceCandidate[],
  isText: (path: string) => boolean,
): EvidenceManifest {
  const entries = files
    .filter((f) => isEvidencePath(f.rel))
    .map((f): EvidenceManifestEntry => {
      const { sha256, size } = hashFile(f.path);
      return {
        path: f.rel.split(sep).join('/'),
        size,
        sha256,
        scan: isText(f.path) ? 'text-clean' : 'binary-not-scanned',
      };
    })
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { generated_by: EVIDENCE_MANIFEST_GENERATOR, files: entries };
}

export function renderEvidenceManifest(manifest: EvidenceManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

// ─── carry-forward.json ─────────────────────────────────────────────
//
// `qualiow session continue-check` carries a finalized explore session's charter risk
// rows, its `stats.json` areas and its discovery headings and paths into the next
// session. The discovery file is in no digest, so finalize records a SHA-256 of all three
// (CLI-written, like the evidence manifest) and `finalize --check` — which continue-check
// re-runs — refuses a session whose files no longer match it. It is tamper detection, not
// a signature: re-running finalize records the files as they then are.

export const CARRY_FORWARD_FILE = 'carry-forward.json';
/** The files continue-check reads from, relative to the session. */
export const CARRY_FORWARD_SOURCES = ['charter.md', 'phase-3-discovery.md', 'stats.json'] as const;

export interface CarryForwardRecord {
  generated_by: typeof EVIDENCE_MANIFEST_GENERATOR;
  /** `sha256` is null for a source the session does not have. */
  files: Array<{ path: (typeof CARRY_FORWARD_SOURCES)[number]; sha256: string | null }>;
}

/**
 * SHA-256 of a session file read under containment — real path inside the real session
 * directory, never under `.auth/`, a regular file with one link — or null.
 */
function hashContained(sessionDir: string, rel: string): string | null {
  try {
    const realSession = realpathSync.native(sessionDir);
    const real = realpathSync.native(join(sessionDir, rel));
    if (relInside(realSession, real) === null || isAuthPath(real)) return null;
    const st = lstatSync(real);
    if (!st.isFile() || st.nlink > 1) return null;
    return hashFile(real).sha256;
  } catch {
    return null;
  }
}

export function buildCarryForwardRecord(sessionDir: string): CarryForwardRecord {
  return {
    generated_by: EVIDENCE_MANIFEST_GENERATOR,
    files: CARRY_FORWARD_SOURCES.map((path) => ({ path, sha256: hashContained(sessionDir, path) })),
  };
}

export function renderCarryForwardRecord(record: CarryForwardRecord): string {
  return `${JSON.stringify(record, null, 2)}\n`;
}
