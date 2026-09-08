import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractCoverage } from '../../src/formatters/common.js';
import { csvEscape } from '../../src/formatters/jira-export.js';
import { generateMarkdownSummary } from '../../src/formatters/markdown-summary.js';

const CANONICAL_SESSION_DIR = join(
  process.cwd(),
  'tests',
  'fixtures',
  'canonical-session',
  '2026-09-08-1813-explore-example',
);

describe('extractCoverage — canonical report', () => {
  const report = readFileSync(join(CANONICAL_SESSION_DIR, 'session-report.md'), 'utf-8');
  const coverage = extractCoverage(report);

  it('keeps all three rows', () => {
    expect(coverage).toHaveLength(3);
  });

  it('keeps an empty Notes cell aligned rather than dropping it', () => {
    const checkout = coverage.find((c) => c.area === 'Checkout');
    expect(checkout).toBeDefined();
    expect(checkout!.bugsFound).toBe('1');
    expect(checkout!.notes).toBe('');
  });

  it('keeps an empty Bugs cell aligned rather than dropping it', () => {
    const search = coverage.find((c) => c.area === 'Search');
    expect(search).toBeDefined();
    expect(search!.bugsFound).toBe('');
    expect(search!.notes).toContain('Time box expired');
  });

  it('reads the fully populated row correctly', () => {
    const login = coverage.find((c) => c.area === 'Login');
    expect(login).toEqual({
      area: 'Login',
      risk: 'P0',
      status: 'tested',
      bugsFound: '0',
      notes: 'Happy path and invalid credentials both verified',
    });
  });
});

describe('extractCoverage — legacy two-column header', () => {
  it('still parses | Area | Status | tables', () => {
    const report = [
      '## Coverage Map',
      '',
      '| Area | Status |',
      '|---|---|',
      '| Login | tested |',
      '| Cart | partial |',
    ].join('\n');

    const coverage = extractCoverage(report);
    expect(coverage).toEqual([
      { area: 'Login', risk: '', status: 'tested', bugsFound: '0', notes: '' },
      { area: 'Cart', risk: '', status: 'partial', bugsFound: '0', notes: '' },
    ]);
  });
});

describe('csvEscape', () => {
  it('neutralises a leading formula character with a quoted leading apostrophe', () => {
    expect(csvEscape('=cmd()')).toBe('"\'=cmd()"');
  });

  it('doubles internal double quotes', () => {
    expect(csvEscape('a"b')).toBe('"a""b"');
  });

  it('renders an empty string as an empty quoted field', () => {
    expect(csvEscape('')).toBe('""');
  });
});

describe('generateMarkdownSummary — canonical session', () => {
  it('lists both bugs', async () => {
    const content = await generateMarkdownSummary(CANONICAL_SESSION_DIR);
    expect(content).toContain('BUG-001');
    expect(content).toContain('BUG-002');
  });

  it('starts with the confidentiality header', async () => {
    const content = await generateMarkdownSummary(CANONICAL_SESSION_DIR);
    expect(content.startsWith('> CONFIDENTIAL:')).toBe(true);
  });
});
