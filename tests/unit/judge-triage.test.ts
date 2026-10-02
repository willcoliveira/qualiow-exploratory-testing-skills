import { describe, it, expect, afterEach, vi } from 'vitest';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { EXIT_UNAVAILABLE, TriageNotEnabledError, runJudgeTriage } from '../../src/cli/commands/judge.js';
import { readEnvVar } from '../../src/utils/paths.js';
import { hasConfidentialityHeader } from '../../src/utils/confidentiality.js';
import type { TriageQuestion } from '../../src/triage/types.js';

const REPO_ROOT = resolve(process.cwd());
const SESSION_NAME = '2026-09-20-1500-explore-verified-example';
const FIXTURE_SESSION = join(REPO_ROOT, 'tests/fixtures/verified-session', SESSION_NAME);
const MOCK = join(REPO_ROOT, 'tests/fixtures/triage/mock-response.json');
const KEY_ENV = 'TYPESAFE_API_KEY';

const tmpDirs: string[] = [];
const originalKey = process.env[KEY_ENV];

function makeCwd(): { cwd: string; claim: string; verification: string } {
  const cwd = mkdtempSync(join(tmpdir(), 'qualiow-judge-'));
  tmpDirs.push(cwd);
  const session = join(cwd, 'output', 'sessions', SESSION_NAME);
  cpSync(FIXTURE_SESSION, session, { recursive: true });
  const verification = join(session, 'verification');
  // The fixture ships its own JEV-101 files; drop them so each case starts clean.
  for (const f of readdirSync(verification)) if (f.startsWith('JEV-')) rmSync(join(verification, f));
  return { cwd, claim: join(verification, 'claims', 'CLAIM-101.md'), verification };
}

function writeTarget(cwd: string, id: string, verification: string[]): void {
  mkdirSync(join(cwd, 'data', 'targets'), { recursive: true });
  writeFileSync(
    join(cwd, 'data', 'targets', `${id}.yml`),
    [
      `id: ${id}`,
      'name: Example target',
      'base_url: https://example.com',
      'domain: ecommerce',
      'auth:',
      '  strategy: none',
      'browser:',
      '  headless: true',
      '  viewport:',
      '    width: 1280',
      '    height: 720',
      'scope:',
      '  max_depth: 2',
      ...verification,
      '',
    ].join('\n'),
  );
}

function writeOptInTarget(cwd: string, id = 'opted-in', extra: string[] = []): void {
  writeTarget(cwd, id, ['verification:', '  mode: triage-shadow', '  triage_provider: typesafe', ...extra]);
}

/** A fetch stub that answers every question in the request with a fixed shape. */
function answeringFetch(status = 200) {
  return vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string) as { questions: Record<string, TriageQuestion> };
    const answers: Record<string, unknown> = {};
    for (const [id, q] of Object.entries(body.questions)) {
      if (q.type === 'noul') answers[id] = { type: 'noul', noul: id === 'by_design' ? 0.7 : 0.1 };
      else if (id === 'severity_fit')
        answers[id] = { type: 'choice', choice: 'medium', probabilities: { critical: 0, high: 0.2, medium: 0.7, low: 0.1 }, confidence: 0.6 };
      else
        answers[id] = { type: 'choice', choice: 'confirmed', probabilities: { confirmed: 0.7, confirmed_adjusted: 0.2, refuted: 0.05, unreproducible: 0.05 }, confidence: 0.6 };
    }
    return new Response(JSON.stringify({ model: 'jev-mock', answers, usage: { input_tokens: 900, output_tokens: 40 } }), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  });
}

const triageFiles = (dir: string) => readdirSync(dir).filter((f) => /^(JEV|LAYA)-/.test(f));

afterEach(() => {
  if (originalKey === undefined) delete process.env[KEY_ENV];
  else process.env[KEY_ENV] = originalKey;
  while (tmpDirs.length) rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});

