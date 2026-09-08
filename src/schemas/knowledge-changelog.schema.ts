import { z } from 'zod';

const ChangelogEntrySchema = z
  .object({
    id: z.string().min(1),
    type: z.enum(['heuristic', 'technique', 'checklist', 'reference']),
    name: z.string().min(1),
    description: z.string().min(1),
  })
  .strict();

const ChangelogReleaseSchema = z
  .object({
    version: z.string().min(1),
    date: z.string().min(1),
    summary: z.string().min(1),
    entries_added: z.array(ChangelogEntrySchema),
    entries_modified: z.array(z.string()).default([]),
    entries_removed: z.array(z.string()).default([]),
    origin: z.string().optional(),
  })
  .strict();

/** Schema for `data/knowledge/changelog.yml`. */
export const KnowledgeChangelogSchema = z
  .object({
    releases: z.array(ChangelogReleaseSchema).min(1),
  })
  .strict();

export type KnowledgeChangelogInput = z.input<typeof KnowledgeChangelogSchema>;
