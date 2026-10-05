import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, existsSync, writeFileSync, appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  appendSessionMetrics,
  appendSessionMetricsDeduped,
  readAllMetrics,
  reduceForMetrics,
} from '../../src/utils/metrics.js';
import type { SessionMetrics } from '../../src/types/index.js';

const TMP_DIR = mkdtempSync(join(tmpdir(), 'qualiow-metrics-'));

function makeMetrics(overrides?: Partial<SessionMetrics>): SessionMetrics {
  return {
    session_id: 'sess-001',
    target: 'saucedemo',
    date: '2026-03-28',
    duration_min: 45,
    bugs_found: 3,
    severity_counts: { critical: 0, high: 1, medium: 1, low: 1 },
    pages_explored: 12,
    ...overrides,
  };
}

beforeEach(() => {
  // Clean slate for each test
  if (existsSync(TMP_DIR)) {
    rmSync(TMP_DIR, { recursive: true, force: true });
  }
  mkdirSync(TMP_DIR, { recursive: true });
});

afterAll(() => {
  if (existsSync(TMP_DIR)) {
    rmSync(TMP_DIR, { recursive: true, force: true });
  }
});

describe('appendSessionMetrics', () => {
  it('should create the file and write a single metrics line', () => {
    const metrics = makeMetrics();
    appendSessionMetrics(TMP_DIR, metrics);

    const all = readAllMetrics(TMP_DIR);
    expect(all).toHaveLength(1);
    expect(all[0]).toEqual(metrics);
  });

  it('should append multiple metrics entries', () => {
    const m1 = makeMetrics({ session_id: 'sess-001' });
    const m2 = makeMetrics({ session_id: 'sess-002', bugs_found: 5 });

    appendSessionMetrics(TMP_DIR, m1);
    appendSessionMetrics(TMP_DIR, m2);

    const all = readAllMetrics(TMP_DIR);
    expect(all).toHaveLength(2);
    expect(all[0].session_id).toBe('sess-001');
    expect(all[1].session_id).toBe('sess-002');
    expect(all[1].bugs_found).toBe(5);
  });

  it('should create the output directory if it does not exist', () => {
    const nestedDir = join(TMP_DIR, 'nested', 'output');
    appendSessionMetrics(nestedDir, makeMetrics());

    const all = readAllMetrics(nestedDir);
    expect(all).toHaveLength(1);
  });

  it('should reject invalid metrics with a ZodError', () => {
    const invalid = {
      session_id: '',
      target: 'x',
      date: '2026-01-01',
      duration_min: -1,
      bugs_found: 0,
      severity_counts: { critical: 0, high: 0, medium: 0, low: 0 },
      pages_explored: 0,
    } as SessionMetrics;

    expect(() => appendSessionMetrics(TMP_DIR, invalid)).toThrow();
  });
});

describe('readAllMetrics', () => {
  it('should return an empty array when the file does not exist', () => {
    const nonExistentDir = join(TMP_DIR, 'no-such-dir');
    const result = readAllMetrics(nonExistentDir);
    expect(result).toEqual([]);
  });

  it('should return an empty array when the file is empty', () => {
    writeFileSync(join(TMP_DIR, 'metrics.jsonl'), '', 'utf-8');
    const result = readAllMetrics(TMP_DIR);
    expect(result).toEqual([]);
  });

  it('should correctly parse multi-line JSONL', () => {
    const m1 = makeMetrics({ session_id: 'a' });
    const m2 = makeMetrics({ session_id: 'b' });
    const m3 = makeMetrics({ session_id: 'c' });

    const content = [m1, m2, m3].map((m) => JSON.stringify(m)).join('\n');
    writeFileSync(join(TMP_DIR, 'metrics.jsonl'), content, 'utf-8');

    const result = readAllMetrics(TMP_DIR);
    expect(result).toHaveLength(3);
    expect(result.map((r) => r.session_id)).toEqual(['a', 'b', 'c']);
  });

  it('should skip a corrupt JSONL line instead of throwing', () => {
    appendSessionMetrics(TMP_DIR, makeMetrics({ session_id: 'ok-1' }));
    appendFileSync(join(TMP_DIR, 'metrics.jsonl'), '{not json\n');
    appendSessionMetrics(TMP_DIR, makeMetrics({ session_id: 'ok-2' }));
    const all = readAllMetrics(TMP_DIR);
    expect(all.map((m) => m.session_id)).toEqual(['ok-1', 'ok-2']);
  });

  it('should append a session only once with appendSessionMetricsDeduped', () => {
    expect(appendSessionMetricsDeduped(TMP_DIR, makeMetrics({ session_id: 'dedupe' }))).toBe(true);
    expect(appendSessionMetricsDeduped(TMP_DIR, makeMetrics({ session_id: 'dedupe' }))).toBe(false);
    expect(readAllMetrics(TMP_DIR).filter((m) => m.session_id === 'dedupe')).toHaveLength(1);
  });
});

