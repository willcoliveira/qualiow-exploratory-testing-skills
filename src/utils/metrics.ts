import { readFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { SessionMetricsSchema } from '../schemas/session-metrics.schema.js';
import type { SessionMetrics } from '../types/index.js';

const METRICS_FILENAME = 'metrics.jsonl';

/**
 * Appends a single session metrics record to the JSONL file.
 * Creates the output directory and file if they do not exist.
 */
export function appendSessionMetrics(
  outputDir: string,
  metrics: SessionMetrics,
): void {
  // Validate before writing
  SessionMetricsSchema.parse(metrics);

  const filePath = join(outputDir, METRICS_FILENAME);
  const dir = dirname(filePath);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const line = JSON.stringify(metrics) + '\n';
  appendFileSync(filePath, line, 'utf-8');
}

/**
 * Reads all session metrics from the JSONL file.
 * Returns an empty array if the file does not exist or is empty.
 */
export function readAllMetrics(outputDir: string): SessionMetrics[] {
  const filePath = join(outputDir, METRICS_FILENAME);

  if (!existsSync(filePath)) {
    return [];
  }

  const content = readFileSync(filePath, 'utf-8').trim();
  if (!content) {
    return [];
  }

  const lines = content.split('\n');
  const results: SessionMetrics[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      // Skip a corrupt JSONL line rather than throwing on the whole file.
      continue;
    }
    const result = SessionMetricsSchema.safeParse(parsed);
    if (result.success) results.push(result.data);
  }

  return results;
}

/** Appends metrics only when the session_id has not been recorded yet. */
export function appendSessionMetricsDeduped(
  outputDir: string,
  metrics: SessionMetrics,
): boolean {
  const existing = readAllMetrics(outputDir);
  if (existing.some((m) => m.session_id === metrics.session_id)) {
    return false;
  }
  appendSessionMetrics(outputDir, metrics);
  return true;
}
