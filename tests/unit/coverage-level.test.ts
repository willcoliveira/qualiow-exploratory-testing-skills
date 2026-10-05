import { describe, it, expect, afterEach } from 'vitest';
import { mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  LEVEL_DISCLAIMER,
  computeLevel,
  inputsDigest,
  renderBacklog,
  renderLevel,
  type LevelInput,
} from '../../src/session/coverage-level.js';
import { assessContract2 } from '../../src/session/assess.js';
import { runSessionFinalize, runSessionLevel } from '../../src/cli/commands/session.js';
import { CONFIDENTIALITY_HEADER_MD } from '../../src/utils/confidentiality.js';
import type { AreaStatus, BugSeverity, CoverageLevelName, RiskTier } from '../../src/types/index.js';
import { C2_NAME, cleanup, copySession, readJson, silentLog } from './contract2-helpers.js';

type BugSpec = [area: string | null, verified: boolean, severity?: BugSeverity];

/** Areas get ids A1, A2, … in the order given; bugs get BUG-001, BUG-002, … */
function mk(areas: [RiskTier, AreaStatus][], bugs: BugSpec[] = [], quick = false): LevelInput {
  return {
    quick,
    areas: areas.map(([tier, status], i) => ({
      id: `A${i + 1}`,
      tier,
      status,
      feature: `Feature ${i + 1}`,
      ...(status === 'tested' ? {} : { reason: 'time box' }),
    })),
    bugs: bugs.map(([area, verified, severity], i) => ({
      id: `BUG-${String(i + 1).padStart(3, '0')}`,
      severity: severity ?? 'medium',
      area,
      verified,
    })),
  };
}

type Tiers = Record<RiskTier, CoverageLevelName | 'n/a'>;
const t = (P0: string, P1: string, P2: string, P3: string) => ({ P0, P1, P2, P3 }) as Tiers;

// ─── The ladder ──────────────────────────────────────────────────────

const LADDER: [string, LevelInput, CoverageLevelName, Tiers][] = [
  ['every tier tested, no bugs', mk([['P0', 'tested'], ['P1', 'tested'], ['P2', 'tested'], ['P3', 'tested']]), 'complete', t('complete', 'complete', 'complete', 'complete')],
  ['nothing tested', mk([['P0', 'deferred']]), 'unassessed', t('unassessed', 'n/a', 'n/a', 'n/a')],
  ['P1 partial', mk([['P0', 'tested'], ['P1', 'partial']]), 'incomplete', t('complete', 'unassessed', 'n/a', 'n/a')],
  ['one of two P1 partial', mk([['P0', 'tested'], ['P1', 'tested'], ['P1', 'partial']]), 'incomplete', t('complete', 'incomplete', 'n/a', 'n/a')],
  ['one of two P0 blocked', mk([['P0', 'tested'], ['P0', 'blocked']]), 'incomplete', t('incomplete', 'n/a', 'n/a', 'n/a')],
  ['P2 not tested', mk([['P0', 'tested'], ['P2', 'not-tested']]), 'qualified', t('complete', 'n/a', 'unassessed', 'n/a')],
  ['one of two P2 deferred', mk([['P0', 'tested'], ['P2', 'tested'], ['P2', 'deferred']]), 'qualified', t('complete', 'n/a', 'qualified', 'n/a')],
  ['unverified bug on a P0 area', mk([['P0', 'tested'], ['P1', 'tested']], [['A1', false]]), 'qualified', t('qualified', 'complete', 'n/a', 'n/a')],
  ['verified unmapped bug — overall only', mk([['P0', 'tested'], ['P1', 'tested']], [[null, true]]), 'qualified', t('complete', 'complete', 'n/a', 'n/a')],
  ['unverified unmapped bug — overall only', mk([['P0', 'tested']], [[null, false]]), 'qualified', t('complete', 'n/a', 'n/a', 'n/a')],
  ['quick, every area tested', mk([['P1', 'tested'], ['P2', 'tested']], [], true), 'qualified', t('n/a', 'qualified', 'qualified', 'n/a')],
  ['quick, nothing tested', mk([['P1', 'blocked']], [], true), 'unassessed', t('n/a', 'unassessed', 'n/a', 'n/a')],
  ['quick, P0 partial', mk([['P0', 'tested'], ['P0', 'partial']], [], true), 'incomplete', t('incomplete', 'n/a', 'n/a', 'n/a')],
  ['only P3 rows, tested', mk([['P3', 'tested'], ['P3', 'tested']]), 'complete', t('n/a', 'n/a', 'n/a', 'complete')],
  ['P1 not tested, P2 tested', mk([['P1', 'not-tested'], ['P2', 'tested']]), 'incomplete', t('n/a', 'unassessed', 'complete', 'n/a')],
  ['P0 deferred, P3 tested', mk([['P0', 'deferred'], ['P3', 'tested']]), 'incomplete', t('unassessed', 'n/a', 'n/a', 'complete')],
  ['single P2 row partial', mk([['P2', 'partial']]), 'unassessed', t('n/a', 'n/a', 'unassessed', 'n/a')],
  ['every bug verified and mapped', mk([['P0', 'tested'], ['P1', 'tested'], ['P2', 'tested']], [['A1', true, 'critical'], ['A3', true, 'low']]), 'complete', t('complete', 'complete', 'complete', 'n/a')],
  ['one of two P1 blocked', mk([['P1', 'tested'], ['P1', 'blocked']]), 'incomplete', t('n/a', 'incomplete', 'n/a', 'n/a')],
  ['P3 blocked under a tested P2', mk([['P2', 'tested'], ['P3', 'blocked']]), 'qualified', t('n/a', 'n/a', 'complete', 'unassessed')],
  ['unverified bug on a P1 area', mk([['P0', 'tested'], ['P1', 'tested']], [['A2', false]]), 'qualified', t('complete', 'qualified', 'n/a', 'n/a')],
  ['P2 unverified bug and P3 partial', mk([['P2', 'tested'], ['P2', 'tested'], ['P3', 'partial']], [['A1', false]]), 'qualified', t('n/a', 'n/a', 'qualified', 'unassessed')],
  ['mixed, P0 not tested', mk([['P0', 'not-tested'], ['P1', 'tested'], ['P2', 'partial'], ['P3', 'deferred']]), 'incomplete', t('unassessed', 'complete', 'unassessed', 'unassessed')],
  ['quick with a verified mapped bug', mk([['P1', 'tested']], [['A1', true]], true), 'qualified', t('n/a', 'qualified', 'n/a', 'n/a')],
];

