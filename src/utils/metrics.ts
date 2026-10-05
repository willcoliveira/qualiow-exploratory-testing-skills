import { readFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import {
  AREA_STATUSES,
  RISK_TIERS,
  SessionMetricsRecordSchema,
  SessionMetricsSchema,
} from '../schemas/session-metrics.schema.js';
import type { RiskTier, SessionMetrics, SessionMetricsRecord } from '../types/index.js';

const METRICS_FILENAME = 'metrics.jsonl';

function zeroStatusCounts(): Record<string, number> {
  return Object.fromEntries(AREA_STATUSES.map((s) => [s, 0]));
}

/**
 * The copy of a session's stats that `metrics.jsonl` keeps. A contract-1
 * session is recorded as it is. A contract-2 session's `coverage.areas` becomes
 * counts — by status and, when the charter tiers are known, by tier — and its
 * `coverage_level` becomes the level, the tiers and the gap codes: no area
 * reason, evidence file name or `areas_not_tested` text reaches the metrics file.
 */
export function reduceForMetrics(
  metrics: SessionMetrics,
  areaTiers?: Record<string, RiskTier>,
): SessionMetricsRecord {
  if (metrics.contract !== 2) return metrics;

  const { coverage_level, areas_not_tested: _dropped, ...rest } = metrics;
  void _dropped;
  const record: SessionMetricsRecord = { ...rest };

  if (metrics.coverage) {
    const coverage: Record<string, unknown> = { ...metrics.coverage };
    const areas = metrics.coverage.areas;
    if (Array.isArray(areas)) {
      const byStatus = zeroStatusCounts();
      const byTier: Record<string, Record<string, number>> = {};
      if (areaTiers) for (const t of RISK_TIERS) byTier[t] = zeroStatusCounts();
      for (const area of areas) {
        const a = (area ?? {}) as { id?: unknown; status?: unknown };
        const status = typeof a.status === 'string' && a.status in byStatus ? a.status : null;
        if (!status) continue;
        byStatus[status]++;
        const tier = areaTiers && typeof a.id === 'string' ? areaTiers[a.id] : undefined;
        if (tier) byTier[tier][status]++;
      }
      coverage.areas = {
        total: areas.length,
        by_status: byStatus,
        ...(areaTiers ? { by_tier: byTier } : {}),
      };
    }
    record.coverage = coverage;
  }

  if (coverage_level) {
    record.coverage_level = {
      level: coverage_level.level,
      tiers: { ...coverage_level.tiers },
      gaps: coverage_level.gaps.map((g) => g.code),
    };
  }
  return record;
}

/**
 * Appends a single session metrics record to the JSONL file.
 * Creates the output directory and file if they do not exist.
 * A contract-2 record is reduced first (`reduceForMetrics`).
 */
export function appendSessionMetrics(
  outputDir: string,
  metrics: SessionMetrics,
  opts: { areaTiers?: Record<string, RiskTier> } = {},
): void {
  // Validate before writing
  SessionMetricsSchema.parse(metrics);
  const record = reduceForMetrics(metrics, opts.areaTiers);
  // The line is written as built (key order kept); the parse only proves it reads back.
  SessionMetricsRecordSchema.parse(record);

  const filePath = join(outputDir, METRICS_FILENAME);
  const dir = dirname(filePath);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const line = JSON.stringify(record) + '\n';
  appendFileSync(filePath, line, 'utf-8');
}

/**
 * Reads all session metrics from the JSONL file.
 * Returns an empty array if the file does not exist or is empty.
 */
export function readAllMetrics(outputDir: string): SessionMetricsRecord[] {
  const filePath = join(outputDir, METRICS_FILENAME);

  if (!existsSync(filePath)) {
    return [];
  }

  const content = readFileSync(filePath, 'utf-8').trim();
  if (!content) {
    return [];
  }

  const lines = content.split('\n');
  const results: SessionMetricsRecord[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      // Skip a corrupt JSONL line rather than throwing on the whole file.
      continue;
    }
    const result = SessionMetricsRecordSchema.safeParse(parsed);
    if (result.success) results.push(result.data as SessionMetricsRecord);
  }

  return results;
}

/** Appends metrics only when the session_id has not been recorded yet. */
export function appendSessionMetricsDeduped(
  outputDir: string,
  metrics: SessionMetrics,
  opts: { areaTiers?: Record<string, RiskTier> } = {},
): boolean {
  const existing = readAllMetrics(outputDir);
  if (existing.some((m) => m.session_id === metrics.session_id)) {
    return false;
  }
  appendSessionMetrics(outputDir, metrics, opts);
  return true;
}