describe('runJudgeTriage --mock', () => {
  it('writes JEV-101.md and .json next to the verdicts and prints the block', async () => {
    const { cwd, claim, verification } = makeCwd();
    const result = await runJudgeTriage(claim, { mock: MOCK }, { cwd });

    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.claimId).toBe('CLAIM-101');
    expect(result.mode).toBe('triage-shadow');
    expect(result.route).toBe('likely-confirmed');
    expect(result.predictedVerdict).toBe('CONFIRMED');
    expect(result.stdout.startsWith('JEV_VERDICT: CONFIRMED\nROUTE: likely-confirmed')).toBe(true);
    expect(result.stdout).toContain(`JEV_FILE: ${join(verification, 'JEV-101.md')}`);

    const md = readFileSync(join(verification, 'JEV-101.md'), 'utf-8');
    expect(hasConfidentialityHeader(md)).toBe(true);
    expect(md).toContain('```\nJEV_VERDICT: CONFIRMED');

    const json = JSON.parse(readFileSync(join(verification, 'JEV-101.json'), 'utf-8'));
    expect(json.claimId).toBe('CLAIM-101');
    expect(json.request.state.claim.url).toBe('[URL /account/payment-methods]');
    expect(json.request.questions.predicted_verdict.type).toBe('choice');
    expect(json.response.answers.fp_1).toEqual({ type: 'noul', noul: 0.05 });
    expect(json.evidence.sent).toEqual([{ file: 'payment-methods.json', lines: 9 }]);
    expect(json.costUsd).toBeCloseTo((2140 * 0.042) / 1e6, 8);
    expect(JSON.stringify(json)).not.toMatch(/Authorization|Bearer/);
  });

  it('honours --out', async () => {
    const { cwd, claim } = makeCwd();
    const out = join(cwd, 'elsewhere');
    const result = await runJudgeTriage(claim, { mock: MOCK, out }, { cwd });
    expect(result.mdPath).toBe(join(out, 'JEV-101.md'));
    expect(existsSync(join(out, 'JEV-101.json'))).toBe(true);
  });

  it('writes an UNAVAILABLE block (exit 3) when the mock is malformed', async () => {
    const { cwd, claim, verification } = makeCwd();
    const badMock = join(cwd, 'bad.json');
    writeFileSync(badMock, JSON.stringify({ model: 'x', answers: {}, usage: {} }));
    const result = await runJudgeTriage(claim, { mock: badMock }, { cwd });
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(EXIT_UNAVAILABLE);
    expect(result.route).toBeNull();
    const md = readFileSync(join(verification, 'JEV-101.md'), 'utf-8');
    expect(md).toContain('JEV_VERDICT: UNAVAILABLE (mock: malformed response');
    expect(md).toContain('ROUTE: n/a');
  });
});

describe('runJudgeTriage --dry-run', () => {
  it('prints the summary and writes nothing', async () => {
    const { cwd, claim, verification } = makeCwd();
    const result = await runJudgeTriage(claim, { dryRun: true }, { cwd });
    expect(result.stdout.startsWith('DRY-RUN')).toBe(true);
    expect(result.stdout).toContain('claim: CLAIM-101 (High)');
    expect(result.stdout).toContain('evidence sent: payment-methods.json (9 lines)');
    expect(result.predictedVerdict).toBe('DRY-RUN');
    expect(triageFiles(verification)).toEqual([]);
  });

  it('says whether a live run would send', async () => {
    const { cwd, claim } = makeCwd();
    delete process.env[KEY_ENV];
    const off = await runJudgeTriage(claim, { dryRun: true }, { cwd });
    expect(off.stdout).toMatch(/live run: would NOT send — .*verification.mode "judge"/);
    writeOptInTarget(cwd);
    process.env[KEY_ENV] = 'k';
    const on = await runJudgeTriage(claim, { dryRun: true, target: 'opted-in' }, { cwd });
    expect(on.stdout).toContain('live run: would send to typesafe');
  });

  it('refuses a claim card outside verification/claims/', async () => {
    const { cwd, claim } = makeCwd();
    const stray = join(cwd, 'scratch', 'claims', 'CLAIM-101.md');
    mkdirSync(join(cwd, 'scratch', 'claims'), { recursive: true });
    cpSync(claim, stray);
    await expect(runJudgeTriage(stray, { dryRun: true }, { cwd })).rejects.toThrow(/verification\/claims/);
  });

  it('writes an UNAVAILABLE record when a 200 lacks a confidence', async () => {
    const { cwd, claim, verification } = makeCwd();
    process.env[KEY_ENV] = 'k';
    writeOptInTarget(cwd);
    const base = answeringFetch();
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      const body = await (await base(url, init)).json();
      delete body.answers.predicted_verdict.confidence;
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    const result = await runJudgeTriage(claim, { target: 'opted-in' }, { cwd, fetch: fetchMock as never });
    expect(result.exitCode).toBe(EXIT_UNAVAILABLE);
    expect(readFileSync(join(verification, 'JEV-101.json'), 'utf-8')).toContain('numeric confidence');
  });

  it('refuses a stub card', async () => {
    const { cwd, verification } = makeCwd();
    await expect(
      runJudgeTriage(join(verification, 'claims', 'CLAIM-102.md'), { dryRun: true }, { cwd }),
    ).rejects.toThrow(/incomplete/);
  });
});

