import { z } from 'zod';

// Schema for data/knowledge/releases/v<version>/release.yml
export const KnowledgeReleaseSchema = z
  .object({
    version: z.string().min(1),
    date: z.string().min(1),
    author: z.string().min(1),
    status: z.enum(['active', 'deprecated']),
    notes: z.string().min(1),
    entry_count: z.number().int().min(0),
    entries: z.array(z.string().min(1)).min(1),
  })
  .strict()
  .refine((r) => r.entry_count === r.entries.length, {
    message: 'entry_count must equal the number of listed entries',
    path: ['entry_count'],
  });

export type KnowledgeReleaseInput = z.input<typeof KnowledgeReleaseSchema>;
