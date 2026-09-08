import { z } from 'zod';

/**
 * Domain config schema — matches the shape every `data/domains/*.yml` file
 * actually uses (verified across all six shipped domains):
 *   risk_ranking: a p0..p3 map of string lists
 *   journeys: name + steps (no id/description/risk)
 *   must_test_patterns: category -> string list
 *   common_bugs / compliance: string lists
 *   guidance: a free-text block
 */

export const RiskRankingSchema = z
  .object({
    p0: z.array(z.string()).min(1),
    p1: z.array(z.string()).min(1),
    p2: z.array(z.string()).min(1),
    p3: z.array(z.string()).min(1),
  })
  .strict();

export const JourneySchema = z
  .object({
    name: z.string().min(1),
    steps: z.array(z.string()).min(1),
  })
  .strict();

export const DomainConfigSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    risk_ranking: RiskRankingSchema,
    completeness_checklist: z.array(z.string()).min(1),
    data_integrity_checks: z.array(z.string()).min(1),
    journeys: z.array(JourneySchema).min(1),
    must_test_patterns: z.record(z.string(), z.array(z.string())),
    common_bugs: z.array(z.string()).min(1),
    compliance: z.array(z.string()).min(1),
    guidance: z.string().min(1),
  })
  .strict();

export type DomainConfigInput = z.input<typeof DomainConfigSchema>;
