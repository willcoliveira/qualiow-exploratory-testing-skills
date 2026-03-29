/**
 * HTML report generator.
 * Produces a standalone dark-mode HTML report from session data.
 * The template is inline to simplify distribution.
 */

import Handlebars from 'handlebars';
import { parseSession } from '../utils/parse-session.js';

// ─── Report metadata extraction ─────────────────────────────────────

interface ReportMeta {
  target: string;
  date: string;
  duration: string;
  sessionId: string;
  summary: string;
}

function extractReportMeta(report: string, sessionId: string): ReportMeta {
  const meta: ReportMeta = {
    target: sessionId,
    date: '',
    duration: '',
    sessionId,
    summary: '',
  };

  // Extract from session report metadata
  const dateMatch = report.match(/\*\*Date:\*\*\s*(.+)/i)
    ?? report.match(/\|\s*Date\s*\|\s*(.+?)\s*\|/i);
  if (dateMatch) meta.date = dateMatch[1].trim();

  const durationMatch = report.match(/\*\*Duration:\*\*\s*(.+)/i)
    ?? report.match(/\|\s*Duration\s*\|\s*(.+?)\s*\|/i);
  if (durationMatch) meta.duration = durationMatch[1].trim();

  const targetMatch = report.match(/\*\*Application:\*\*\s*(.+)/i)
    ?? report.match(/\*\*Target:\*\*\s*(.+)/i)
    ?? report.match(/\|\s*Target\s*\|\s*(.+?)\s*\|/i);
  if (targetMatch) meta.target = targetMatch[1].trim();

  // Extract executive summary
  const summaryMatch = report.match(/##\s+Executive Summary\s*\n+([\s\S]*?)(?=\n##\s|\n---)/i);
  if (summaryMatch) meta.summary = summaryMatch[1].trim();

  return meta;
}

// ─── Coverage extraction ────────────────────────────────────────────

interface CoverageEntry {
  area: string;
  status: string;
  bugsFound: string;
  notes: string;
}

function extractCoverage(report: string): CoverageEntry[] {
  const entries: CoverageEntry[] = [];

  // Look for coverage map table rows
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
        bugsFound: cells[3] || '0',
        notes: cells[4] || '',
      });
    }
  }

  return entries;
}

// ─── Observations and recommendations ───────────────────────────────

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
    // Also capture numbered items under sub-headings
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

// ─── Handlebars template ────────────────────────────────────────────

