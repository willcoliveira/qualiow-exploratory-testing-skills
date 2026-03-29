import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { parseBugReport, parseSession } from '../../src/utils/parse-session.js';

const FIXTURES_DIR = join(process.cwd(), 'tests', 'fixtures', 'sample-session');

describe('parseBugReport', () => {
  it('should parse a bug report with all fields', async () => {
    const bug = await parseBugReport(
      join(FIXTURES_DIR, 'bugs', 'BUG-001.md'),
    );

    expect(bug.id).toBe('BUG-001');
    expect(bug.title).toBe(
      'Password field accepts unlimited length causing potential DoS',
    );
    expect(bug.severity).toBe('high');
    expect(bug.component).toBe('Login');
    expect(bug.url).toBe('https://example.com/login');
    expect(bug.steps).toHaveLength(5);
    expect(bug.steps[0]).toBe('Navigate to https://example.com/login');
    expect(bug.steps[4]).toContain('30+ seconds');
    expect(bug.business_impact).toContain('Revenue impact');
    expect(bug.expected).toContain('128 characters');
    expect(bug.actual).toContain('unlimited length');
  });

  it('should extract evidence screenshots', async () => {
    const bug = await parseBugReport(
      join(FIXTURES_DIR, 'bugs', 'BUG-001.md'),
    );

    expect(bug.evidence.screenshots).toHaveLength(1);
    expect(bug.evidence.screenshots[0]).toContain('bug-001-long-password.png');
  });

  it('should parse a critical severity bug', async () => {
    const bug = await parseBugReport(
      join(FIXTURES_DIR, 'bugs', 'BUG-002.md'),
    );

    expect(bug.severity).toBe('critical');
    expect(bug.component).toBe('Search');
    expect(bug.steps).toHaveLength(4);
  });

  it('should parse a low severity bug', async () => {
    const bug = await parseBugReport(
      join(FIXTURES_DIR, 'bugs', 'BUG-003.md'),
    );

    expect(bug.severity).toBe('low');
    expect(bug.component).toBe('Dashboard');
  });

  it('should handle missing sections gracefully', async () => {
    // BUG-003 has all sections, but we test that extraction
    // does not throw even if content is minimal
    const bug = await parseBugReport(
      join(FIXTURES_DIR, 'bugs', 'BUG-003.md'),
    );

    expect(bug.id).toBe('BUG-003');
    expect(bug.steps).toHaveLength(4);
    // Console errors should be empty (the evidence says "None")
    expect(bug.evidence.console_errors).toHaveLength(0);
  });
});

describe('parseSession', () => {
  it('should parse a session directory with multiple bugs', async () => {
    const session = await parseSession(FIXTURES_DIR);

    expect(session.id).toBe('sample-session');
    expect(session.bugs).toHaveLength(3);
    expect(session.report).toBeTruthy();
  });

  it('should sort bugs by severity (critical first)', async () => {
    const session = await parseSession(FIXTURES_DIR);

    expect(session.bugs[0].severity).toBe('critical');
    expect(session.bugs[1].severity).toBe('high');
    expect(session.bugs[2].severity).toBe('low');
  });

  it('should read the session report', async () => {
    const session = await parseSession(FIXTURES_DIR);

    expect(session.report).toContain('Executive Summary');
    expect(session.report).toContain('Example App');
  });

  it('should return empty bugs array for session without bugs directory', async () => {
    // Use the fixtures directory itself (no bugs/ subdir)
    const session = await parseSession(
      join(process.cwd(), 'tests', 'fixtures'),
    );

    expect(session.bugs).toEqual([]);
  });

  it('should handle missing session report gracefully', async () => {
    // Use the fixtures directory itself (no session-report.md)
    const session = await parseSession(
      join(process.cwd(), 'tests', 'fixtures'),
    );

    expect(session.report).toBeUndefined();
  });
});
