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
    if (line.trim()) {
      const parsed = JSON.parse(line);
      results.push(SessionMetricsSchema.parse(parsed));
    }
  }

  return results;
}
