import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  evaluateContract2,
  parseAreas,
  parseRiskTable,
  type Contract2Input,
  type ContractBug,
  type EvidenceResolver,
} from '../../src/session/contract2.js';
import { parseBugReport } from '../../src/utils/parse-session.js';

const HEADER =
  '> CONFIDENTIAL: This report may contain internal URLs, security vulnerabilities,\n' +
  '> and application details. Do not share outside your organization without review.\n';

function charter(rows: string[], header = '| ID | Feature | Risk | Why | Time |'): string {
  return [
    HEADER,
    '# Session Charter',
    '',
    '## Feature Risk Ranking',
    header,
    `|${header.split('|').slice(1, -1).map(() => '---').join('|')}|`,
    ...rows,
    '',
    '## Heuristics Selected',
    '- SFDIPOT: Function',
  ].join('\n');
}

const BASE_ROWS = [
  '| A1 | Login | P0 | gate | 20% |',
  '| A2 | Checkout | **P0 -- Critical** | revenue | 30% |',
  '| A3 | Search | `P1` | discovery | 20% |',
];

/** Accepts every path whose basename starts with an area id, as if it were a real file. */
const okResolver: EvidenceResolver = (p) => {
  const s = String(p);
  const parts = s.split('/');
  return { ok: true, rel: s, top: parts[0], base: parts[parts.length - 1], size: 67 };
};

function stats(areas: unknown): Record<string, unknown> {
  return {
    session_id: '2026-10-05-1000-explore-c2',
    target: 'example-shop',
    contract: 2,
    coverage: { areas },
  };
}

const TESTED = [
  { id: 'A1', status: 'tested', evidence: ['screenshots/A1-login.png'] },
  { id: 'A2', status: 'tested', evidence: ['screenshots/A2-checkout.png'] },
  { id: 'A3', status: 'tested', evidence: ['evidence/A3-search.txt'] },
];

function input(over: Partial<Contract2Input> = {}): Contract2Input {
  return { kind: 'explore', charter: charter(BASE_ROWS), stats: stats(TESTED), bugs: [], ...over };
}

function bug(over: Partial<ContractBug> = {}): ContractBug {
  return { id: 'BUG-001', severity: 'high', area: 'A1', verification: 'verified', ...over };
}

function violationsOf(over: Partial<Contract2Input> = {}, resolver: EvidenceResolver = okResolver): string[] {
  return evaluateContract2(input(over), resolver).violations;
}

// ─── parseRiskTable ──────────────────────────────────────────────────

