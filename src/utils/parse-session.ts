/**
 * Session and bug report parser.
 * Reads a session directory and extracts structured data
 * from markdown files produced during exploratory testing.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';

// ─── Types ──────────────────────────────────────────────────────────

export interface ParsedBug {
  id: string;
  title: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  component: string;
  url: string;
  expected: string;
  actual: string;
  steps: string[];
  business_impact: string;
  evidence: { screenshots: string[]; console_errors: string[] };
}

export interface ParsedSession {
  id: string;
  charter?: string;
  bugs: ParsedBug[];
  report?: string;
  phases: { name: string; content: string }[];
}

// ─── Severity helpers ───────────────────────────────────────────────

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function normalizeSeverity(raw: string): ParsedBug['severity'] {
  const lower = raw.toLowerCase().trim();
  if (lower === 'critical' || lower === 'high' || lower === 'medium' || lower === 'low') {
    return lower;
  }
  // Handle variants like "High (aggregate)"
  if (lower.startsWith('critical')) return 'critical';
  if (lower.startsWith('high')) return 'high';
  if (lower.startsWith('medium')) return 'medium';
  if (lower.startsWith('low')) return 'low';
  return 'medium';
}

// ─── Section extraction ─────────────────────────────────────────────

/**
 * Extracts the content under a markdown heading that starts with the
 * given prefix. Searches for both ## and ### level headings.
 */
function extractSection(content: string, headingPrefix: string): string {
  const lines = content.split('\n');
  let capturing = false;
  let capturedLevel = 0;
  const captured: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);

    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2].trim();

      if (text.toLowerCase().startsWith(headingPrefix.toLowerCase())) {
        capturing = true;
        capturedLevel = level;
        continue;
      }

      // Stop if we hit a heading at the same or higher level
      if (capturing && level <= capturedLevel) {
        break;
      }
    }

    if (capturing) {
      captured.push(line);
    }
  }

  return captured.join('\n').trim();
}

/**
 * Extracts numbered list items from markdown text.
 * Handles lines like "1. Navigate to ..." and continuation lines.
 */
function extractNumberedList(text: string): string[] {
  const steps: string[] = [];
  const lines = text.split('\n');

  for (const line of lines) {
    const match = line.match(/^\d+\.\s+(.+)$/);
    if (match) {
      steps.push(match[1].trim());
    }
  }

  return steps;
}

/**
 * Extracts screenshots and console errors from the evidence section.
 */
function extractEvidence(content: string): { screenshots: string[]; console_errors: string[] } {
  const screenshots: string[] = [];
  const console_errors: string[] = [];

  const evidenceText = extractSection(content, 'Evidence');
  if (!evidenceText) {
    return { screenshots, console_errors };
  }

  for (const line of evidenceText.split('\n')) {
    const trimmed = line.replace(/^[-*]\s*/, '').trim();

    if (/screenshot/i.test(trimmed)) {
      // Extract path if present
      const pathMatch = trimmed.match(/:\s*(.+)/);
      if (pathMatch) {
        screenshots.push(pathMatch[1].trim());
      }
    }

    if (/console\s*(error|log)/i.test(trimmed)) {
      const msgMatch = trimmed.match(/:\s*(.+)/);
      if (msgMatch && !/none/i.test(msgMatch[1])) {
        console_errors.push(msgMatch[1].trim());
      }
    }
  }

  return { screenshots, console_errors };
}

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Parses a single bug report markdown file into structured data.
 */
