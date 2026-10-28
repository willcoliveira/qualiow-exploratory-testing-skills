/**
 * A Windows checkout (core.autocrlf) or an editor there gives every markdown file
 * CRLF line ends. Each parser must read such a file exactly as it reads the LF one.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseBugReport, extractSection } from '../../src/utils/parse-session.js';
import { parseMarkdownTable } from '../../src/utils/markdown-table.js';
import { extractListSection, extractReportMeta } from '../../src/formatters/common.js';
import { readSessionIndex } from '../../src/cli/commands/list.js';
import { runSessionFinalize, runSessionLevel } from '../../src/cli/commands/session.js';
import { INDEX_MD_HEADER } from '../../src/utils/index-files.js';
import { C2_FIXTURE, C2_NAME, cleanup, copySession, silentLog } from './contract2-helpers.js';

const toCrlf = (text: string): string => text.replace(/\r?\n/g, '\r\n');

const registry: string[] = [];
afterEach(() => cleanup(registry));

function tmpFile(name: string, content: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'qualiow-crlf-'));
  registry.push(dir);
  const path = join(dir, name);
  writeFileSync(path, content);
  return path;
}

describe('CRLF — bug reports', () => {
  it('parses a CRLF bug exactly like the LF original', async () => {
    const lf = readFileSync(join(C2_FIXTURE, 'bugs', 'BUG-001.md'), 'utf-8');
    expect(lf.includes('\r')).toBe(false);
    const fromLf = await parseBugReport(tmpFile('BUG-001.md', lf));
    const fromCrlf = await parseBugReport(tmpFile('BUG-001.md', toCrlf(lf)));

    expect(fromLf.summary).not.toBe('');
    expect(fromLf.business_impact).not.toBe('');
    expect(fromLf.steps).toHaveLength(3);
    expect(fromCrlf).toEqual(fromLf);
    for (const value of [fromCrlf.summary, fromCrlf.expected, fromCrlf.actual, fromCrlf.business_impact, ...fromCrlf.steps]) {
      expect(value.includes('\r')).toBe(false);
    }
  });

  it('extractSection finds a heading that ends in \\r', () => {
    expect(extractSection('# T\r\n\r\n## Summary\r\n\r\nbody line\r\n\r\n## Next\r\nx\r\n', 'Summary')).toBe('body line');
  });
});

describe('CRLF — markdown tables', () => {
  it('finds a table under a heading in a CRLF document', () => {
    const md = toCrlf('# Charter\n\n## Feature Risk Ranking\n\n| ID | Feature | Risk |\n|---|---|---|\n| A1 | Login | P0 |\n');
    const table = parseMarkdownTable(md, { headingPrefix: 'Feature Risk Ranking' });
    expect(table?.headers).toEqual(['ID', 'Feature', 'Risk']);
    expect(table?.rows).toEqual([{ id: 'A1', feature: 'Login', risk: 'P0' }]);
  });

  it('a contract-2 session whose charter has CRLF line ends passes level and finalize --check', async () => {
    const { cwd, sessionDir } = copySession(registry);
    const charter = join(sessionDir, 'charter.md');
    writeFileSync(charter, toCrlf(readFileSync(charter, 'utf-8')));

    const level = await runSessionLevel(C2_NAME, {}, { cwd, log: silentLog });
    expect(level.violations).toEqual([]);
    expect(level.ok).toBe(true);
    const check = await runSessionFinalize(C2_NAME, { check: true }, { cwd, log: silentLog });
    expect(check.violations).toEqual([]);
    expect(check.ok).toBe(true);
  });
});

describe('CRLF — report sections', () => {
  it('reads the executive summary and list sections of a CRLF report', () => {
    const report = toCrlf(
      '# Session Report — X\n\n**Date:** 2026-10-05\n\n## Executive Summary\n\nTested checkout.\nFound one bug.\n\n## Recommendations\n\n- Fix the total\n- Add a test\n\n## Reflection\n',
    );
    const meta = extractReportMeta(report, 'sid');
    expect(meta.date).toBe('2026-10-05');
    expect(meta.summary).toBe('Tested checkout.\nFound one bug.');
    expect(extractListSection(report, 'Recommendations')).toEqual(['Fix the total', 'Add a test']);
  });
});

describe('CRLF — INDEX.md', () => {
  it('reads the rows of a CRLF index', () => {
    const row = `| 2026-10-05 | explore | example-shop | 3 | 45 min | complete | ${C2_NAME}/session-report.md |`;
    const path = tmpFile('INDEX.md', toCrlf(`${INDEX_MD_HEADER}${row}\n`));
    const rows = readSessionIndex(path);
    expect(rows).toHaveLength(1);
    expect(rows[0].report).toBe(`${C2_NAME}/session-report.md`);
    expect(rows[0].status).toBe('complete');
  });
});
