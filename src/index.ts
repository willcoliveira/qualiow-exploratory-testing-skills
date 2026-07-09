// Types
export type {
  AuthConfig,
  BrowserConfig,
  ScopeConfig,
  SafetyConfig,
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
} from './schemas/index.js';

// Utilities
export { redact, containsSecrets } from './utils/redact.js';
export {
  validateTargetConfig,
  validateKnowledgeEntry,
  validateDomainConfig,
  validateAllConfigs,
} from './utils/validate.js';
export { appendSessionMetrics, readAllMetrics } from './utils/metrics.js';
export { parseSession, parseBugReport } from './utils/parse-session.js';
export type { ParsedSession, ParsedBug } from './utils/parse-session.js';

// Formatters
export { generateHtmlReport } from './formatters/html-report.js';
export { generateJsonReport } from './formatters/json-report.js';
export { generateJiraExport } from './formatters/jira-export.js';
