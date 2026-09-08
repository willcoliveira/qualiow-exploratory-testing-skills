import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { hasConfidentialityHeader } from '../../src/utils/confidentiality.js';
import { parseBugReport } from '../../src/utils/parse-session.js';

const TEMPLATES_DIR = resolve(process.cwd(), 'data', 'templates');

describe('every template starts with the confidentiality header', () => {
  const files = readdirSync(TEMPLATES_DIR).filter((f) => f.endsWith('.md')).sort();

  it('finds all six templates', () => {
    expect(files).toHaveLength(6);
  });

  for (const file of files) {
    it(`${file} starts (after optional blank lines) with the confidentiality header`, () => {
      const content = readFileSync(join(TEMPLATES_DIR, file), 'utf-8');
      expect(hasConfidentialityHeader(content)).toBe(true);
    });
  }
});

describe('data/templates/bug-report.md', () => {
  const filePath = join(TEMPLATES_DIR, 'bug-report.md');
  const content = readFileSync(filePath, 'utf-8');

  it('carries the fields parseBugReport looks for', () => {
    expect(content).toMatch(/^# BUG-NNN:/m);
    expect(content).toContain('**Severity:**');
    expect(content).toContain('**URL:**');
    expect(content).toContain('## Business Impact');
    expect(content).toContain('## Evidence');
  });

  it('parses without throwing and yields placeholder-shaped fields', async () => {
    const bug = await parseBugReport(filePath);

    // Title still carries at least one [Placeholder]-style bracket.
    expect(bug.title).toMatch(/\[[^\]]+\]/);
    // Severity is normalized to one of the four recognized levels, even
    // though the template lists all four as alternatives.
    expect(['critical', 'high', 'medium', 'low']).toContain(bug.severity);
    expect(bug.url.length).toBeGreaterThan(0);
    expect(bug.business_impact.length).toBeGreaterThan(0);
  });
});