const HTML_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Qualiow Report — {{meta.target}}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: #0a0f1a;
      color: #e0e6ed;
      line-height: 1.6;
      padding: 2rem;
    }

    a { color: #3498db; text-decoration: none; }
    a:hover { text-decoration: underline; }

    .container { max-width: 960px; margin: 0 auto; }

    /* Header */
    .header {
      border-bottom: 2px solid #1e2a3a;
      padding-bottom: 1.5rem;
      margin-bottom: 2rem;
    }
    .header h1 {
      font-size: 1.75rem;
      font-weight: 700;
      color: #ffffff;
      margin-bottom: 0.25rem;
    }
    .header .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 1.5rem;
      font-size: 0.9rem;
      color: #8899aa;
      margin-top: 0.5rem;
    }
    .header .meta span { white-space: nowrap; }

    /* Stats cards */
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 1rem;
      margin-bottom: 2rem;
    }
    .stat-card {
      background: #111927;
      border-radius: 8px;
      padding: 1rem 1.25rem;
      text-align: center;
    }
    .stat-card .number {
      font-size: 2rem;
      font-weight: 700;
      display: block;
    }
    .stat-card .label {
      font-size: 0.8rem;
      color: #8899aa;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .stat-total .number { color: #e0e6ed; }
    .stat-critical .number { color: #ff4757; }
    .stat-high .number { color: #ffa502; }
    .stat-medium .number { color: #ffd32a; }
    .stat-low .number { color: #3498db; }

    /* Summary */
    .summary {
      background: #111927;
      border-radius: 8px;
      padding: 1.25rem 1.5rem;
      margin-bottom: 2rem;
      font-size: 0.95rem;
      color: #c0c8d0;
    }

    /* Section headings */
    .section-title {
      font-size: 1.25rem;
      font-weight: 600;
      color: #ffffff;
      margin: 2rem 0 1rem;
      padding-bottom: 0.5rem;
      border-bottom: 1px solid #1e2a3a;
    }

    /* Bug cards */
    .bug-card {
      background: #111927;
      border-radius: 8px;
      border-left: 4px solid #3498db;
      padding: 1.25rem 1.5rem;
      margin-bottom: 1rem;
    }
    .bug-card.severity-critical { border-left-color: #ff4757; }
    .bug-card.severity-high { border-left-color: #ffa502; }
    .bug-card.severity-medium { border-left-color: #ffd32a; }
    .bug-card.severity-low { border-left-color: #3498db; }

    .bug-card .bug-header {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-bottom: 0.75rem;
    }
    .bug-card .bug-title {
      font-size: 1rem;
      font-weight: 600;
      color: #ffffff;
      flex: 1;
      min-width: 200px;
    }

    .badge {
      display: inline-block;
      font-size: 0.7rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 0.2rem 0.5rem;
      border-radius: 4px;
      white-space: nowrap;
    }
    .badge-critical { background: #ff475733; color: #ff4757; }
    .badge-high { background: #ffa50233; color: #ffa502; }
    .badge-medium { background: #ffd32a33; color: #ffd32a; }
    .badge-low { background: #3498db33; color: #3498db; }
    .badge-component { background: #1e2a3a; color: #8899aa; }

    .bug-section-label {
      font-size: 0.8rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #8899aa;
      margin: 0.75rem 0 0.25rem;
    }

    .bug-card p,
    .bug-card li {
      font-size: 0.9rem;
      color: #c0c8d0;
    }

    .bug-card ol {
      padding-left: 1.25rem;
      margin: 0.25rem 0;
    }
    .bug-card ol li {
      margin-bottom: 0.15rem;
    }

    .bug-card .evidence-item {
      font-size: 0.85rem;
      color: #8899aa;
    }

    /* Coverage table */
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 1rem;
      font-size: 0.9rem;
    }
    th, td {
      text-align: left;
      padding: 0.5rem 0.75rem;
      border-bottom: 1px solid #1e2a3a;
    }
    th {
      font-size: 0.8rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #8899aa;
      font-weight: 600;
    }
    td { color: #c0c8d0; }

    /* Lists */
    .list-section ul {
      list-style: disc;
      padding-left: 1.25rem;
    }
    .list-section li {
      font-size: 0.9rem;
      color: #c0c8d0;
      margin-bottom: 0.35rem;
    }

    /* Footer */
    .footer {
      margin-top: 3rem;
      padding-top: 1.5rem;
      border-top: 1px solid #1e2a3a;
      text-align: center;
      font-size: 0.8rem;
      color: #556677;
    }

    /* Print styles */
    @media print {
      body {
        background: #ffffff;
        color: #1a1a1a;
        padding: 1rem;
      }
      .stat-card, .bug-card, .summary {
        background: #f5f5f5;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .stat-total .number { color: #1a1a1a; }
      .stat-critical .number { color: #cc0000; }
      .stat-high .number { color: #cc7700; }
      .stat-medium .number { color: #cc9900; }
      .stat-low .number { color: #2266aa; }
      .bug-card .bug-title { color: #1a1a1a; }
      th { color: #555555; }
      td, .bug-card p, .bug-card li, .list-section li { color: #333333; }
      .bug-section-label { color: #555555; }
      .footer { color: #999999; }
    }

    /* Responsive */
    @media (max-width: 600px) {
      body { padding: 1rem; }
      .header h1 { font-size: 1.35rem; }
      .stats { grid-template-columns: repeat(2, 1fr); }
      .bug-card .bug-header { flex-direction: column; align-items: flex-start; }
    }
  </style>
</head>
<body>
  <div class="container">

    <div class="header">
      <h1>Exploratory Testing Report</h1>
      <div class="meta">
        <span>Target: <strong>{{meta.target}}</strong></span>
        {{#if meta.date}}<span>Date: <strong>{{meta.date}}</strong></span>{{/if}}
        {{#if meta.duration}}<span>Duration: <strong>{{meta.duration}}</strong></span>{{/if}}
        <span>Session: <strong>{{meta.sessionId}}</strong></span>
      </div>
    </div>

    <div class="stats">
      <div class="stat-card stat-total">
        <span class="number">{{totalBugs}}</span>
        <span class="label">Total Bugs</span>
      </div>
      <div class="stat-card stat-critical">
        <span class="number">{{criticalCount}}</span>
        <span class="label">Critical</span>
      </div>
      <div class="stat-card stat-high">
        <span class="number">{{highCount}}</span>
        <span class="label">High</span>
      </div>
      <div class="stat-card stat-medium">
        <span class="number">{{mediumCount}}</span>
        <span class="label">Medium</span>
      </div>
      <div class="stat-card stat-low">
        <span class="number">{{lowCount}}</span>
        <span class="label">Low</span>
      </div>
    </div>

    {{#if meta.summary}}
    <div class="summary">{{meta.summary}}</div>
    {{/if}}

    <h2 class="section-title">Bugs Found</h2>

    {{#each bugs}}
    <div class="bug-card severity-{{this.severity}}">
      <div class="bug-header">
        <span class="bug-title">{{this.id}}: {{this.title}}</span>
        <span class="badge badge-{{this.severity}}">{{this.severity}}</span>
        {{#if this.component}}<span class="badge badge-component">{{this.component}}</span>{{/if}}
      </div>

      {{#if this.business_impact}}
      <div class="bug-section-label">Business Impact</div>
      <p>{{this.business_impact_summary}}</p>
      {{/if}}

      {{#if this.steps.length}}
      <div class="bug-section-label">Steps to Reproduce</div>
      <ol>
        {{#each this.steps}}
        <li>{{this}}</li>
        {{/each}}
      </ol>
      {{/if}}

      {{#if this.hasEvidence}}
      <div class="bug-section-label">Evidence</div>
      {{#each this.evidence.screenshots}}
      <p class="evidence-item">Screenshot: {{this}}</p>
      {{/each}}
      {{#each this.evidence.console_errors}}
      <p class="evidence-item">Console: {{this}}</p>
      {{/each}}
      {{/if}}
    </div>
    {{/each}}

    {{#if coverage.length}}
    <h2 class="section-title">Coverage Map</h2>
    <table>
      <thead>
        <tr>
          <th>Area</th>
          <th>Status</th>
          <th>Bugs</th>
          <th>Notes</th>
        </tr>
      </thead>
      <tbody>
        {{#each coverage}}
        <tr>
          <td>{{this.area}}</td>
          <td>{{this.status}}</td>
          <td>{{this.bugsFound}}</td>
          <td>{{this.notes}}</td>
        </tr>
        {{/each}}
      </tbody>
    </table>
    {{/if}}

    {{#if observations.length}}
    <h2 class="section-title">Observations</h2>
    <div class="list-section">
      <ul>
        {{#each observations}}
        <li>{{this}}</li>
        {{/each}}
      </ul>
    </div>
    {{/if}}

    {{#if recommendations.length}}
    <h2 class="section-title">Recommendations</h2>
    <div class="list-section">
      <ul>
        {{#each recommendations}}
        <li>{{this}}</li>
        {{/each}}
      </ul>
    </div>
    {{/if}}

    <div class="footer">
      Generated by Qualiow Exploratory Testing
    </div>

  </div>
</body>
</html>`;

// ─── Template compilation ───────────────────────────────────────────

const compiledTemplate = Handlebars.compile(HTML_TEMPLATE);

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Generates a self-contained dark-mode HTML report from a session directory.
 */
export async function generateHtmlReport(sessionDir: string): Promise<string> {
  const session = await parseSession(sessionDir);

  const report = session.report ?? '';
  const meta = extractReportMeta(report, session.id);
  const coverage = extractCoverage(report);
  const observations = extractListSection(report, 'Observations');
  const recommendations = extractListSection(report, 'Recommendations');

  // Count severities
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const bug of session.bugs) {
    counts[bug.severity]++;
  }

  // Prepare bug data for the template
  const bugsForTemplate = session.bugs.map((bug) => ({
    ...bug,
    business_impact_summary: summarizeBusinessImpact(bug.business_impact),
    hasEvidence:
      bug.evidence.screenshots.length > 0 ||
      bug.evidence.console_errors.length > 0,
  }));

  const html = compiledTemplate({
    meta,
    totalBugs: session.bugs.length,
    criticalCount: counts.critical,
    highCount: counts.high,
    mediumCount: counts.medium,
    lowCount: counts.low,
    bugs: bugsForTemplate,
    coverage,
    observations,
    recommendations,
  });

  return html;
}

/**
 * Extracts a one-line summary from the business impact section.
 * Takes the first meaningful line or sentence.
 */
function summarizeBusinessImpact(impact: string): string {
  if (!impact) return '';

  const lines = impact.split('\n').filter((l) => l.trim());
  const summaryLines: string[] = [];

  for (const line of lines) {
    const cleaned = line
      .replace(/^[-*]\s*/, '')
      .replace(/^\*\*[^*]+\*\*\s*/, '')
      .trim();
    if (cleaned) {
      summaryLines.push(cleaned);
    }
  }

  // Return first 2-3 meaningful points joined
  return summaryLines.slice(0, 3).join(' ');
}
