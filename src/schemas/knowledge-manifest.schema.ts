import { z } from 'zod';

export const KnowledgeManifestStatsSchema = z.object({
  total_entries: z.number().int().min(0),
  heuristics: z.number().int().min(0),
  techniques: z.number().int().min(0),
  checklists: z.number().int().min(0),
  references: z.number().int().min(0),
  domain_profiles: z.number().int().min(0),
  custom_entries: z.number().int().min(0),
});

export const KnowledgeManifestEntrySchema = z.object({
  id: z.string().min(1),
  file: z.string().min(1),
  type: z.string().min(1),
  priority: z.enum(['high', 'medium', 'low']),
  tags: z.array(z.string()),
  domains: z.array(z.string()),
});

export const LoadingStrategySchema = z.object({
  always: z.array(z.string()),
  by_domain: z.record(z.string(), z.array(z.string())),
  by_tag: z.record(z.string(), z.array(z.string())),
});

export const KnowledgeManifestSchema = z.object({
  version: z.string().min(1),
  last_updated: z.string().min(1),
  active_releases: z.array(z.string()).min(1),
  stats: KnowledgeManifestStatsSchema,
  loading_strategy: LoadingStrategySchema,
  entries: z.array(KnowledgeManifestEntrySchema).min(1),
});

export type KnowledgeManifestInput = z.input<typeof KnowledgeManifestSchema>;
