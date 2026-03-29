import { z } from 'zod';

export const JourneySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  steps: z.array(z.string()).min(1),
  risk: z.enum(['high', 'medium', 'low']),
});

export const DomainConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  risk_ranking: z.array(z.string()).min(1),
  completeness_checklist: z.array(z.string()).min(1),
  data_integrity_checks: z.array(z.string()).min(1),
  journeys: z.array(JourneySchema).min(1),
  guidance: z.array(z.string()).min(1),
});

export type DomainConfigInput = z.input<typeof DomainConfigSchema>;
