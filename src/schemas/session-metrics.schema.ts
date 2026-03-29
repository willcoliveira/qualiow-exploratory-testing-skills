import { z } from 'zod';

export const SeverityCountsSchema = z.object({
  critical: z.number().int().min(0),
  high: z.number().int().min(0),
  medium: z.number().int().min(0),
  low: z.number().int().min(0),
});

export const SessionMetricsSchema = z.object({
  session_id: z.string().min(1),
  target: z.string().min(1),
  date: z.string().min(1),
  duration_min: z.number().min(0),
  bugs_found: z.number().int().min(0),
  severity_counts: SeverityCountsSchema,
  pages_explored: z.number().int().min(0),
});

export type SessionMetricsInput = z.input<typeof SessionMetricsSchema>;