describe('computeLevel — the ladder', () => {
  it('has at least 20 rows', () => {
    expect(LADDER.length).toBeGreaterThanOrEqual(20);
  });

  it.each(LADDER)('%s', (_label, input, level, tiers) => {
    const out = computeLevel(input);
    expect(out.level).toBe(level);
    expect(out.tiers).toEqual(tiers);
  });

  it('a quick session is never above qualified', () => {
    for (const [, input] of LADDER) {
      const quick = computeLevel({ ...input, quick: true });
      expect(quick.level).not.toBe('complete');
      expect(Object.values(quick.tiers)).not.toContain('complete');
    }
  });
});

describe('computeLevel — gaps and findings', () => {
  it('a judged session with zero drafts has no gap at all', () => {
    const out = computeLevel(mk([['P0', 'tested'], ['P1', 'tested']]));
    expect(out.gaps).toEqual([]);
    expect(out.level).toBe('complete');
    expect(out.findings).toEqual({ highest_shipped: null, unverified: 0, on_p0: 0 });
  });

  it('one gap per untested area, with its tier, in charter order', () => {
    const out = computeLevel(mk([['P2', 'deferred'], ['P0', 'tested'], ['P1', 'blocked'], ['P3', 'not-tested'], ['P2', 'partial']]));
    expect(out.gaps).toEqual([
      { code: 'AREA_DEFERRED', area: 'A1', tier: 'P2' },
      { code: 'AREA_BLOCKED', area: 'A3', tier: 'P1' },
      { code: 'AREA_NOT_TESTED', area: 'A4', tier: 'P3' },
      { code: 'AREA_PARTIAL', area: 'A5', tier: 'P2' },
    ]);
  });

  it('an unmapped bug is a gap overall only — no area, no tier', () => {
    const out = computeLevel(mk([['P0', 'tested']], [[null, false, 'high']]));
    expect(out.gaps).toEqual([{ code: 'BUG_UNMAPPED', bug: 'BUG-001' }, { code: 'BUG_UNVERIFIED', bug: 'BUG-001' }]);
    expect(out.tiers.P0).toBe('complete');
  });

  it('an unverified mapped bug carries its area and tier', () => {
    const out = computeLevel(mk([['P0', 'tested'], ['P2', 'tested']], [['A2', false]]));
    expect(out.gaps).toEqual([{ code: 'BUG_UNVERIFIED', area: 'A2', bug: 'BUG-001', tier: 'P2' }]);
  });

  it('findings: highest shipped severity, unverified count, bugs on P0 areas', () => {
    const out = computeLevel(
      mk([['P0', 'tested'], ['P1', 'tested']], [['A1', true, 'medium'], ['A1', false, 'high'], ['A2', false, 'low'], [null, true, 'low']]),
    );
    expect(out.findings).toEqual({ highest_shipped: 'high', unverified: 2, on_p0: 2 });
  });

  it('findings never change the level: a critical verified bug on a complete session stays complete', () => {
    const out = computeLevel(mk([['P0', 'tested']], [['A1', true, 'critical']]));
    expect(out.level).toBe('complete');
    expect(out.findings.highest_shipped).toBe('critical');
  });
});

