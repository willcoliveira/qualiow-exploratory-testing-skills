/**
 * JSON report generator.
 * Produces structured, redacted JSON from session data for programmatic
 * consumption. Carries a classification block so downstream tooling can
 * honour the confidentiality of the content.
 */

import {
  loadSessionForOutput,
  extractCoverage,
  extractListSection,
} from './common.js';
import { CONFIDENTIALITY_NOTICE } from '../utils/confidentiality.js';
import { parseSessionDirName } from '../utils/session-dir.js';
import { getPackageVersion } from '../utils/paths.js';

// ─── Report metadata extraction ─────────────────────────────────────

function extractTarget(report: string, sessionId: string): string {
  const match =
    report.match(/\*\*Application:\*\*\s*(.+)/i) ??
    report.match(/\*\*Target:\*\*\s*(.+)/i) ??
    report.match(/\|\s*Target\s*\|\s*(.+?)\s*\|/i);
  if (match) return match[1].trim();
  return parseSessionDirName(sessionId)?.slug ?? sessionId;
}

function extractDate(report: string): string {
  const match =
    report.match(/\*\*Date:\*\*\s*(\d{4}-\d{2}-\d{2})/i) ??
    report.match(/\|\s*Date\s*\|\s*(\d{4}-\d{2}-\d{2})\s*\|/i);
  return match ? match[1] : '';
}

function extractDuration(report: string): number {
  const match =
    report.match(/\*\*Duration:\*\*\s*~?(\d+)\s*min/i) ??
    report.match(/\|\s*Duration\s*\|\s*~?(\d+)\s*min/i);
  return match ? parseInt(match[1], 10) : 0;
}

function extractPagesExplored(report: string): number {
  const match = report.match(/Pages\s+Explored\s*\|\s*(\d+)/i);
  return match ? parseInt(match[1], 10) : 0;
}

// ─── Public API ─────────────────────────────────────────────────────

/** Generates a structured, redacted JSON report from a session directory. */
export async function generateJsonReport(sessionDir: string): Promise<object> {
  const { session, report } = await loadSessionForOutput(sessionDir);

  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const bug of session.bugs) {
    counts[bug.severity]++;
  }

  const coverage = extractCoverage(report).map((c) => ({
    area: c.area,
    risk: c.risk,
    status: c.status,
    bugs_found: parseInt(c.bugsFound, 10) || 0,
    notes: c.notes,
  }));

  return {
    meta: {
      classification: 'CONFIDENTIAL',
      notice: CONFIDENTIALITY_NOTICE,
      generated_by: `qualiow-exploratory-testing ${getPackageVersion()}`,
      generated_at: new Date().toISOString(),
      redacted: true,
    },
    session: {
      id: session.id,
      kind: parseSessionDirName(session.id)?.kind ?? null,
      target: extractTarget(report, session.id),
      date: extractDate(report),
      duration_min: extractDuration(report),
    },
    summary: {
      total_bugs: session.bugs.length,
      critical: counts.critical,
      high: counts.high,
      medium: counts.medium,
      low: counts.low,
      pages_explored: extractPagesExplored(report),
    },
    bugs: session.bugs.map((bug) => ({
      id: bug.id,
      title: bug.title,
      severity: bug.severity,
      priority: bug.priority,
      component: bug.component,
      url: bug.url,
      environment: bug.environment,
      reproduction_rate: bug.reproduction_rate,
      summary: bug.summary,
      business_impact: bug.business_impact,
      steps: bug.steps,
      evidence: bug.evidence,
    })),
    coverage,
    observations: extractListSection(report, 'Observations'),
    recommendations: extractListSection(report, 'Recommendations'),
  };
}
