/**
 * Shared report-extraction helpers used by the HTML and JSON formatters.
 * Everything user-authored (the report body and every bug field) is redacted
 * on the way out.
 */

import { parseSession } from '../utils/parse-session.js';
import type { ParsedSession, ParsedBug } from '../utils/parse-session.js';
import { redact } from '../utils/redact.js';
import { parseMarkdownTable } from '../utils/markdown-table.js';

export interface ReportMeta {
  target: string;
  date: string;
  duration: string;
  sessionId: string;
  summary: string;
}

export interface CoverageEntry {
  area: string;
  risk: string;
  status: string;
  bugsFound: string;
  notes: string;
}

function redactString(s: string): string {
  return s ? redact(s).text : s;
}

function redactBug(bug: ParsedBug): ParsedBug {
  return {
    ...bug,
    title: redactString(bug.title),
    url: redactString(bug.url),
    environment: redactString(bug.environment),
    summary: redactString(bug.summary),
    expected: redactString(bug.expected),
    actual: redactString(bug.actual),
    steps: bug.steps.map(redactString),
    business_impact: redactString(bug.business_impact),
    evidence: {
      screenshots: bug.evidence.screenshots.map(redactString),
      videos: bug.evidence.videos.map(redactString),
      logs: bug.evidence.logs.map(redactString),
      console_errors: bug.evidence.console_errors.map(redactString),
      network_failures: bug.evidence.network_failures.map(redactString),
    },
  };
}

/** Loads a session and redacts its report body and every bug. */
export async function loadSessionForOutput(
  sessionDir: string,
): Promise<{ session: ParsedSession; report: string }> {
  const session = await parseSession(sessionDir);
  const report = session.report ? redact(session.report).text : '';
  return {
    session: { ...session, bugs: session.bugs.map(redactBug), report },
    report,
  };
}

export function extractReportMeta(report: string, sessionId: string): ReportMeta {
  const meta: ReportMeta = {
    target: sessionId,
    date: '',
    duration: '',
    sessionId,
    summary: '',
  };

  const dateMatch =
    report.match(/\*\*Date:\*\*\s*(.+)/i) ??
    report.match(/\|\s*Date\s*\|\s*(.+?)\s*\|/i);
  if (dateMatch) meta.date = dateMatch[1].trim();

  const durationMatch =
    report.match(/\*\*Duration:\*\*\s*(.+)/i) ??
    report.match(/\|\s*Duration\s*\|\s*(.+?)\s*\|/i);
  if (durationMatch) meta.duration = durationMatch[1].trim();

  const targetMatch =
    report.match(/\*\*Application:\*\*\s*(.+)/i) ??
    report.match(/\*\*Target:\*\*\s*(.+)/i) ??
    report.match(/\|\s*Target\s*\|\s*(.+?)\s*\|/i);
  if (targetMatch) meta.target = targetMatch[1].trim();

  const summaryMatch = report.match(
    /##\s+Executive Summary\s*\n+([\s\S]*?)(?=\n##\s|\n---|$)/i,
  );
  if (summaryMatch) meta.summary = summaryMatch[1].trim();

  return meta;
}

/**
 * Extracts the coverage-map table. Accepts the canonical header
 * `| Area | Risk | Status | Bugs | Notes |` and the legacy `| Area | Status |`.
 */
export function extractCoverage(report: string): CoverageEntry[] {
  const table = parseMarkdownTable(report, { headingPrefix: 'Coverage' });
  if (!table) return [];
  return table.rows.map((row) => ({
    area: row['area'] ?? '',
    risk: row['risk'] ?? '',
    status: row['status'] ?? row['tested?'] ?? row['tested'] ?? '',
    bugsFound: row['bugs'] ?? row['bugs found'] ?? row['findings'] ?? '0',
    notes: row['notes'] ?? '',
  }));
}

export function extractListSection(report: string, heading: string): string[] {
  const items: string[] = [];
  const regex = new RegExp(
    `##\\s+${heading}\\s*\\n+([\\s\\S]*?)(?=\\n##\\s|\\n---|$)`,
    'i',
  );
  const match = report.match(regex);
  if (!match) return items;

  for (const line of match[1].split('\n')) {
    const itemMatch = line.match(/^[-*]\s+(?:\[.\]\s+)?(.+)/);
    if (itemMatch) items.push(itemMatch[1].trim());
    const numberedMatch = line.match(/^\d+\.\s+\*\*(.+?)\*\*\s*(.+)?/);
    if (numberedMatch) {
      const text = numberedMatch[2]
        ? `${numberedMatch[1]} ${numberedMatch[2]}`
        : numberedMatch[1];
      items.push(text.replace(/\s*--\s*/, ' -- '));
    }
  }
  return items;
}