describe('parseRiskTable', () => {
  it('reads ID, tier and feature, stripping bold and backticks from the Risk cell', () => {
    const { rows, violations } = parseRiskTable(charter(BASE_ROWS));
    expect(violations).toEqual([]);
    expect(rows).toEqual([
      { id: 'A1', tier: 'P0', feature: 'Login' },
      { id: 'A2', tier: 'P0', feature: 'Checkout' },
      { id: 'A3', tier: 'P1', feature: 'Search' },
    ]);
  });

  it('keeps a row appended in a later phase', () => {
    const { rows } = parseRiskTable(charter([...BASE_ROWS, '| A4 | Help pages | P3 | appended in discovery | 5% |']));
    expect(rows.map((r) => r.id)).toEqual(['A1', 'A2', 'A3', 'A4']);
    expect(rows[3].tier).toBe('P3');
  });

  it('reads a quick charter (ID | Feature | Risk)', () => {
    const { rows, violations } = parseRiskTable(charter(['| A1 | Search box | P1 |'], '| ID | Feature | Risk |'));
    expect(violations).toEqual([]);
    expect(rows).toEqual([{ id: 'A1', tier: 'P1', feature: 'Search box' }]);
  });

  it('drops a template placeholder row of ellipses', () => {
    const { rows, violations } = parseRiskTable(charter([...BASE_ROWS, '| ... | ... | ... | ... | ... |']));
    expect(violations).toEqual([]);
    expect(rows).toHaveLength(3);
  });

  it('matches the heading text, not "## …" (the parser takes the text)', () => {
    const md = charter(BASE_ROWS).replace('## Feature Risk Ranking', '### Feature Risk Ranking (updated after discovery)');
    expect(parseRiskTable(md).rows).toHaveLength(3);
  });

  it('missing table ⇒ violation', () => {
    const { violations } = parseRiskTable(`${HEADER}\n# Charter\n\n## Mission\nExplore.`);
    expect(violations).toEqual([expect.stringContaining('no `## Feature Risk Ranking` table')]);
  });

  it('table without an ID column ⇒ violation', () => {
    const md = charter(['| Login | P0 | gate | 20% |'], '| Feature | Risk | Why | Time |');
    expect(parseRiskTable(md).violations).toEqual([expect.stringContaining('no ID column')]);
  });

  it('duplicate ID ⇒ violation', () => {
    const { violations } = parseRiskTable(charter([...BASE_ROWS, '| A2 | Cart | P1 | dup | 5% |']));
    expect(violations).toEqual([expect.stringContaining('A2 appears more than once')]);
  });

  it('malformed ID ⇒ violation', () => {
    const { violations } = parseRiskTable(charter(['| 1 | Login | P0 | gate | 20% |', '| AX | Cart | P1 | x | 5% |']));
    expect(violations).toHaveLength(2);
    expect(violations.every((v) => v.includes('IDs are A1, A2'))).toBe(true);
  });

  it('bad tier ⇒ violation', () => {
    const { violations, ids } = parseRiskTable(charter(['| A1 | Login | High | gate | 20% |', '| A2 | Cart | P4 | x | 5% |']));
    expect(violations).toHaveLength(2);
    expect(violations[0]).toContain('starts with P0, P1, P2 or P3');
    // A row with a bad tier still counts as a charter ID, so it is not reported twice.
    expect(ids).toEqual(['A1', 'A2']);
  });

  it('zero rows ⇒ violation', () => {
    expect(parseRiskTable(charter([])).violations).toEqual([expect.stringContaining('has no rows')]);
  });

  it('more than 40 rows ⇒ violation', () => {
    const rows = Array.from({ length: 41 }, (_, i) => `| A${i + 1} | F${i + 1} | P2 | x | 1% |`);
    expect(parseRiskTable(charter(rows)).violations).toEqual([expect.stringContaining('41 rows — at most 40')]);
  });

  it('a row below a blank line (a split table) ⇒ violation, never silently dropped', () => {
    const md = charter([...BASE_ROWS, '', '| A4 | Help | P3 | x | 5% |']);
    const { violations, rows } = parseRiskTable(md);
    expect(rows).toHaveLength(3);
    expect(violations).toEqual([expect.stringContaining('table is split — 1 row(s)')]);
  });

  it('a corrupted table (no separator line) ⇒ violation', () => {
    const md = charter(BASE_ROWS).replace(/\|---\|---\|---\|---\|---\|\n/, '');
    expect(parseRiskTable(md).violations.length).toBeGreaterThan(0);
  });
});

// ─── parseAreas ──────────────────────────────────────────────────────

