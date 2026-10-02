// Types
export type {
  AuthConfig,
  BrowserConfig,
  ScopeConfig,
  SafetyConfig,
  VerificationConfig,
  TriageProvider,
  LayaTriageConfig,
  TargetConfig,
  MobileDeviceConfig,
  MobileAppConfig,
  MobileWebConfig,
  SourceRepoConfig,
  MobileScopeConfig,
  MobileTargetConfig,
  AnyTargetConfig,
  KnowledgeManifestEntry,
  KnowledgeManifestStats,
  LoadingStrategy,
  KnowledgeManifest,
  KnowledgeEntryContent,
  KnowledgeEntry,
  Journey,
  RiskRanking,
  DomainConfig,
  SeverityCounts,
  SessionMetrics,
  BugSeverity,
  BugReport,
  ValidationError,
  ValidationResult,
} from './types/index.js';

// Schemas
export {
  AuthConfigSchema,
  BrowserConfigSchema,
  ScopeConfigSchema,
  SafetyConfigSchema,
  VerificationConfigSchema,
  TriageProviderSchema,
  LayaTriageConfigSchema,
  WebTargetConfigSchema,
  MobileDeviceConfigSchema,
  MobileAppConfigSchema,
  MobileWebConfigSchema,
  SourceRepoConfigSchema,
  MobileScopeConfigSchema,
  MobileTargetConfigSchema,
  TargetConfigSchema,
  KnowledgeEntryContentSchema,
  KnowledgeEntrySchema,
  KnowledgeManifestStatsSchema,
  KnowledgeManifestEntrySchema,
  LoadingStrategySchema,
  KnowledgeManifestSchema,
  JourneySchema,
  DomainConfigSchema,
  SeverityCountsSchema,
  SessionMetricsSchema,
  KnowledgeReleaseSchema,
  KnowledgeChangelogSchema,
} from './schemas/index.js';

// Utilities
export { redact, containsSecrets, REDACTION_CATEGORIES } from './utils/redact.js';
export type { RedactOptions } from './utils/redact.js';
export {
  validateTargetConfig,
  validateKnowledgeEntry,
  validateDomainConfig,
  validateKnowledgeBase,
  validateAllConfigs,
} from './utils/validate.js';
export {
  appendSessionMetrics,
  appendSessionMetricsDeduped,
  readAllMetrics,
} from './utils/metrics.js';
export {
  SESSION_KINDS,
  SESSION_DIR_RE,
  LEGACY_SESSION_DIR_RE,
  slugify,
  sessionTimestamp,
  sessionDirName,
  parseSessionDirName,
  describeSessionDir,
} from './utils/session-dir.js';
export type {
  SessionKind,
  ParsedSessionDir,
  DiscoveredSessionDir,
} from './utils/session-dir.js';
export { parseMarkdownTable } from './utils/markdown-table.js';
export type { ParsedTable } from './utils/markdown-table.js';
export {
  CONFIDENTIALITY_LINES,
  CONFIDENTIALITY_HEADER_MD,
  CONFIDENTIALITY_NOTICE,
  hasConfidentialityHeader,
} from './utils/confidentiality.js';
export {
  INDEX_COLUMNS,
  ALL_BUGS_COLUMNS,
  INDEX_MD_HEADER,
  ALL_BUGS_MD_HEADER,
  headersMatchColumns,
  missingColumns,
  buildTableRow,
} from './utils/index-files.js';
export {
  QUALIOW_GITIGNORE_ENTRIES,
  QUALIOW_GITIGNORE_HEADER,
  mergeGitignore,
} from './utils/gitignore.js';
export {
  getPackageRoot,
  getPackageVersion,
  resolveSkillsSource,
  resolveTargetPath,
  resolveDataDir,
  resolveDomainPath,
  readEnvVar,
} from './utils/paths.js';
export {
  buildManifestRegistry,
  computeStats,
  syncKnowledgeManifest,
  listReleaseDirs,
} from './utils/kb-sync.js';
export type { RegistryEntry, ManifestStats, SyncResult } from './utils/kb-sync.js';
export { parseSession, parseBugReport, extractSection, extractNumberedList } from './utils/parse-session.js';
export type { ParsedSession, ParsedBug } from './utils/parse-session.js';

// Formatters
export { generateHtmlReport } from './formatters/html-report.js';
export { generateJsonReport } from './formatters/json-report.js';
export { generateJiraExport, csvEscape } from './formatters/jira-export.js';
export { generateMarkdownSummary } from './formatters/markdown-summary.js';
export {
  loadSessionForOutput,
  extractReportMeta,
  extractCoverage,
  extractListSection,
} from './formatters/common.js';
export type { ReportMeta, CoverageEntry } from './formatters/common.js';

// CLI runners (for programmatic use and tests)
export { runInit } from './cli/commands/init.js';
export type { InitOptions, InitResult, CopyRecord, CopyStatus } from './cli/commands/init.js';
export { runExplore, parseTimeBox } from './cli/commands/explore.js';
export { runReport, resolveSessionDir } from './cli/commands/report.js';
export { runList, readSessionIndex } from './cli/commands/list.js';
export type { ListOptions, SessionRow } from './cli/commands/list.js';
export { runValidate } from './cli/commands/validate.js';
export { runKb, runKbDigest } from './cli/commands/kb.js';
export type { KbDigestOptions } from './cli/commands/kb.js';
export {
  runJudgeTriage,
  judgeCommand,
  resolveProviders,
  combineRoutes,
  TriageNotEnabledError,
  EXIT_NOT_ENABLED,
  EXIT_UNAVAILABLE,
} from './cli/commands/judge.js';
export type { JudgeTriageOptions, JudgeTriageResult } from './cli/commands/judge.js';

// Decision-model triage (opt-in, advisory)
export {
  callSystemOne,
  assertResponse,
  estimateCostUsd,
  backoffMs,
  isLoopbackEndpoint,
  TriageApiError,
  JEV_ENDPOINT,
  JEV_MODEL,
  JEV_USD_PER_INPUT_TOKEN,
  LAYA_DEFAULT_ENDPOINT,
  LAYA_DEFAULT_MODEL,
  LAYA_DEFAULT_MAX_LEN,
} from './triage/client.js';
export type { CallOptions, CallResult } from './triage/client.js';
export { parseClaimCard, parseVerdictBlock, parseSeverityField, normaliseJudgeVerdict } from './triage/claim-parser.js';
export { scrubForTransmission } from './triage/scrub.js';
export type { ScrubResult } from './triage/scrub.js';
export {
  DEFAULT_EVIDENCE_MAX_LINES,
  DEFAULT_THRESHOLDS,
  EVIDENCE_NOTE,
  MAX_PATTERNS,
  MAX_STATE_CHARS,
  SEVERITY_CRITERIA,
  VERDICT_CRITERIA,
  buildQuestionSet,
  buildTriageState,
  collectEvidence,
  fitStateToBudget,
  loadFalsePositivePatterns,
  normaliseSeverity,
  renderTriageBlock,
  route,
  sessionDirOfClaim,
  toPredictedVerdict,
} from './triage/triage.js';
export type { TriageBlockInput } from './triage/triage.js';
export type * from './triage/types.js';
