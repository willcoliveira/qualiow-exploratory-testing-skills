/**
 * Finalize's verdict cross-check: a bug's `**Verification:**` line is a claim about
 * what the `qa-bug-judge` said, and the judge's own words are on disk in
 * `verification/VERDICT-NNN.md` (copied verbatim by Phase 7). This holds the two
 * against each other, so a bug cannot ship as `Verified` on a verdict that refuted it,
 * or with no verdict at all.
 *
 * It applies only to a session that ran the judge — one with a `verification/`
 * directory, or with a bug carrying a `**Verification:**` line. Quick, mobile and
 * backend sessions, and explore sessions with the judge off, have neither and are
 * untouched. `Unverified (…)` is never cross-checked: it is the conservative claim.
 *
 * Violations name files and verdict words only — never a line of the verdict itself.
 */

import { lstatSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseVerdictBlock } from '../triage/claim-parser.js';
import type { JudgeVerdict } from '../triage/types.js';
import { readContainedText } from '../utils/session-paths.js';

/** A verdict or bug file is read only this far — both are a page of markdown. */
const MAX_VERDICT_BYTES = 1024 * 1024;

const VERDICT_FILE_RE = /^VERDICT-[A-Za-z0-9_-]+\.md$/;
const BUG_FILE_RE = /^BUG-([A-Za-z0-9_-]+)\.md$/;
const VERIFICATION_LINE_RE = /^[ \t]*(?:[-*][ \t]+)?\*\*Verification:\*\*[ \t]*(.*)$/im;
const FULL_VERDICT_RE = /Full verdict:[ \t]*`?(?:\.\.\/)?verification\/([^`\s)]+)/i;

const SHIPPABLE: ReadonlySet<JudgeVerdict> = new Set(['CONFIRMED', 'CONFIRMED-ADJUSTED']);
// METHOD and CONFIDENCE are judged by their first word: the judge may add a reason
// after it ("evidence-only — budget ran out"), as its definition asks it to.
const METHOD_RE = /^(?:live-repro|evidence-only)(?![\w-])/i;
const CONFIDENCE_RE = /^(?:high|medium|low)(?![\w-])/i;

type Claim = 'verified' | 'overruled' | 'unverified' | 'refuted' | 'unreproducible' | 'other';

function isDir(path: string): boolean {
  try {
    return lstatSync(path).isDirectory();
  } catch {
    return false;
  }
}

function listFiles(dir: string, re: RegExp): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((d) => (d.isFile() || d.isSymbolicLink()) && re.test(d.name))
      .map((d) => d.name)
      .sort();
  } catch {
    return [];
  }
}

