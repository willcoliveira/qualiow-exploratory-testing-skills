/**
 * The I/O half of session contract 2: loads one session's charter, stats and
 * shipped bugs, runs the pure checks (`contract2.ts`), checks `continues`,
 * and — when nothing is wrong — computes and renders the coverage level
 * (`coverage-level.ts`). Shared by `qualiow session level`, `finalize` and
 * `continue-check`, so all three judge a session the same way.
 */

import { lstatSync, realpathSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { parseSession } from '../utils/parse-session.js';
import { parseSessionDirName, SESSION_DIR_RE } from '../utils/session-dir.js';
import { readContainedText, resolveEvidence } from '../utils/session-paths.js';
import { evaluateContract2, type ContractBug, type RiskRow } from './contract2.js';
import { computeLevel, renderBacklog, renderLevel, type LevelInput } from './coverage-level.js';
import type { CoverageArea, CoverageLevel } from '../types/index.js';

/** charter.md and a prior stats.json are read only this far. */
export const MAX_CHARTER_BYTES = 1024 * 1024;
export const MAX_STATS_BYTES = 1024 * 1024;

export interface Contract2Assessment {
  violations: string[];
  rows: RiskRow[];
  areas: CoverageArea[];
  /** Present only when there is no violation. */
  input?: LevelInput;
  level?: CoverageLevel;
  /** The full `evidence-level.md`, header included. */
  evidenceLevelMd?: string;
  /** The full `backlog.md`, header included. */
  backlogMd?: string;
}

export interface AssessContext {
  /** `<cwd>/output/sessions`. */
  sessionsDir: string;
  /** True when `name` has a row in `output/sessions/INDEX.md`. */
  isFinalized: (name: string) => boolean;
}

/**
 * `continues` must be null, or the name of a finalized explore session of the
 * same target: a real directory directly under the real sessions directory,
 * never this session itself.
 */
function checkContinues(
  sessionDir: string,
  stats: Record<string, unknown>,
  kind: string | undefined,
  ctx: AssessContext,
): string[] {
  const value = stats.continues;
  if (value === undefined || value === null) return [];
  if (typeof value !== 'string' || !SESSION_DIR_RE.test(value)) {
    return ['stats.json: continues is not a session directory name — the name alone, or null'];
  }
  if (kind !== 'explore') return [`stats.json: continues is explore only — a ${kind ?? 'kindless'} session never continues another`];
  if (value === basename(sessionDir)) return ['stats.json: continues names this session itself'];
  if (parseSessionDirName(value)?.kind !== 'explore') {
    return [`stats.json: continues names ${value}, which is not an explore session`];
  }

  const realSessions = realpathSync(ctx.sessionsDir);
  const candidate = join(realSessions, value);
  let isDir = false;
  try {
    const st = lstatSync(candidate);
    isDir = st.isDirectory() && dirname(realpathSync(candidate)) === realSessions;
  } catch {
    isDir = false;
  }
  if (!isDir) return [`stats.json: continues names ${value}, which is not a session directory under output/sessions/`];
  if (!ctx.isFinalized(value)) {
    return [`stats.json: continues names ${value}, which is not finalized — finalize it first, or set continues to null`];
  }
  const priorText = readContainedText(candidate, 'stats.json', MAX_STATS_BYTES);
  let priorTarget: unknown;
  try {
    priorTarget = priorText === null ? undefined : (JSON.parse(priorText) as Record<string, unknown>).target;
  } catch {
    priorTarget = undefined;
  }
  if (priorTarget !== stats.target) {
    return [`stats.json: continues names ${value}, which is not a session of the same target`];
  }
  return [];
}

/**
 * Every contract-2 check over one session, then the level and its two
 * renderings. `stats` is stats.json as parsed JSON (not the schema output);
 * `kind` is `stats.kind`, else the kind in the directory name. Fails closed:
 * anything thrown becomes a violation.
 */
export async function assessContract2(
  sessionDir: string,
  stats: Record<string, unknown>,
  kind: string | undefined,
  ctx: AssessContext,
): Promise<Contract2Assessment> {
  try {
    const charter = readContainedText(sessionDir, 'charter.md', MAX_CHARTER_BYTES);
    const parsed = await parseSession(sessionDir);
    const bugs: ContractBug[] = parsed.bugs.map((b) => ({
      id: b.id,
      severity: b.severity,
      area: b.area,
      verification: b.verification,
    }));

    const evaluation = evaluateContract2({ kind, charter, stats, bugs }, (p) => resolveEvidence(sessionDir, p));
    const violations = [...evaluation.violations, ...checkContinues(sessionDir, stats, kind, ctx)];
    const base = { rows: evaluation.rows, areas: evaluation.areas };
    if (violations.length || !evaluation.input) return { violations, ...base };

    const level = computeLevel(evaluation.input);
    return {
      violations,
      ...base,
      input: evaluation.input,
      level,
      evidenceLevelMd: renderLevel(level, evaluation.input),
      backlogMd: renderBacklog(evaluation.input),
    };
  } catch (err) {
    return {
      violations: [`contract 2 could not be evaluated: ${err instanceof Error ? err.message : String(err)}`],
      rows: [],
      areas: [],
    };
  }
}
