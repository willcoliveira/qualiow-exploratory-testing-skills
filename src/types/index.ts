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
  auth?: 'session-cookie' | 'bearer-env' | 'api-key-env' | 'none';
  /** Env var NAME holding the credential — never the credential itself. */
  token_env?: string;
  /** Header carrying the credential for `api-key-env`. Defaults to `X-Api-Key`. */
  header_name?: string;
  /** Persistent browser profile directory holding the authenticated session. */
  browser_profile?: string;
  /** Endpoint returning the deployed build, used to fingerprint the environment. */
  version_endpoint?: string;
  /** Logical name -> "VERB /path". */
  endpoints?: Record<string, string>;
  /** The only endpoints the read-only API lane may call without asking. */
  probe_allowlist?: string[];
  /** The only endpoints phase 4 may call through the real write path, in a dev
   *  or ephemeral environment. Absent means the API lane is read-only here. */
  write_allowlist?: string[];
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

export type TriageProvider = 'typesafe' | 'laya';

export interface LayaTriageConfig {
  endpoint?: string;
  model?: string;
  max_len?: number;
  /** NAME of the env var holding the local server's key, only when it requires one. */
  api_key_env?: string;
}

export interface VerificationConfig {
  /** `judge` (default): every candidate bug faces `qa-bug-judge` before it ships.
   *  `off`: drafts ship unverified, with no `verification/` directory.
   *  `triage-shadow`: the judge as in `judge`, plus an advisory decision-model
   *  triage of each claim recorded beside the verdict. */
  mode?: 'judge' | 'off' | 'triage-shadow';
  /** Single-provider shorthand. `laya` = a self-hosted, loopback-only server. */
  triage_provider?: TriageProvider;
  /** Several providers side by side, each recorded in its own file. */
  triage_providers?: TriageProvider[];
  /** NAME of the env var holding the TypeSafe API key (default TYPESAFE_API_KEY). */
  triage_api_key_env?: string;
  laya?: LayaTriageConfig;
  evidence_max_lines?: number;
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
  verification?: VerificationConfig;
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
  name: string;
  steps: string[];
}

export interface RiskRanking {
  p0: string[];
  p1: string[];
  p2: string[];
  p3: string[];
}

export interface DomainConfig {
  id: string;
  name: string;
  risk_ranking: RiskRanking;
  completeness_checklist: string[];
  data_integrity_checks: string[];
  journeys: Journey[];
  must_test_patterns: Record<string, string[]>;
  common_bugs: string[];
  compliance: string[];
  guidance: string;
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
  kind?: 'explore' | 'quick' | 'mobile' | 'backend';
  domain?: string;
  started_at?: string;
  completed_at?: string;
  phases_completed?: number;
  total_phases?: number;
  coverage?: Record<string, unknown>;
  evidence?: Record<string, unknown>;
  areas_not_tested?: string[];
  blocked_by?: string | null;
  /** Session contract 2 (`/qa-explore`, `/qa-explore-quick`): turns on the coverage checks. */
  contract?: 2;
  /** Under `--continue`: the directory NAME of the finalized session this one continues. */
  continues?: string | null;
  /** Written only by `qualiow session level <dir> --write`. */
  coverage_level?: CoverageLevel;
}

// ─── Session contract 2: coverage level ──────────────────────────────

export type RiskTier = 'P0' | 'P1' | 'P2' | 'P3';

/** `deferred` = not reached in the time box. */
export type AreaStatus = 'tested' | 'partial' | 'blocked' | 'not-tested' | 'deferred';

/** One `stats.json` `coverage.areas[]` entry, keyed to a charter risk row by `id`. */
export interface CoverageArea {
  id: string;
  status: AreaStatus;
  evidence: string[];
  reason?: string;
}

/** A computed coverage fact — never a ship probability or release verdict. */
export type CoverageLevelName = 'unassessed' | 'incomplete' | 'qualified' | 'complete';

export type GapCode =
  | 'AREA_PARTIAL'
  | 'AREA_BLOCKED'
  | 'AREA_NOT_TESTED'
  | 'AREA_DEFERRED'
  | 'BUG_UNVERIFIED'
  | 'BUG_UNMAPPED';

export interface CoverageGap {
  code: GapCode;
  area?: string;
  bug?: string;
  tier?: RiskTier;
}

/** The product-state line shown beside the level, never folded into it. */
export interface CoverageFindings {
  highest_shipped: BugSeverity | null;
  unverified: number;
  on_p0: number;
}

export interface CoverageLevel {
  level: CoverageLevelName;
  tiers: Record<RiskTier, CoverageLevelName | 'n/a'>;
  findings: CoverageFindings;
  gaps: CoverageGap[];
  /** sha256 over the parsed inputs only (areas, tiers, bug id/severity/area/verification). */
  inputs_digest: string;
}

/** What `metrics.jsonl` keeps of a coverage level: the level, the tiers and the gap codes. */
export interface CoverageLevelSummary {
  level: CoverageLevelName;
  tiers: Record<RiskTier, CoverageLevelName | 'n/a'>;
  gaps: GapCode[];
}

/** One `metrics.jsonl` line — a contract-2 session's coverage reduced to counts. */
export type SessionMetricsRecord = Omit<SessionMetrics, 'coverage_level'> & {
  coverage_level?: CoverageLevel | CoverageLevelSummary;
};

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