/** The bug's `**Verification:**` line, classified; null when it has none. */
function classify(content: string): Claim | null {
  const m = VERIFICATION_LINE_RE.exec(content);
  if (!m) return null;
  const value = m[1].replace(/[*`_]/g, '').trim();
  if (/^verified\b/i.test(value)) return /judge overruled/i.test(value) ? 'overruled' : 'verified';
  if (/^unverified\b/i.test(value)) return 'unverified';
  if (/^refuted\b/i.test(value)) return 'refuted';
  if (/^unreproducible\b/i.test(value)) return 'unreproducible';
  return 'other';
}

/**
 * The verdict file a bug points at: its `Full verdict:` link when that names a
 * `VERDICT-*.md` directly under `verification/`, else the one with the bug's number.
 */
function verdictFileFor(bugFile: string, content: string): string {
  const linked = FULL_VERDICT_RE.exec(content)?.[1];
  if (linked && VERDICT_FILE_RE.test(linked)) return linked;
  return `VERDICT-${BUG_FILE_RE.exec(bugFile)?.[1] ?? ''}.md`;
}

export function checkVerdicts(sessionDir: string): string[] {
  const hasVerification = isDir(join(sessionDir, 'verification'));
  const bugs = [
    ...listFiles(join(sessionDir, 'bugs'), BUG_FILE_RE).map((name) => ({ name, rel: `bugs/${name}`, refuted: false })),
    ...listFiles(join(sessionDir, 'bugs', 'refuted'), BUG_FILE_RE).map((name) => ({
      name,
      rel: `bugs/refuted/${name}`,
      refuted: true,
    })),
  ].map((b) => {
    const content = readContainedText(sessionDir, b.rel, MAX_VERDICT_BYTES) ?? '';
    return { ...b, content, claim: classify(content) };
  });

  if (!hasVerification && !bugs.some((b) => b.claim !== null)) return [];

  const violations: string[] = [];
  const verdictCache = new Map<string, JudgeVerdict | 'UNKNOWN' | null>();
  const verdictOf = (file: string): JudgeVerdict | 'UNKNOWN' | null => {
    if (!verdictCache.has(file)) {
      const text = hasVerification ? readContainedText(sessionDir, join('verification', file), MAX_VERDICT_BYTES) : null;
      verdictCache.set(file, text === null ? null : parseVerdictBlock(text).verdict);
    }
    return verdictCache.get(file) ?? null;
  };

  // 1. Every verdict on disk must say something the protocol knows.
  if (hasVerification) {
    for (const file of listFiles(join(sessionDir, 'verification'), VERDICT_FILE_RE)) {
      const rel = `verification/${file}`;
      const text = readContainedText(sessionDir, join('verification', file), MAX_VERDICT_BYTES);
      if (text === null) {
        violations.push(`${rel} cannot be read inside the session — replace it with a regular file`);
        continue;
      }
      const parsed = parseVerdictBlock(text);
      if (parsed.verdict === 'UNKNOWN') {
        violations.push(
          `${rel} has no recognisable VERDICT line (CONFIRMED, CONFIRMED-ADJUSTED, REFUTED, UNREPRODUCIBLE or UNVERIFIED)`,
        );
      }
      if (parsed.method !== undefined && !METHOD_RE.test(parsed.method)) {
        violations.push(`${rel}: METHOD is neither live-repro nor evidence-only`);
      }
      if (parsed.confidence !== undefined && !CONFIDENCE_RE.test(parsed.confidence)) {
        violations.push(`${rel}: CONFIDENCE is not high, medium or low`);
      }
    }
  }

  // 2. Every bug's Verification line must match the verdict it rests on.
  for (const bug of bugs) {
    const { rel, claim } = bug;
    if (claim === null || claim === 'unverified') {
      if (bug.refuted) {
        violations.push(`${rel} is under bugs/refuted/ but its **Verification:** line is not Refuted or Unreproducible`);
      }
      continue;
    }
    if (claim === 'other') {
      violations.push(
        `${rel} has a **Verification:** line that is none of Verified, Unverified (<reason>), Refuted or Unreproducible`,
      );
      continue;
    }

    const file = verdictFileFor(bug.name, bug.content);
    const verdictRel = `verification/${file}`;

    if (claim === 'verified' || claim === 'overruled') {
      if (bug.refuted) {
        violations.push(`${rel} says Verified but sits under bugs/refuted/ — a shipped bug belongs in bugs/`);
        continue;
      }
      if (!hasVerification) {
        violations.push(`${rel} says Verified, but the session has no verification/ directory — no verdict backs it`);
        continue;
      }
      const verdict = verdictOf(file);
      if (verdict === null) {
        violations.push(`${rel} says Verified, but ${verdictRel} does not exist`);
        continue;
      }
      // An overruled refutation is the session's call; the verdict it overrules must still be on file.
      if (claim === 'verified' && !SHIPPABLE.has(verdict as JudgeVerdict)) {
        violations.push(
          `${rel} says Verified, but ${verdictRel} is ${verdict} — ship it as Unverified (<reason>), ` +
            'move it to bugs/refuted/, or write Verified (judge overruled: <reason>)',
        );
      }
      continue;
    }

    // Refuted or Unreproducible.
    const expected: JudgeVerdict = claim === 'refuted' ? 'REFUTED' : 'UNREPRODUCIBLE';
    const label = claim === 'refuted' ? 'Refuted' : 'Unreproducible';
    if (!bug.refuted) {
      violations.push(`${rel} says ${label} — a candidate the judge did not uphold belongs under bugs/refuted/`);
      continue;
    }
    if (!hasVerification) {
      violations.push(`${rel} says ${label}, but the session has no verification/ directory — no verdict backs it`);
      continue;
    }
    const verdict = verdictOf(file);
    if (verdict === null) {
      violations.push(`${rel} says ${label}, but ${verdictRel} does not exist`);
    } else if (verdict !== expected) {
      violations.push(`${rel} says ${label}, but ${verdictRel} is ${verdict} — it needs ${expected}`);
    }
  }

  return violations;
}