describe('inputsDigest', () => {
  const base = mk([['P0', 'tested'], ['P1', 'partial']], [['A1', true, 'high']]);

  it('is sha256-prefixed and stable for the same inputs', () => {
    expect(inputsDigest(base)).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(inputsDigest(base)).toBe(inputsDigest(mk([['P0', 'tested'], ['P1', 'partial']], [['A1', true, 'high']])));
  });

  it('ignores order, feature names and reasons [S4]', () => {
    const reordered: LevelInput = { ...base, areas: [...base.areas].reverse(), bugs: [...base.bugs].reverse() };
    const reworded: LevelInput = {
      ...base,
      areas: base.areas.map((a) => ({ ...a, feature: 'renamed [REDACTED]', reason: a.reason ? 'other words' : undefined })),
    };
    expect(inputsDigest(reordered)).toBe(inputsDigest(base));
    expect(inputsDigest(reworded)).toBe(inputsDigest(base));
  });

  it('changes when a status, tier, severity, area, verification or the quick cap changes', () => {
    const d = inputsDigest(base);
    expect(inputsDigest(mk([['P0', 'tested'], ['P1', 'tested']], [['A1', true, 'high']]))).not.toBe(d);
    expect(inputsDigest(mk([['P0', 'tested'], ['P2', 'partial']], [['A1', true, 'high']]))).not.toBe(d);
    expect(inputsDigest(mk([['P0', 'tested'], ['P1', 'partial']], [['A1', true, 'low']]))).not.toBe(d);
    expect(inputsDigest(mk([['P0', 'tested'], ['P1', 'partial']], [[null, true, 'high']]))).not.toBe(d);
    expect(inputsDigest(mk([['P0', 'tested'], ['P1', 'partial']], [['A1', false, 'high']]))).not.toBe(d);
    expect(inputsDigest({ ...base, quick: true })).not.toBe(d);
  });
});

// ─── Rendering ───────────────────────────────────────────────────────