export async function parseBugReport(filePath: string): Promise<ParsedBug> {
  const content = readFileSync(filePath, 'utf-8');
  const filename = basename(filePath, '.md');

  // Extract ID from filename (e.g. BUG-R2-001, BUG-001)
  const id = filename;

  // Extract title from first heading: "# BUG-R2-001: Title here" or "## [Component] Title"
  let title = '';
  let component = '';

  const titleMatch = content.match(/^#\s+(?:BUG[-\w]*:\s*)?(.+)$/m)
    ?? content.match(/^##\s+(?:BUG[-\w]*:\s*)?(.+)$/m);

  if (titleMatch) {
    title = titleMatch[1].trim();
  }

  // Extract component from title — patterns: "[Login]", "[Login Form]"
  const componentMatch = title.match(/^\[([^\]]+)\]\s*/);
  if (componentMatch) {
    component = componentMatch[1];
    title = title.replace(/^\[[^\]]+\]\s*/, '').trim();
  }

  // If no bracketed component, try to extract from the title before "fails" or first word
  if (!component) {
    // Use the section before the first dash or the bug category from the report
    const categoryMatch = content.match(/\|\s*Category\s*\|\s*(.+?)\s*\|/i);
    if (categoryMatch) {
      component = categoryMatch[1].trim();
    }
  }

  // Extract severity: "## Severity: High" or "**Severity:** High"
  let severity: ParsedBug['severity'] = 'medium';
  const severityMatch = content.match(/\*\*Severity:\*\*\s*(.+)/i)
    ?? content.match(/^##\s+Severity:\s*(.+)/mi);
  if (severityMatch) {
    severity = normalizeSeverity(severityMatch[1]);
  }

  // Extract URL
  let url = '';
  const urlMatch = content.match(/\*\*URL:\*\*\s*(.+)/i)
    ?? content.match(/URL:\s*(https?:\/\/[^\s]+)/i);
  if (urlMatch) {
    url = urlMatch[1].trim();
  }

  // Extract expected behavior
  const expected = extractSection(content, 'Expected')
    .replace(/^_.*_\n?/, '')
    .replace(/^>\s*/gm, '')
    .trim();

  // Extract actual behavior
  const actual = extractSection(content, 'Actual')
    .replace(/^_.*_\n?/, '')
    .replace(/^>\s*/gm, '')
    .trim();

  // Extract steps
  const stepsSection = extractSection(content, 'Steps to Reproduce');
  const steps = extractNumberedList(stepsSection);

  // Extract business impact
  const business_impact = extractSection(content, 'Business Impact');

  // Extract evidence
  const evidence = extractEvidence(content);

  return {
    id,
    title,
    severity,
    component,
    url,
    expected,
    actual,
    steps,
    business_impact,
    evidence,
  };
}

/**
 * Parses an entire session directory into structured data.
 * Reads the session report, charter, phase files, and all bug reports.
 */
export async function parseSession(sessionDir: string): Promise<ParsedSession> {
  const id = basename(sessionDir);

  // Read charter if present
  let charter: string | undefined;
  const charterPath = join(sessionDir, 'charter.md');
  if (existsSync(charterPath)) {
    charter = readFileSync(charterPath, 'utf-8');
  }

  // Read session report if present
  let report: string | undefined;
  const reportPath = join(sessionDir, 'session-report.md');
  if (existsSync(reportPath)) {
    report = readFileSync(reportPath, 'utf-8');
  }

  // Read phase files
  const phases: { name: string; content: string }[] = [];
  if (existsSync(sessionDir)) {
    const files = readdirSync(sessionDir);
    const phaseFiles = files.filter((f) => /^phase-\d+/i.test(f)).sort();
    for (const file of phaseFiles) {
      const content = readFileSync(join(sessionDir, file), 'utf-8');
      const name = file.replace(/\.md$/, '');
      phases.push({ name, content });
    }
  }

  // Read and parse bug reports
  const bugsDir = join(sessionDir, 'bugs');
  const bugs: ParsedBug[] = [];

  if (existsSync(bugsDir)) {
    const bugFiles = readdirSync(bugsDir)
      .filter((f) => /^BUG-.*\.md$/i.test(f))
      .sort();

    for (const file of bugFiles) {
      const bug = await parseBugReport(join(bugsDir, file));
      bugs.push(bug);
    }
  }

  // Sort bugs by severity
  bugs.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  return {
    id,
    charter,
    bugs,
    report,
    phases,
  };
}
