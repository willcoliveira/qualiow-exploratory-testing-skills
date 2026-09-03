import { z } from 'zod';

export const AuthConfigSchema = z.object({
  // 'in-app' (native mobile: login/signup inside the app) and 'interactive-sso'
  // (mobile web: one-time human SSO/MFA login the browser profile persists) are
  // mobile-only strategies used by /qa-explore-mobile.
  strategy: z.enum([
    'none',
    'storage_state',
    'credentials',
    'token',
    'in-app',
    'interactive-sso',
  ]),
  state_file: z.string().optional(),
  login_url: z.string().url().optional(),
  credentials: z
    .object({
      username: z.string(),
      password: z.string(),
    })
    .optional(),
  token: z.string().optional(),
  identity_provider: z.string().optional(),
  // Staging builds sometimes accept a fixed OTP — recorded so the auth phase can
  // use it instead of waiting for a real code. Never a real credential.
  static_otp: z.string().optional(),
  test_email_pattern: z.string().optional(),
});

export const BrowserConfigSchema = z.object({
  headless: z.boolean(),
  viewport: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  }),
  // Optional engine selection + Playwright device descriptor for mobile-web
  // emulation targets (e.g. engine: webkit, device: "iPhone 15").
  engine: z.enum(['chromium', 'webkit', 'firefox']).optional(),
  channel: z.string().optional(),
  device: z.string().optional(),
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

// ─── Backend verification surface (/qa-verify-backend) ────────────────

// What the skill is allowed to do in this environment. `kind: production`
// forces read-only probes and skips the end-to-end write phase.
export const EnvironmentConfigSchema = z.object({
  kind: z.enum(['dev', 'ephemeral', 'staging', 'production']),
  destroyed_automatically: z.boolean().optional(),
});

// Cloud resources to probe read-only. Credentials are referenced by env var
// NAME (`aws_profile_env`, `region_env`) and never stored here.
export const BackendConfigSchema = z.object({
  provider: z.enum(['aws']).optional(),
  aws_profile_env: z.string().optional(),
  region_env: z.string().optional(),
  region: z.string().optional(),
  // Expected account. The skill compares it to `sts get-caller-identity` and
  // stops the live lane on a mismatch rather than probing someone else's account.
  account_id: z.string().optional(),
  env_suffix: z.string().optional(),
  // Free-form logical name -> deployed resource name (config_table, dlq, ...).
  resources: z.record(z.string(), z.string()).optional(),
  notes: z.string().optional(),
});

// The service's own HTTP surface, probed read-only from the authenticated
// session. Credentials are referenced by env var NAME or by profile directory —
// never stored here.
export const ApiSurfaceConfigSchema = z.object({
  // Defaults to the target's base_url when omitted.
  base_url: z.string().optional(),
  auth: z.enum(['session-cookie', 'bearer-env', 'none']).optional(),
  // NAME of the env var holding a bearer token, for `auth: bearer-env`.
  token_env: z.string().optional(),
  // Persistent browser profile directory holding the authenticated session,
  // e.g. `.auth/my-service-dev-profile`. Gitignored.
  browser_profile: z.string().optional(),
  // Endpoint returning the deployed build, used to fingerprint the environment.
  version_endpoint: z.string().optional(),
  // Logical name -> "VERB /path", e.g. search: "POST /api/v1/search".
  endpoints: z.record(z.string(), z.string()).optional(),
  // The ONLY endpoints the read-only API lane may call without asking.
  probe_allowlist: z.array(z.string()).optional(),
  // Other target ids to run the same matrix against, for parity comparison.
  parity_targets: z.array(z.string()).optional(),
  // Flag name -> where its deployed value is declared for this environment.
  // A flag can select between two implementations inside one identical build.
  feature_flags: z.record(z.string(), z.string()).optional(),
  notes: z.string().optional(),
});

// The implementation branch reviewed statically. Read with `git show`, never
// checked out — the user may have uncommitted work.
export const SourceBranchConfigSchema = z.object({
  repo_path: z.string(),
  branch: z.string(),
  base_branch: z.string().optional(),
  components: z.record(z.string(), z.string()).optional(),
});

