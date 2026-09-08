import { z } from 'zod';

export const SeverityCountsSchema = z.object({
  critical: z.number().int().min(0),
  high: z.number().int().min(0),
  medium: z.number().int().min(0),
  low: z.number().int().min(0),
});

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
});

export type SessionMetricsInput = z.input<typeof SessionMetricsSchema>;
