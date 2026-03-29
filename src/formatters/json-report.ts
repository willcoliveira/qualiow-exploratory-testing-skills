/**
 * JSON report generator.
 * Produces structured JSON from session data for programmatic consumption.
 */

import { parseSession } from '../utils/parse-session.js';

// ─── Report metadata extraction ─────────────────────────────────────

function extractTarget(report: string, sessionId: string): string {
  const match = report.match(/\*\*Application:\*\*\s*(.+)/i)
    ?? report.match(/\*\*Target:\*\*\s*(.+)/i)
    ?? report.match(/\|\s*Target\s*\|\s*(.+?)\s*\|/i);
  if (match) return match[1].trim();

  // Fallback: extract from session ID (e.g. "2026-03-28-r2-parabank" -> "parabank")
  const parts = sessionId.split('-');
  return parts[parts.length - 1] || sessionId;
}

function extractDate(report: string): string {
  const match = report.match(/\*\*Date:\*\*\s*(\d{4}-\d{2}-\d{2})/i)
    ?? report.match(/\|\s*Date\s*\|\s*(\d{4}-\d{2}-\d{2})\s*\|/i);
  return match ? match[1] : '';
}

function extractDuration(report: string): number {
  const match = report.match(/\*\*Duration:\*\*\s*~?(\d+)\s*min/i)
    ?? report.match(/\|\s*Duration\s*\|\s*~?(\d+)\s*min/i);
  return match ? parseInt(match[1], 10) : 0;
}

function extractPagesExplored(report: string): number {
  const match = report.match(/Pages\s+Explored\s*\|\s*(\d+)/i);
  return match ? parseInt(match[1], 10) : 0;
}

// ─── Coverage extraction ────────────────────────────────────────────

interface CoverageEntry {
  area: string;
  status: string;
  bugs_found: number;
  notes: string;
}

function extractCoverage(report: string): CoverageEntry[] {
  const entries: CoverageEntry[] = [];
  const tableMatch = report.match(
    /\|\s*Area\s*\|\s*Status\s*\|[\s\S]*?\n((?:\|.+\|.+\n?)+)/i,
  );
  if (!tableMatch) return entries;

  const rows = tableMatch[1].split('\n').filter((r) => r.trim().startsWith('|'));
  for (const row of rows) {
    const cells = row.split('|').map((c) => c.trim()).filter(Boolean);
    if (cells.length >= 2 && !cells[0].startsWith('---')) {
      entries.push({
        area: cells[0] || '',
        status: cells[1] || '',
        bugs_found: parseInt(cells[3] || '0', 10) || 0,
        notes: cells[4] || '',
      });
    }
  }
  return entries;
}

// ─── List extraction ────────────────────────────────────────────────

function extractListSection(report: string, heading: string): string[] {
  const items: string[] = [];
  const regex = new RegExp(`##\\s+${heading}\\s*\\n+([\\s\\S]*?)(?=\\n##\\s|\\n---|$)`, 'i');
  const match = report.match(regex);
  if (!match) return items;

  for (const line of match[1].split('\n')) {
    const itemMatch = line.match(/^[-*]\s+(?:\[.\]\s+)?(.+)/);
    if (itemMatch) {
      items.push(itemMatch[1].trim());
    }
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

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Generates a structured JSON report from a session directory.
 */
export async function generateJsonReport(sessionDir: string): Promise<object> {
  const session = await parseSession(sessionDir);
  const report = session.report ?? '';

  const target = extractTarget(report, session.id);
  const date = extractDate(report);
  const duration_min = extractDuration(report);
  const pages_explored = extractPagesExplored(report);

  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const bug of session.bugs) {
    counts[bug.severity]++;
  }

  const coverage = extractCoverage(report);
  const observations = extractListSection(report, 'Observations');
  const recommendations = extractListSection(report, 'Recommendations');

  return {
    session: {
      id: session.id,
      target,
      date,
      duration_min,
    },
    summary: {
      total_bugs: session.bugs.length,
      critical: counts.critical,
      high: counts.high,
      medium: counts.medium,
      low: counts.low,
      pages_explored,
    },
    bugs: session.bugs.map((bug) => ({
      id: bug.id,
      title: bug.title,
      severity: bug.severity,
      component: bug.component,
      url: bug.url,
      business_impact: bug.business_impact,
      steps: bug.steps,
      evidence: bug.evidence,
    })),
    coverage,
    observations,
    recommendations,
  };
}
