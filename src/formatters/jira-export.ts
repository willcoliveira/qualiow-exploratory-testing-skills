/**
 * Jira CSV export generator.
 * Produces a CSV file importable via Jira bulk import.
 */

import { parseSession } from '../utils/parse-session.js';
import type { ParsedBug } from '../utils/parse-session.js';

// ─── Severity to Jira priority mapping ──────────────────────────────

const SEVERITY_TO_JIRA_PRIORITY: Record<string, string> = {
  critical: 'Blocker',
  high: 'Critical',
  medium: 'Major',
  low: 'Minor',
};

// ─── CSV escaping ───────────────────────────────────────────────────

/**
 * Escapes a value for inclusion in a CSV field.
 * Wraps in double quotes and escapes internal double quotes.
 */
function csvEscape(value: string): string {
  if (!value) return '""';
  // Always quote to avoid issues with commas, newlines, quotes
  const escaped = value.replace(/"/g, '""');
  return `"${escaped}"`;
}

// ─── Description formatting ─────────────────────────────────────────

function formatDescription(bug: ParsedBug): string {
  const parts: string[] = [];

  if (bug.steps.length > 0) {
    parts.push('h3. Steps to Reproduce');
    for (const step of bug.steps) {
      parts.push(`# ${step}`);
    }
    parts.push('');
  }

  if (bug.expected) {
    parts.push(`h3. Expected Behavior`);
    parts.push(bug.expected);
    parts.push('');
  }

  if (bug.actual) {
    parts.push(`h3. Actual Behavior`);
    parts.push(bug.actual);
    parts.push('');
  }

  if (bug.business_impact) {
    parts.push('h3. Business Impact');
    parts.push(bug.business_impact);
    parts.push('');
  }

  if (bug.url) {
    parts.push(`h3. URL`);
    parts.push(bug.url);
  }

  return parts.join('\n');
}

// ─── Domain extraction ──────────────────────────────────────────────

function extractDomain(sessionId: string): string {
  // Attempt to extract domain from session ID (e.g. "2026-03-28-r2-parabank" -> "fintech")
  // Fallback to "general" since we cannot reliably determine domain from session ID alone
  return 'general';
}

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Generates a CSV string importable by Jira bulk import from a session directory.
 *
 * CSV columns:
 * - Summary: bug title
 * - Priority: mapped from severity
 * - Description: steps + business impact formatted in Jira wiki markup
 * - Component: from bug component field
 * - Labels: qualiow, exploratory-testing, domain
 */
export async function generateJiraExport(sessionDir: string): Promise<string> {
  const session = await parseSession(sessionDir);

  const headers = ['Summary', 'Priority', 'Description', 'Component', 'Labels'];
  const rows: string[] = [headers.join(',')];

  const domain = extractDomain(session.id);

  for (const bug of session.bugs) {
    const summary = `${bug.id}: ${bug.title}`;
    const priority = SEVERITY_TO_JIRA_PRIORITY[bug.severity] ?? 'Major';
    const description = formatDescription(bug);
    const component = bug.component || '';
    const labels = ['qualiow', 'exploratory-testing', domain]
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
