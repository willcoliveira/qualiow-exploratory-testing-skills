import { describe, it, expect } from 'vitest';
import { parseMarkdownTable } from '../../src/utils/markdown-table.js';

describe('parseMarkdownTable', () => {
  it('parses the first table in the document when no heading prefix is given', () => {
    const md = [
      '# Title',
      '',
      '| Area | Status |',
      '|---|---|',
      '| Login | tested |',
      '| Cart | partial |',
    ].join('\n');

    const table = parseMarkdownTable(md);
    expect(table).not.toBeNull();
    expect(table!.headers).toEqual(['Area', 'Status']);
    expect(table!.rows).toEqual([
      { area: 'Login', status: 'tested' },
      { area: 'Cart', status: 'partial' },
    ]);
  });

  it('finds a table under a heading matching the given prefix, case-insensitively', () => {
    const md = [
      '## Session Metadata',
      '',
      '| Field | Value |',
      '|---|---|',
      '| Session ID | abc-123 |',
      '',
      '## coverage map',
      '',
      '| Area | Risk | Status | Bugs | Notes |',
      '|---|---|---|---|---|',
      '| Login | P0 | tested | 0 | fine |',
    ].join('\n');

    const table = parseMarkdownTable(md, { headingPrefix: 'Coverage' });
    expect(table).not.toBeNull();
    expect(table!.headers).toEqual(['Area', 'Risk', 'Status', 'Bugs', 'Notes']);
    expect(table!.rows).toHaveLength(1);
    expect(table!.rows[0]).toEqual({
      area: 'Login',
      risk: 'P0',
      status: 'tested',
      bugs: '0',
      notes: 'fine',
    });
  });

  it('returns null when the heading prefix is not found', () => {
    const md = '## Something Else\n\n| A | B |\n|---|---|\n| 1 | 2 |';
    expect(parseMarkdownTable(md, { headingPrefix: 'Coverage' })).toBeNull();
  });

  it('returns null when anchored to a heading but the table stops before the next heading', () => {
    const md = [
      '## Coverage Map',
      '',
      'No table here, just text.',
      '',
      '## Bugs Found',
      '',
      '| ID | Title |',
      '|---|---|',
      '| BUG-001 | X |',
    ].join('\n');

    expect(parseMarkdownTable(md, { headingPrefix: 'Coverage' })).toBeNull();
  });

  it('returns null when there is no table at all', () => {
    expect(parseMarkdownTable('# Just a heading\n\nSome prose.')).toBeNull();
  });

  it('keeps empty internal cells so column indices stay aligned', () => {
    const md = [
      '| Area | Risk | Status | Bugs | Notes |',
      '|---|---|---|---|---|',
      '| Checkout | P0 | tested | 1 | |',
      '| Search | P2 | partial | | time boxed |',
    ].join('\n');

    const table = parseMarkdownTable(md);
    expect(table!.rows[0]).toEqual({
      area: 'Checkout',
      risk: 'P0',
      status: 'tested',
      bugs: '1',
      notes: '',
    });
    expect(table!.rows[1]).toEqual({
      area: 'Search',
      risk: 'P2',
      status: 'partial',
      bugs: '',
      notes: 'time boxed',
    });
  });

  it('skips rows that are entirely empty', () => {
    const md = ['| A | B |', '|---|---|', '| | |', '| 1 | 2 |'].join('\n');
    const table = parseMarkdownTable(md);
    expect(table!.rows).toEqual([{ a: '1', b: '2' }]);
  });

  it('stops reading rows at the first line without a pipe', () => {
    const md = [
      '| A | B |',
      '|---|---|',
      '| 1 | 2 |',
      '',
      'Some trailing prose that is not part of the table.',
      '| 3 | 4 |',
    ].join('\n');
    const table = parseMarkdownTable(md);
    expect(table!.rows).toEqual([{ a: '1', b: '2' }]);
  });

  it('lower-cases header keys but preserves header text in `headers`', () => {
    const md = ['| Area | Risk |', '|---|---|', '| X | Y |'].join('\n');
    const table = parseMarkdownTable(md);
    expect(table!.headers).toEqual(['Area', 'Risk']);
    expect(Object.keys(table!.rows[0])).toEqual(['area', 'risk']);
  });

  it('supports the legacy two-column coverage header', () => {
    const md = [
      '## Coverage',
      '',
      '| Area | Status |',
      '|---|---|',
      '| Login | tested |',
    ].join('\n');
    const table = parseMarkdownTable(md, { headingPrefix: 'Coverage' });
    expect(table!.headers).toEqual(['Area', 'Status']);
  });
});
