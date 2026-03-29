import { z } from 'zod';

export const KnowledgeEntryContentSchema = z
  .object({
    summary: z.string().min(1),
  })
  .passthrough();

export const KnowledgeEntrySchema = z.object({
  id: z.string().min(1),
  version: z.string().min(1),
  type: z.enum(['heuristic', 'technique', 'checklist', 'reference']),
  name: z.string().min(1),
  description: z.string().min(1),
  author: z.string().optional(),
  source: z.string().optional(),
  tags: z.array(z.string()).min(1),
  domains: z.array(z.string()).min(1),
  priority: z.enum(['high', 'medium', 'low']),
  added: z.string().min(1),
  content: KnowledgeEntryContentSchema,
});

export type KnowledgeEntryInput = z.input<typeof KnowledgeEntrySchema>;
