/**
 * Core type definitions for Qualiow Exploratory Testing Skills.
 * Derived from the YAML data files in data/.
 */

// ─── Target Configuration ────────────────────────────────────────────

export interface AuthConfig {
  strategy: 'none' | 'storage_state' | 'credentials' | 'token';
  state_file?: string;
  login_url?: string;
  credentials?: {
    username: string;
    password: string;
  };
  token?: string;
}

export interface BrowserConfig {
  headless: boolean;
  viewport: {
    width: number;
    height: number;
  };
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

export interface TargetConfig {
  id: string;
  name: string;
  base_url: string;
  domain: string;
  auth: AuthConfig;
  browser: BrowserConfig;
  scope: ScopeConfig;
  safety?: SafetyConfig;
  notes?: string;
}

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