// ─── Web target (Playwright / playwright-cli — /qa-explore) ───────────

export const WebTargetConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  // '' is allowed for the ad-hoc template (_default.yml) where the URL is
  // provided at session start rather than in the config.
  base_url: z.union([z.literal(''), z.string().url()]),
  domain: z.string().min(1),
  auth: AuthConfigSchema,
  browser: BrowserConfigSchema,
  scope: ScopeConfigSchema,
  safety: SafetyConfigSchema.optional(),
  // Optional blocks consumed by /qa-verify-backend. A target without them is
  // still a valid /qa-explore target.
  environment: EnvironmentConfigSchema.optional(),
  backend: BackendConfigSchema.optional(),
  api: ApiSurfaceConfigSchema.optional(),
  source: SourceBranchConfigSchema.optional(),
  notes: z.string().optional(),
});

// ─── Mobile target (Maestro / mobile-cli — /qa-explore-mobile) ────────

export const MobileDeviceConfigSchema = z.object({
  name: z.string().optional(), // iOS simulator name (portable across machines)
  udid: z.string().optional(), // iOS simulator UDID (takes precedence over name)
  avd: z.string().optional(), // Android AVD name
  serial: z.string().optional(), // Android serial once booted (e.g. emulator-5554)
});

export const MobileAppConfigSchema = z.object({
  bundle_id: z.string().optional(), // iOS bundle id (or browser bundle in web mode)
  package: z.string().optional(), // Android application id (or browser package)
  app_paths: z.array(z.string()).optional(), // iOS .app artifact(s) — native mode
  apk_paths: z.array(z.string()).optional(), // Android APK(s) — native mode
});

export const MobileWebConfigSchema = z.object({
  base_url: z.string().url(),
  start_url: z.string().url().optional(),
});

export const SourceRepoConfigSchema = z.object({
  path: z.string(),
  build_commands: z.record(z.string(), z.string()).optional(),
});

export const MobileScopeConfigSchema = z.object({
  start_screen: z.string().optional(),
  start_url: z.string().optional(),
  include_patterns: z.array(z.string()).optional(),
  exclude_patterns: z.array(z.string()).optional(),
});

export const MobileTargetConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  platform: z.enum(['ios', 'android']), // discriminates mobile from web targets
  domain: z.string().min(1),
  device: MobileDeviceConfigSchema,
  app: MobileAppConfigSchema,
  web: MobileWebConfigSchema.optional(), // present → WEB mode; absent → NATIVE mode
  auth: AuthConfigSchema,
  scope: MobileScopeConfigSchema.optional(),
  safety: SafetyConfigSchema.optional(),
  source_repo: SourceRepoConfigSchema.optional(),
  notes: z.string().optional(),
});

// ─── Combined ─────────────────────────────────────────────────────────

export type WebTargetConfigInput = z.input<typeof WebTargetConfigSchema>;
export type MobileTargetConfigInput = z.input<typeof MobileTargetConfigSchema>;
export type TargetConfigInput = WebTargetConfigInput | MobileTargetConfigInput;

// Discriminate on the presence of `platform` (mobile-only, required there) instead
// of z.union — a union wraps branch failures in one `invalid_union` issue and loses
// the per-field error paths that the CLI validate output reports.
export const TargetConfigSchema: z.ZodType<
  z.output<typeof WebTargetConfigSchema> | z.output<typeof MobileTargetConfigSchema>
> = z.custom<TargetConfigInput>().superRefine((data, ctx) => {
  const isMobile =
    typeof data === 'object' && data !== null && 'platform' in data;
  const branch = isMobile ? MobileTargetConfigSchema : WebTargetConfigSchema;
  const result = branch.safeParse(data);
  if (!result.success) {
    // A fully-formed issue from a sub-parse is structurally compatible with
    // ctx.addIssue but lacks the index signature zod 4's raw-issue type
    // declares; assert against the method's own parameter type to forward it
    // verbatim and keep the per-field error paths.
    for (const issue of result.error.issues)
      ctx.addIssue(issue as Parameters<typeof ctx.addIssue>[0]);
  }
});
