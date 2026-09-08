/**
 * Markdown summary generator for `qualiow report -f md`.
 * Produces a short, redacted `session-summary.md` next to the session report
 * (never overwriting `session-report.md`).
 */

import {
  loadSessionForOutput,
  extractReportMeta,
  extractCoverage,
  extractListSection,
} from './common.js';
import { CONFIDENTIALITY_HEADER_MD } from '../utils/confidentiality.js';

const SEVERITY_LABEL: Record<string, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export async function generateMarkdownSummary(sessionDir: string): Promise<string> {
  const { session, report } = await loadSessionForOutput(sessionDir);
  const meta = extractReportMeta(report, session.id);

  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const bug of session.bugs) counts[bug.severity]++;

  const lines: string[] = [];
  lines.push(CONFIDENTIALITY_HEADER_MD, '');
  lines.push(`# Session Summary — ${meta.target}`, '');
  lines.push('| Field | Value |', '|---|---|');
  lines.push(`| Session | ${session.id} |`);
  if (meta.date) lines.push(`| Date | ${meta.date} |`);
  if (meta.duration) lines.push(`| Duration | ${meta.duration} |`);
  lines.push(
    `| Bugs | ${session.bugs.length} (Critical ${counts.critical} · High ${counts.high} · Medium ${counts.medium} · Low ${counts.low}) |`,
    '',
  );

  if (meta.summary) {
    lines.push('## Executive Summary', '', meta.summary, '');
  }

  if (session.bugs.length) {
    lines.push('## Bugs', '', '| ID | Severity | Component | Title |', '|---|---|---|---|');
    for (const bug of session.bugs) {
      lines.push(
        `| ${bug.id} | ${SEVERITY_LABEL[bug.severity]} | ${bug.component || '—'} | ${bug.title} |`,
      );
    }
    lines.push('');
  }

  const coverage = extractCoverage(report);
  if (coverage.length) {
    lines.push('## Coverage', '', '| Area | Risk | Status | Bugs | Notes |', '|---|---|---|---|---|');
    for (const c of coverage) {
      lines.push(`| ${c.area} | ${c.risk} | ${c.status} | ${c.bugsFound} | ${c.notes} |`);
    }
    lines.push('');
  }

  const recommendations = extractListSection(report, 'Recommendations');
  if (recommendations.length) {
    lines.push('## Recommendations', '');
    for (const r of recommendations) lines.push(`- ${r}`);
    lines.push('');
  }

  return lines.join('\n');
}