describe('renderLevel', () => {
  const input = mk([['P0', 'tested'], ['P1', 'tested'], ['P2', 'partial'], ['P3', 'deferred']], [['A3', false, 'high'], [null, true, 'low']]);
  const md = renderLevel(computeLevel(input), input);
  const body = md.slice(CONFIDENTIALITY_HEADER_MD.length).replace(/^\n+/, '');

  it('opens with the confidentiality header, then the fixed disclaimer as the first body line', () => {
    expect(md.startsWith(`${CONFIDENTIALITY_HEADER_MD}\n\n`)).toBe(true);
    expect(body.split('\n')[0]).toBe(LEVEL_DISCLAIMER);
    expect(LEVEL_DISCLAIMER).toBe(
      'A computed coverage fact for the tested scope — not a ship probability or release verdict.',
    );
  });

  it('uses ### headings at most, so the body sits under the report\'s ## Coverage Level', () => {
    const headings = body.split('\n').filter((l) => /^#{1,6}\s/.test(l));
    expect(headings.length).toBeGreaterThan(0);
    expect(headings.every((h) => h.startsWith('### '))).toBe(true);
  });

  it('carries the level, the tier table, the findings line, the gaps and the raise list', () => {
    expect(body).toContain('**Coverage level: qualified**');
    expect(body).toContain('| P2 | unassessed | 1 | 0 |');
    expect(body).toContain('highest shipped severity High · 1 unverified · 0 on P0 areas.');
    expect(body).toContain('| AREA_PARTIAL | A3 | P2 | — |');
    expect(body).toContain('| BUG_UNMAPPED | — | — | BUG-002 |');
    expect(body).toContain('- A3 (P2) is partial: finish it');
    expect(body).toContain('- A4 (P3) was deferred by the time box');
    expect(body).toContain('- BUG-001 (High, A3) is unverified');
    expect(body).toContain('- BUG-002 (Low) maps to no area');
  });

  it('no free text written by the session crosses into it [L3]', () => {
    expect(md).not.toContain('Feature');
    expect(md).not.toContain('time box\n'); // area reasons stay in backlog.md
  });

  it('complete: nothing to raise; quick: the cap is named', () => {
    const complete = mk([['P0', 'tested']]);
    expect(renderLevel(computeLevel(complete), complete)).toContain('Nothing — `complete` is the highest level.');
    const quick = mk([['P1', 'tested']], [], true);
    const qmd = renderLevel(computeLevel(quick), quick);
    expect(qmd).toContain('**Coverage level: qualified** — a quick session is capped here.');
    expect(qmd).toContain('A quick session is capped at `qualified`');
  });
});

describe('renderBacklog', () => {
  it('lists every area not tested, rendered from coverage.areas', () => {
    const input = mk([['P0', 'tested'], ['P2', 'partial'], ['P3', 'deferred']]);
    const md = renderBacklog(input);
    expect(md.startsWith(`${CONFIDENTIALITY_HEADER_MD}\n`)).toBe(true);
    expect(md).toContain('| A2 | P2 | Feature 2 | partial | time box |');
    expect(md).toContain('| A3 | P3 | Feature 3 | deferred | time box |');
    expect(md).not.toContain('| A1 |');
  });

  it('cuts URLs to paths, redacts secrets, escapes pipes and caps the feature at 80 chars [L4]', () => {
    const input = mk([['P2', 'partial']]);
    input.areas[0].feature = `Billing | https://billing.acme-internal.io/admin?token=abc ${'x'.repeat(200)}`;
    input.areas[0].reason = 'owner qa.lead@acme-internal.io said later';
    const row = renderBacklog(input).split('\n').find((l) => l.startsWith('| A1 |')) as string;
    expect(row).not.toContain('acme-internal.io');
    expect(row).not.toContain('token=abc');
    expect(row).not.toContain('qa.lead@');
    expect(row).toContain('Billing \\| [URL /admin]');
    const feature = row.split(' | ')[2];
    expect(feature.length).toBeLessThanOrEqual(82);
  });

  it('says so when every area was tested', () => {
    expect(renderBacklog(mk([['P0', 'tested']]))).toContain('Every charter area was tested.');
  });
});

// ─── On the fixtures ─────────────────────────────────────────────────

describe('coverage level on the contract-2 fixture', () => {
  const dirs: string[] = [];
  afterEach(() => cleanup(dirs));
  const ctxOf = (sessionsDir: string) => ({ sessionsDir, isFinalized: () => false });

  it('an all-refuted session (bugs/refuted/ only) has no bug gap', async () => {
    const { sessionDir, sessionsDir } = copySession(dirs);
    const bugs = join(sessionDir, 'bugs');
    mkdirSync(join(bugs, 'refuted'), { recursive: true });
    for (const f of readdirSync(bugs).filter((f) => f.endsWith('.md'))) renameSync(join(bugs, f), join(bugs, 'refuted', f));
    const a = await assessContract2(sessionDir, readJson(join(sessionDir, 'stats.json')), 'explore', ctxOf(sessionsDir));
    expect(a.violations).toEqual([]);
    expect(a.level?.gaps.map((g) => g.code)).toEqual(['AREA_PARTIAL', 'AREA_DEFERRED']);
    expect(a.level?.findings).toEqual({ highest_shipped: null, unverified: 0, on_p0: 0 });
  });

  it('the committed evidence-level.md and backlog.md are exactly what level renders', async () => {
    const { sessionDir, sessionsDir } = copySession(dirs);
    const a = await assessContract2(sessionDir, readJson(join(sessionDir, 'stats.json')), 'explore', ctxOf(sessionsDir));
    expect(a.evidenceLevelMd).toBe(readFileSync(join(sessionDir, 'evidence-level.md'), 'utf-8'));
    expect(a.backlogMd).toBe(readFileSync(join(sessionDir, 'backlog.md'), 'utf-8'));
    expect(a.level).toEqual(readJson(join(sessionDir, 'stats.json')).coverage_level);
  });

  it('the digest is stable across finalize --redact [S4]', async () => {
    const { cwd, sessionDir } = copySession(dirs);
    const before = readJson(join(sessionDir, 'stats.json')).coverage_level as { inputs_digest: string };
    const bugPath = join(sessionDir, 'bugs', 'BUG-001.md');
    // Assembled at runtime so no literal secret sits in the test source.
    const jwt = ['eyJhbGciOiJIUzI1NiJ9', 'eyJzdWIiOiJxYSJ9', 'c2lnbmF0dXJlLXBsYWNlaG9sZGVy'].join('.');
    writeFileSync(bugPath, readFileSync(bugPath, 'utf-8').replace('## Summary\n', `## Summary\n\nSession cookie seen: ${jwt}\n`));

    const result = await runSessionFinalize(C2_NAME, { redact: true }, { cwd, log: silentLog });
    expect(result.violations).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.redactedFiles?.map((r) => r.file)).toEqual([join('bugs', 'BUG-001.md')]);
    expect(readFileSync(bugPath, 'utf-8')).not.toContain(jwt);
    const after = await runSessionLevel(C2_NAME, {}, { cwd, log: silentLog });
    expect(after.level?.inputs_digest).toBe(before.inputs_digest);
  });
});