describe('parseAreas', () => {
  it('accepts the documented entry shape', () => {
    const { areas, violations } = parseAreas({
      areas: [
        { id: 'A1', status: 'tested', evidence: ['screenshots/A1-x.png'] },
        { id: 'A2', status: 'deferred', evidence: [], reason: 'not reached in the time box' },
      ],
    });
    expect(violations).toEqual([]);
    expect(areas).toHaveLength(2);
  });

  it('coverage.areas missing ⇒ violation', () => {
    expect(parseAreas(undefined).violations).toEqual([expect.stringContaining('coverage.areas is missing')]);
    expect(parseAreas({ checklist_total: 3 }).violations).toEqual([expect.stringContaining('coverage.areas is missing')]);
  });

  it.each([
    ['a non-object entry', ['A1'], 'is not an object'],
    ['a bad id', [{ id: 'B1', status: 'tested', evidence: [] }], 'area IDs are'],
    ['a duplicate id', [{ id: 'A1', status: 'tested', evidence: [] }, { id: 'A1', status: 'tested', evidence: [] }], 'more than once'],
    ['an unknown key', [{ id: 'A1', status: 'tested', evidence: [], note: 'x' }], 'unknown key'],
    ['a bad status', [{ id: 'A1', status: 'done', evidence: [] }], 'has status'],
    ['evidence not a list', [{ id: 'A1', status: 'tested', evidence: 'screenshots/A1.png' }], 'list of paths'],
    ['a reason over 160 chars', [{ id: 'A1', status: 'partial', evidence: [], reason: 'x'.repeat(161) }], 'at most 160'],
    ['a reason with a URL', [{ id: 'A1', status: 'blocked', evidence: [], reason: 'see https://jira.example.com/X-1' }], 'contains a URL'],
    ['a multi-line reason', [{ id: 'A1', status: 'blocked', evidence: [], reason: 'one\ntwo' }], 'one line'],
  ])('%s ⇒ violation', (_label, list, expected) => {
    const { violations } = parseAreas({ areas: list });
    expect(violations.some((v) => v.includes(expected))).toBe(true);
  });

  it.each(['partial', 'blocked', 'not-tested', 'deferred'])('%s without a reason ⇒ violation [S2]', (status) => {
    const { violations } = parseAreas({ areas: [{ id: 'A1', status, evidence: [] }] });
    expect(violations).toEqual([expect.stringContaining(`is ${status} without a reason`)]);
  });

  it('caps: more than 40 areas, 20 per area, 400 in all ⇒ violations', () => {
    const many = Array.from({ length: 41 }, (_, i) => ({ id: `A${i + 1}`, status: 'tested', evidence: [] }));
    expect(parseAreas({ areas: many }).violations).toEqual([expect.stringContaining('41 entries — at most 40')]);

    const perArea = Array.from({ length: 21 }, (_, i) => `screenshots/A1-${i}.png`);
    expect(parseAreas({ areas: [{ id: 'A1', status: 'tested', evidence: perArea }] }).violations).toEqual([
      expect.stringContaining('21 evidence files — at most 20'),
    ]);

    const twenty = (id: string) => Array.from({ length: 20 }, (_, i) => `screenshots/${id}-${i}.png`);
    const total = Array.from({ length: 21 }, (_, i) => ({ id: `A${i + 1}`, status: 'tested', evidence: twenty(`A${i + 1}`) }));
    expect(parseAreas({ areas: total }).violations).toEqual([expect.stringContaining('420 evidence files in all — at most 400')]);
  });
});

// ─── evaluateContract2: one test per violation ───────────────────────