describe('runJudgeTriage gate — nothing is sent without the opt-in', () => {
  it.each([
    ['no target config at all', null],
    ['a target with no verification block', []],
    ['mode judge', ['verification:', '  mode: judge']],
    ['mode off', ['verification:', '  mode: off']],
  ])('%s: refuses, calls fetch zero times and writes nothing, even with the key set', async (_label, block) => {
    const { cwd, claim, verification } = makeCwd();
    process.env[KEY_ENV] = 'key-present-but-not-opted-in';
    if (block) writeTarget(cwd, 'plain', block);
    const fetchMock = answeringFetch();
    await expect(
      runJudgeTriage(claim, block ? { target: 'plain' } : {}, { cwd, fetch: fetchMock as never }),
    ).rejects.toBeInstanceOf(TriageNotEnabledError);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(triageFiles(verification)).toEqual([]);
  });

  it('refuses to send when the key is missing', async () => {
    const { cwd, claim } = makeCwd();
    delete process.env[KEY_ENV];
    writeOptInTarget(cwd);
    const fetchMock = answeringFetch();
    await expect(runJudgeTriage(claim, { target: 'opted-in' }, { cwd, fetch: fetchMock as never })).rejects.toThrow(
      /TYPESAFE_API_KEY/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reads the key from .env, sends once, and never writes the key to disk', async () => {
    const { cwd, claim, verification } = makeCwd();
    delete process.env[KEY_ENV];
    writeOptInTarget(cwd);
    writeFileSync(join(cwd, '.env'), '# comment line\nTYPESAFE_API_KEY=test-key-123\n');
    const fetchMock = answeringFetch();

    const result = await runJudgeTriage(claim, { target: 'opted-in' }, { cwd, fetch: fetchMock as never });

    expect(result.ok).toBe(true);
    expect(result.mode).toBe('triage-shadow');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-key-123');
    expect(result.route).toBe('refute-risk'); // by_design 0.7 fires
    expect(result.stdout).toContain('by_design 0.70 >= 0.6');
    for (const f of ['JEV-101.md', 'JEV-101.json']) {
      expect(readFileSync(join(verification, f), 'utf-8')).not.toContain('test-key-123');
    }
  });

  it('uses the env var the target names', async () => {
    const { cwd, claim } = makeCwd();
    delete process.env[KEY_ENV];
    writeOptInTarget(cwd, 'named', ['  triage_api_key_env: MY_TRIAGE_KEY']);
    mkdirSync(join(cwd, 'qa'), { recursive: true });
    writeFileSync(join(cwd, 'qa', '.env'), 'MY_TRIAGE_KEY=from-qa-env\n');
    const fetchMock = answeringFetch();
    await runJudgeTriage(claim, { target: 'named' }, { cwd, fetch: fetchMock as never });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer from-qa-env');
  });

  it('fails open with exit 3 when the API stays unavailable', async () => {
    const { cwd, claim, verification } = makeCwd();
    process.env[KEY_ENV] = 'k';
    writeOptInTarget(cwd);
    const fetchMock = vi.fn(async () => new Response('overloaded', { status: 529 }));
    const sleep = vi.fn(async () => {});
    const result = await runJudgeTriage(claim, { target: 'opted-in' }, { cwd, fetch: fetchMock as never, sleep });
    expect(result.exitCode).toBe(EXIT_UNAVAILABLE);
    expect(result.route).toBeNull();
    expect(result.predictedVerdict).toContain('UNAVAILABLE (HTTP 529');
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const json = JSON.parse(readFileSync(join(verification, 'JEV-101.json'), 'utf-8'));
    expect(json.response).toBeNull();
    expect(json.unavailable).toContain('HTTP 529');
  });
});

describe('readEnvVar', () => {
  it('prefers the process environment, then qa/.env, then .env', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'qualiow-env-'));
    tmpDirs.push(cwd);
    writeFileSync(join(cwd, '.env'), 'X_KEY=dot-env\n');
    expect(readEnvVar(cwd, 'X_KEY')).toBe('dot-env');
    mkdirSync(join(cwd, 'qa'));
    writeFileSync(join(cwd, 'qa', '.env'), '# comment\nX_KEY=qa-env\n');
    expect(readEnvVar(cwd, 'X_KEY')).toBe('qa-env');
    process.env.X_KEY = 'process';
    try {
      expect(readEnvVar(cwd, 'X_KEY')).toBe('process');
    } finally {
      delete process.env.X_KEY;
    }
    expect(readEnvVar(cwd, 'MISSING_KEY')).toBeUndefined();
  });
});