describe('metrics.jsonl — contract-2 reduction [M2]', () => {
  const c2 = (): SessionMetrics => ({
    ...makeMetrics({ session_id: 'c2-1' }),
    contract: 2,
    continues: null,
    coverage: {
      checklist_total: 4,
      areas: [
        { id: 'A1', status: 'tested', evidence: ['screenshots/A1-login.png'] },
        { id: 'A2', status: 'deferred', evidence: [], reason: 'billing admin not reached' },
      ],
    },
    areas_not_tested: ['billing admin — time box'],
    coverage_level: {
      level: 'qualified',
      tiers: { P0: 'complete', P1: 'n/a', P2: 'unassessed', P3: 'n/a' },
      findings: { highest_shipped: 'high', unverified: 1, on_p0: 1 },
      gaps: [{ code: 'AREA_DEFERRED', area: 'A2', tier: 'P2' }],
      inputs_digest: `sha256:${'b'.repeat(64)}`,
    },
  });

  it('a contract-1 line is written exactly as before', () => {
    const m = makeMetrics({ session_id: 'c1', coverage: { areas: ['free text'] }, areas_not_tested: ['x — y'] });
    expect(reduceForMetrics(m)).toBe(m);
    appendSessionMetrics(TMP_DIR, m);
    expect(readFileSync(join(TMP_DIR, 'metrics.jsonl'), 'utf-8')).toBe(`${JSON.stringify(m)}\n`);
  });

  it('a contract-2 line keeps counts by status and tier, the level, the tiers and the gap codes only', () => {
    appendSessionMetrics(TMP_DIR, c2(), { areaTiers: { A1: 'P0', A2: 'P2' } });
    const raw = readFileSync(join(TMP_DIR, 'metrics.jsonl'), 'utf-8');
    for (const leak of ['billing admin', 'A1-login.png', 'screenshots/', 'inputs_digest', 'findings']) {
      expect(raw).not.toContain(leak);
    }
    const line = JSON.parse(raw);
    expect(line.areas_not_tested).toBeUndefined();
    expect(line.coverage.checklist_total).toBe(4);
    expect(line.coverage.areas.total).toBe(2);
    expect(line.coverage.areas.by_status).toEqual({ tested: 1, partial: 0, blocked: 0, 'not-tested': 0, deferred: 1 });
    expect(line.coverage.areas.by_tier.P2.deferred).toBe(1);
    expect(line.coverage_level).toEqual({
      level: 'qualified',
      tiers: { P0: 'complete', P1: 'n/a', P2: 'unassessed', P3: 'n/a' },
      gaps: ['AREA_DEFERRED'],
    });
  });

  it('without the charter tiers there is no by_tier, and no reason leaks either', () => {
    const line = reduceForMetrics(c2());
    expect((line.coverage as { areas: Record<string, unknown> }).areas.by_tier).toBeUndefined();
    expect(JSON.stringify(line)).not.toContain('billing admin');
  });

  it('a reduced line reads back, so dedupe still holds for contract-2 sessions', () => {
    expect(appendSessionMetricsDeduped(TMP_DIR, c2())).toBe(true);
    expect(appendSessionMetricsDeduped(TMP_DIR, c2())).toBe(false);
    const all = readAllMetrics(TMP_DIR);
    expect(all).toHaveLength(1);
    expect(all[0].coverage_level).toMatchObject({ level: 'qualified', gaps: ['AREA_DEFERRED'] });
  });
});
