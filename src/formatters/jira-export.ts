/**
 * Jira CSV export generator.
 * Produces a CSV file importable via Jira bulk import. Every field is redacted
 * and formula-neutralised before it is written.
 */

import { loadSessionForOutput } from './common.js';
import type { ParsedBug } from '../utils/parse-session.js';
import { parseSessionDirName } from '../utils/session-dir.js';
import { CONFIDENTIALITY_NOTICE } from '../utils/confidentiality.js';

// ─── Severity to Jira priority mapping ──────────────────────────────

const SEVERITY_TO_JIRA_PRIORITY: Record<string, string> = {
  critical: 'Blocker',
  high: 'Critical',
  medium: 'Major',
  low: 'Minor',
};

// ─── CSV escaping ───────────────────────────────────────────────────

/**
 * Escapes a value for a CSV field: always quoted, internal quotes doubled,
 * and a leading `= + - @ \t \r` neutralised with an apostrophe so the cell
 * is never evaluated as a formula when the file is opened in a spreadsheet.
 */
export function csvEscape(value: string): string {
  if (!value) return '""';
  let v = value;
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  return `"${v.replace(/"/g, '""')}"`;
}

// ─── Description formatting ─────────────────────────────────────────

function formatDescription(bug: ParsedBug): string {
  const parts: string[] = [];

  if (bug.summary) {
    parts.push(bug.summary, '');
  }
  if (bug.steps.length > 0) {
    parts.push('h3. Steps to Reproduce');
    for (const step of bug.steps) parts.push(`# ${step}`);
    parts.push('');
  }
  if (bug.expected) {
    parts.push('h3. Expected Behavior', bug.expected, '');
  }
  if (bug.actual) {
    parts.push('h3. Actual Behavior', bug.actual, '');
  }
  if (bug.business_impact) {
    parts.push('h3. Business Impact', bug.business_impact, '');
  }
  if (bug.environment) {
    parts.push('h3. Environment', bug.environment, '');
  }
  if (bug.url) {
    parts.push('h3. URL', bug.url, '');
  }
  parts.push(`_${CONFIDENTIALITY_NOTICE}_`);

  return parts.join('\n');
}

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Generates a CSV string importable by Jira bulk import from a session directory.
 *
 * Columns: Summary, Priority, Description, Component, Labels.
 */
export async function generateJiraExport(sessionDir: string): Promise<string> {
  const { session } = await loadSessionForOutput(sessionDir);

  const headers = ['Summary', 'Priority', 'Description', 'Component', 'Labels'];
  const rows: string[] = [headers.join(',')];
  const kind = parseSessionDirName(session.id)?.kind ?? '';

  for (const bug of session.bugs) {
    const summary = `${bug.id}: ${bug.title}`;
    const priority = SEVERITY_TO_JIRA_PRIORITY[bug.severity] ?? 'Major';
    const description = formatDescription(bug);
    const component = bug.component || '';
    const labels = ['qualiow', 'exploratory-testing', kind]
      .filter(Boolean)
      .join(' ');

    rows.push(
      [
        csvEscape(summary),
        csvEscape(priority),
        csvEscape(description),
        csvEscape(component),
        csvEscape(labels),
      ].join(','),
    );
  }

  return rows.join('\n');
}
