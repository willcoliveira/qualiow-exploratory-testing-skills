/**
 * Core type definitions for Qualiow Exploratory Testing Skills.
 * Derived from the YAML data files in data/.
 */

// ─── Target Configuration ────────────────────────────────────────────

export interface AuthConfig {
  strategy:
    | 'none'
    | 'storage_state'
    | 'credentials'
    | 'token'
    | 'in-app'
    | 'interactive-sso';
  state_file?: string;
  login_url?: string;
  credentials?: {
    username: string;
    password: string;
  };
  token?: string;
  identity_provider?: string;
  static_otp?: string;
  test_email_pattern?: string;
}

export interface BrowserConfig {
  headless: boolean;
  viewport: {
    width: number;
    height: number;
  };
  engine?: 'chromium' | 'webkit' | 'firefox';
  channel?: string;
  device?: string;
}

export interface ScopeConfig {
  start_pages?: string[];
  max_depth: number;
  include_patterns?: string[];
  exclude_patterns?: string[];
}

export interface SafetyConfig {
  read_only: boolean;
  no_form_submit: boolean;
  no_file_upload?: boolean;
  no_delete_actions?: boolean;
}

export interface EnvironmentConfig {
  kind: 'dev' | 'ephemeral' | 'staging' | 'production';
  destroyed_automatically?: boolean;
}

export interface BackendConfig {
  provider?: 'aws';
  /** Env var NAME holding the AWS profile — never the credential itself. */
  aws_profile_env?: string;
  region_env?: string;
  region?: string;
  /** Expected account id; the live lane stops if the caller identity differs. */
  account_id?: string;
  env_suffix?: string;
  /** Logical name -> deployed resource name. Asserted, confirmed before use. */
  resources?: Record<string, string>;
  notes?: string;
}

export interface ApiSurfaceConfig {
  /** Defaults to the target's base_url when omitted. */
  base_url?: string;
  auth?: 'session-cookie' | 'bearer-env' | 'none';
  /** Env var NAME holding a bearer token — never the token itself. */
  token_env?: string;
  /** Persistent browser profile directory holding the authenticated session. */
  browser_profile?: string;
  /** Endpoint returning the deployed build, used to fingerprint the environment. */
  version_endpoint?: string;
  /** Logical name -> "VERB /path". */
  endpoints?: Record<string, string>;
  /** The only endpoints the read-only API lane may call without asking. */
  probe_allowlist?: string[];
  /** Other target ids to run the same matrix against, for parity comparison. */
  parity_targets?: string[];
  /** Flag name -> where its deployed value is declared for this environment. */
  feature_flags?: Record<string, string>;
  notes?: string;
}

export interface SourceBranchConfig {
  repo_path: string;
  branch: string;
  base_branch?: string;
  components?: Record<string, string>;
}

export interface TargetConfig {
  id: string;
  name: string;
  base_url: string;
  domain: string;
  auth: AuthConfig;
  browser: BrowserConfig;
  scope: ScopeConfig;
  safety?: SafetyConfig;
  environment?: EnvironmentConfig;
  backend?: BackendConfig;
  api?: ApiSurfaceConfig;
  source?: SourceBranchConfig;
  notes?: string;
}

// ─── Mobile Target Configuration (/qa-explore-mobile) ───────────────

export interface MobileDeviceConfig {
  name?: string;
  udid?: string;
  avd?: string;
  serial?: string;
}

export interface MobileAppConfig {
  bundle_id?: string;
  package?: string;
  app_paths?: string[];
  apk_paths?: string[];
}

export interface MobileWebConfig {
  base_url: string;
  start_url?: string;
}

export interface SourceRepoConfig {
  path: string;
  build_commands?: Record<string, string>;
}

export interface MobileScopeConfig {
  start_screen?: string;
  start_url?: string;
  include_patterns?: string[];
  exclude_patterns?: string[];
}

export interface MobileTargetConfig {
  id: string;
  name: string;
  platform: 'ios' | 'android';
  domain: string;
  device: MobileDeviceConfig;
  app: MobileAppConfig;
  web?: MobileWebConfig;
  auth: AuthConfig;
  scope?: MobileScopeConfig;
  safety?: SafetyConfig;
  source_repo?: SourceRepoConfig;
  notes?: string;
}

export type AnyTargetConfig = TargetConfig | MobileTargetConfig;

// ─── Knowledge Base ──────────────────────────────────────────────────

export interface KnowledgeManifestEntry {
  id: string;
  file: string;
  type: string;
  priority: 'high' | 'medium' | 'low';
  tags: string[];
  domains: string[];
}

export interface KnowledgeManifestStats {
  total_entries: number;
  heuristics: number;
  techniques: number;
  checklists: number;
  references: number;
  domain_profiles: number;
  custom_entries: number;
}

export interface LoadingStrategy {
  always: string[];
  by_domain: Record<string, string[]>;
  by_tag: Record<string, string[]>;
}

export interface KnowledgeManifest {
  version: string;
  last_updated: string;
  active_releases: string[];
  stats: KnowledgeManifestStats;
  loading_strategy: LoadingStrategy;
  entries: KnowledgeManifestEntry[];
}

export interface KnowledgeEntryContent {
  summary: string;
  [key: string]: unknown;
}

export interface KnowledgeEntry {
  id: string;
  version: string;
  type: 'heuristic' | 'technique' | 'checklist' | 'reference';
  name: string;
  description: string;
  author?: string;
  source?: string;
  tags: string[];
  domains: string[];
  priority: 'high' | 'medium' | 'low';
  added: string;
  content: KnowledgeEntryContent;
}

// ─── Domain Configuration ────────────────────────────────────────────

export interface Journey {
  id: string;
  name: string;
  description: string;
  steps: string[];
  risk: 'high' | 'medium' | 'low';
}

export interface DomainConfig {
  id: string;
  name: string;
  risk_ranking: string[];
  completeness_checklist: string[];
  data_integrity_checks: string[];
  journeys: Journey[];
  guidance: string[];
}

// ─── Session Metrics ─────────────────────────────────────────────────

export interface SeverityCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export interface SessionMetrics {
  session_id: string;
  target: string;
  date: string;
  duration_min: number;
  bugs_found: number;
  severity_counts: SeverityCounts;
  pages_explored: number;
}

// ─── Bug Report ──────────────────────────────────────────────────────

export type BugSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface BugReport {
  id: string;
  title: string;
  severity: BugSeverity;
  url: string;
  component: string;
  expected: string;
  actual: string;
  steps: string[];
  business_impact: string;
  evidence?: string[];
}

// ─── Validation ──────────────────────────────────────────────────────

export interface ValidationError {
  path: string;
  message: string;
}

export interface ValidationResult {
  file: string;
  valid: boolean;
  errors?: ValidationError[];
}
