import { z } from 'zod';

export const AuthConfigSchema = z.object({
  strategy: z.enum(['none', 'storage_state', 'credentials', 'token']),
  state_file: z.string().optional(),
  login_url: z.string().url().optional(),
  credentials: z
    .object({
      username: z.string(),
      password: z.string(),
    })
    .optional(),
  token: z.string().optional(),
});

export const BrowserConfigSchema = z.object({
  headless: z.boolean(),
  viewport: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  }),
});

export const ScopeConfigSchema = z.object({
  start_pages: z.array(z.string()).optional(),
  max_depth: z.number().int().min(0),
  include_patterns: z.array(z.string()).optional(),
  exclude_patterns: z.array(z.string()).optional(),
});

export const SafetyConfigSchema = z.object({
  read_only: z.boolean(),
  no_form_submit: z.boolean(),
  no_file_upload: z.boolean().optional(),
  no_delete_actions: z.boolean().optional(),
});

export const TargetConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  base_url: z.string().url(),
  domain: z.string().min(1),
  auth: AuthConfigSchema,
  browser: BrowserConfigSchema,
  scope: ScopeConfigSchema,
  safety: SafetyConfigSchema.optional(),
  notes: z.string().optional(),
});

export type TargetConfigInput = z.input<typeof TargetConfigSchema>;
