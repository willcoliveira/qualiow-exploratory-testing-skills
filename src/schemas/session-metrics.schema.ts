import { z } from 'zod';
import { SESSION_DIR_RE } from '../utils/session-dir.js';

export const SeverityCountsSchema = z.object({
  critical: z.number().int().min(0),
  high: z.number().int().min(0),
  medium: z.number().int().min(0),
  low: z.number().int().min(0),
});

// ─── Session contract 2 ─────────────────────────────────────────────

export const RISK_TIERS = ['P0', 'P1', 'P2', 'P3'] as const;
export const AREA_STATUSES = ['tested', 'partial', 'blocked', 'not-tested', 'deferred'] as const;
export const COVERAGE_LEVELS = ['unassessed', 'incomplete', 'qualified', 'complete'] as const;
export const GAP_CODES = [
  'AREA_PARTIAL',
  'AREA_BLOCKED',
  'AREA_NOT_TESTED',
  'AREA_DEFERRED',
  'BUG_UNVERIFIED',
  'BUG_UNMAPPED',
] as const;

/** A charter risk-row id: `A1`, `A2`, … */
export const AREA_ID_RE = /^A\d{1,3}$/;
/** A shipped bug id as its file name spells it: `BUG-001`, `BUG-R2-001`. */
export const BUG_ID_RE = /^BUG-[A-Za-z0-9-]{1,32}$/;
export const INPUTS_DIGEST_RE = /^sha256:[0-9a-f]{64}$/;
export const MAX_AREA_REASON_CHARS = 160;

const TierLevelSchema = z.union([z.enum(COVERAGE_LEVELS), z.literal('n/a')]);
const TiersSchema = z
  .object({ P0: TierLevelSchema, P1: TierLevelSchema, P2: TierLevelSchema, P3: TierLevelSchema })
  .strict();

/** One `coverage.areas[]` entry. Checked by the contract-2 validator, not by the base schema. */
export const CoverageAreaSchema = z
  .object({
    id: z.string().regex(AREA_ID_RE),
    status: z.enum(AREA_STATUSES),
    evidence: z.array(z.string()),
    reason: z.string().max(MAX_AREA_REASON_CHARS).optional(),
  })
  .strict();

export const CoverageGapSchema = z
  .object({
    code: z.enum(GAP_CODES),
    area: z.string().regex(AREA_ID_RE).optional(),
    bug: z.string().regex(BUG_ID_RE).optional(),
    tier: z.enum(RISK_TIERS).optional(),
  })
  .strict();

/** `stats.json` `coverage_level` — written only by `qualiow session level <dir> --write`. */
export const CoverageLevelSchema = z
  .object({
    level: z.enum(COVERAGE_LEVELS),
    tiers: TiersSchema,
    findings: z
      .object({
        highest_shipped: z.enum(['critical', 'high', 'medium', 'low']).nullable(),
        unverified: z.number().int().min(0),
        on_p0: z.number().int().min(0),
      })
      .strict(),
    gaps: z.array(CoverageGapSchema),
    inputs_digest: z.string().regex(INPUTS_DIGEST_RE),
  })
  .strict();

/** The reduced copy `metrics.jsonl` keeps: level, tiers and gap codes only. */
export const CoverageLevelSummarySchema = z
  .object({
    level: z.enum(COVERAGE_LEVELS),
    tiers: TiersSchema,
    gaps: z.array(z.enum(GAP_CODES)),
  })
  .strict();

/**
 * Canonical shape of a session's `stats.json`. The first block is required
 * (and is what `metrics.jsonl` records); the rest is optional context a
 * session skill may add.
 */
export const SessionMetricsSchema = z.object({
  session_id: z.string().min(1),
  target: z.string().min(1),
  date: z.string().min(1),
  duration_min: z.number().min(0),
  bugs_found: z.number().int().min(0),
  severity_counts: SeverityCountsSchema,
  pages_explored: z.number().int().min(0),
  // Optional context.
  kind: z.enum(['explore', 'quick', 'mobile', 'backend']).optional(),
  domain: z.string().optional(),
  started_at: z.string().optional(),
  completed_at: z.string().optional(),
  phases_completed: z.number().int().min(0).optional(),
  total_phases: z.number().int().min(0).optional(),
  coverage: z.record(z.string(), z.unknown()).optional(),
  evidence: z.record(z.string(), z.unknown()).optional(),
  areas_not_tested: z.array(z.string()).optional(),
  blocked_by: z.string().nullable().optional(),
  // Session contract 2 (explore and quick only).
  contract: z.literal(2).optional(),
  continues: z.string().regex(SESSION_DIR_RE).nullable().optional(),
  coverage_level: CoverageLevelSchema.optional(),
});

/**
 * One `metrics.jsonl` line: the same shape, except that a contract-2 line
 * carries the reduced coverage level (`CoverageLevelSummarySchema`).
 */
export const SessionMetricsRecordSchema = SessionMetricsSchema.extend({
  coverage_level: z.union([CoverageLevelSchema, CoverageLevelSummarySchema]).optional(),
});

export type SessionMetricsInput = z.input<typeof SessionMetricsSchema>;