describe('evaluateContract2', () => {
  it('a clean session yields the level inputs and no violation', () => {
    const r = evaluateContract2(input({ bugs: [bug(), bug({ id: 'BUG-002', area: 'none', verification: 'unverified' })] }), okResolver);
    expect(r.violations).toEqual([]);
    expect(r.input?.areas.map((a) => [a.id, a.tier, a.status])).toEqual([
      ['A1', 'P0', 'tested'],
      ['A2', 'P0', 'tested'],
      ['A3', 'P1', 'tested'],
    ]);
    expect(r.input?.bugs).toEqual([
      { id: 'BUG-001', severity: 'high', area: 'A1', verified: true },
      { id: 'BUG-002', severity: 'high', area: null, verified: false },
    ]);
    expect(r.input?.quick).toBe(false);
  });

  it('contract 2 on a mobile or backend session ⇒ violation', () => {
    expect(violationsOf({ kind: 'mobile' })).toEqual([expect.stringContaining('contract 2 is explore/quick only')]);
    expect(violationsOf({ kind: 'backend' })).toEqual([expect.stringContaining('contract 2 is explore/quick only')]);
  });

  it('quick sessions are accepted and flagged quick', () => {
    expect(evaluateContract2(input({ kind: 'quick' }), okResolver).input?.quick).toBe(true);
  });

  it('charter.md missing ⇒ violation', () => {
    expect(violationsOf({ charter: null })).toEqual(expect.arrayContaining([expect.stringContaining('charter.md is missing')]));
  });

  it('charter row without an area entry ⇒ violation', () => {
    expect(violationsOf({ stats: stats(TESTED.slice(0, 2)) })).toEqual([
      expect.stringContaining('charter row A3 has no coverage.areas entry'),
    ]);
  });

  it('area not in the charter ⇒ violation', () => {
    const extra = [...TESTED, { id: 'A9', status: 'tested', evidence: ['screenshots/A9-x.png'] }];
    expect(violationsOf({ stats: stats(extra) })).toEqual([expect.stringContaining('area A9 is not a row')]);
  });

  it('tested or partial without an A<N>- file under screenshots/ or evidence/ ⇒ violation [B4]', () => {
    const shared = [
      { id: 'A1', status: 'tested', evidence: ['videos/session.webm'] },
      { id: 'A2', status: 'partial', evidence: ['screenshots/checkout.png'], reason: 'payment not reached' },
      // `A1-` does not cover A10, and a file for another area does not count.
      { id: 'A3', status: 'tested', evidence: ['screenshots/A1-login.png'] },
    ];
    const v = violationsOf({ stats: stats(shared) });
    expect(v).toHaveLength(3);
    expect(v.every((x) => x.includes('cites no'))).toBe(true);
  });

  it('an A<N>- file under videos/ does not satisfy the per-area rule', () => {
    const areas = [...TESTED.slice(0, 2), { id: 'A3', status: 'tested', evidence: ['videos/A3-search.webm'] }];
    expect(violationsOf({ stats: stats(areas) })).toEqual([expect.stringContaining('area A3 is tested but cites no')]);
  });

  it('invalid evidence (as the resolver reports it) ⇒ one violation per path', () => {
    const resolver: EvidenceResolver = (p) =>
      String(p).includes('bad') ? { ok: false, reason: 'is a hard link — cite a file with a single link' } : okResolver(p);
    const areas = [
      { id: 'A1', status: 'tested', evidence: ['screenshots/A1-login.png', 'screenshots/bad.png'] },
      ...TESTED.slice(1),
    ];
    expect(violationsOf({ stats: stats(areas) }, resolver)).toEqual([
      expect.stringContaining('area A1 evidence "screenshots/bad.png" is a hard link'),
    ]);
  });

  it('bug without an **Area:** line ⇒ violation', () => {
    expect(violationsOf({ bugs: [bug({ area: null })] })).toEqual([expect.stringContaining('has no **Area:** line')]);
  });

  it('bug with an unknown area value ⇒ violation (the template placeholder included)', () => {
    expect(violationsOf({ bugs: [bug({ area: 'A<N> | none' })] })).toEqual([expect.stringContaining('is not an area ID')]);
    expect(violationsOf({ bugs: [bug({ area: 'A2, A3' })] })).toEqual([expect.stringContaining('is not an area ID')]);
  });

  it('bug mapped to an area that is not a charter row ⇒ violation', () => {
    expect(violationsOf({ bugs: [bug({ area: 'A7' })] })).toEqual([expect.stringContaining('maps to A7, which is not a row')]);
  });

  it.each(['not-tested', 'blocked', 'deferred'])('bug mapped to a %s area ⇒ violation [S2]', (status) => {
    const areas = [...TESTED.slice(0, 2), { id: 'A3', status, evidence: [], reason: 'time box' }];
    expect(violationsOf({ stats: stats(areas), bugs: [bug({ area: 'A3' })] })).toEqual([
      expect.stringContaining(`maps to A3, which is ${status}`),
    ]);
  });

  it('a bug mapped to a partial area is fine', () => {
    const areas = [...TESTED.slice(0, 2), { id: 'A3', status: 'partial', evidence: ['screenshots/A3-x.png'], reason: 'half done' }];
    expect(violationsOf({ stats: stats(areas), bugs: [bug({ area: 'A3' })] })).toEqual([]);
  });

  it('a bug file name that is not BUG-<id> ⇒ violation', () => {
    expect(violationsOf({ bugs: [bug({ id: 'BUG-001 copy' })] })).toEqual([expect.stringContaining('the file name is not BUG-')]);
  });

  it('a corrupted charter table ⇒ violation, not a pass', () => {
    const corrupted = charter(BASE_ROWS).replace('| ID | Feature | Risk | Why | Time |', '| ID | Feature |');
    expect(violationsOf({ charter: corrupted }).length).toBeGreaterThan(0);
  });

  it('anything thrown while evaluating becomes a violation [L2]', () => {
    const throwing: EvidenceResolver = () => {
      throw new Error('disk on fire');
    };
    const r = evaluateContract2(input(), throwing);
    expect(r.violations).toEqual(['contract 2 could not be evaluated: disk on fire']);
    expect(r.input).toBeUndefined();
  });
});

// ─── bug fields ──────────────────────────────────────────────────────

describe('parseBugReport — **Area:** and **Verification:**', () => {
  const dirs: string[] = [];
  afterEach(() => {
    while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
  });

  async function parse(lines: string[]) {
    const dir = mkdtempSync(join(tmpdir(), 'qualiow-bugfields-'));
    dirs.push(dir);
    const file = join(dir, 'BUG-001.md');
    writeFileSync(file, [HEADER, '# BUG-001: [X] fails [y] causing [z]', '', '**Severity:** High', ...lines, '', '## Summary', 'x'].join('\n'));
    return parseBugReport(file);
  }

  it('reads the area as written; null when the line is absent', async () => {
    expect((await parse(['**Area:** A3'])).area).toBe('A3');
    expect((await parse(['**Area:** none'])).area).toBe('none');
    expect((await parse(['**Area:** `A12`'])).area).toBe('A12');
    expect((await parse([])).area).toBeNull();
  });

  it.each([
    ['Verified', 'verified'],
    ['Verified (severity adjusted from Medium)', 'verified'],
    ['Verified (severity kept at High; judge proposed Medium)', 'verified'],
    ['Verified (judge overruled: reproduced on a clean profile)', 'verified'],
    ['**Verified**', 'verified'],
    ['Unverified (not judged — budget)', 'unverified'],
    ['UNVERIFIED (judge unavailable: timeout)', 'unverified'],
    ['Unverified (reason)', 'unverified'],
    ['Refuted', 'unverified'],
  ])('**Verification:** %s ⇒ %s [B3]', async (value, expected) => {
    expect((await parse([`**Verification:** ${value}`])).verification).toBe(expected);
  });

  it('no **Verification:** line ⇒ unverified', async () => {
    expect((await parse([])).verification).toBe('unverified');
  });

  it('the bug template parses without throwing; its placeholder Area is flagged, not thrown', async () => {
    const template = await parseBugReport(resolve(process.cwd(), 'data', 'templates', 'bug-report.md'));
    expect(['verified', 'unverified']).toContain(template.verification);
    if (template.area !== null) {
      const v = violationsOf({ bugs: [bug({ area: template.area })] });
      expect(v).toEqual([expect.stringContaining('is not an area ID')]);
    }
  });
});

describe('review follow-ups', () => {
  it('a prose line with a `|` directly under the risk table ⇒ a violation naming the cause', () => {
    const md = charter([...BASE_ROWS, 'Note: A2 | A3 share the sign-in service']);
    expect(parseRiskTable(md).violations).toContainEqual(expect.stringContaining('contains `|` but is not a table row'));
  });

  it('a gapped ID set, as a continued session leaves it (A4, A5, A8), passes', () => {
    const rows = [
      '| A4 | Login | P0 | carried from a prior session | 20% |',
      '| A5 | Checkout | P1 | carried from a prior session | 20% |',
      '| A8 | Search | P2 | new in this session | 10% |',
    ];
    const areas = [
      { id: 'A4', status: 'tested', evidence: ['screenshots/A4-login.png'] },
      { id: 'A5', status: 'tested', evidence: ['screenshots/A5-checkout.png'] },
      { id: 'A8', status: 'deferred', evidence: [], reason: 'not reached in the time box' },
    ];
    const r = evaluateContract2(input({ charter: charter(rows), stats: stats(areas), bugs: [bug({ area: 'A5' })] }), okResolver);
    expect(r.violations).toEqual([]);
    expect(r.input?.areas.map((a) => a.id)).toEqual(['A4', 'A5', 'A8']);
  });
});
