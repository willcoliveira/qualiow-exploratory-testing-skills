import { describe, it, expect, afterEach, vi } from 'vitest';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  EXIT_UNAVAILABLE,
  TriageNotEnabledError,
  combineRoutes,
  resolveProviders,
  runJudgeTriage,
} from '../../src/cli/commands/judge.js';
import { TargetConfigSchema } from '../../src/schemas/target.schema.js';
import { hasConfidentialityHeader } from '../../src/utils/confidentiality.js';
import type { TriageQuestion } from '../../src/triage/types.js';

const REPO_ROOT = resolve(process.cwd());
const SESSION_NAME = '2026-09-20-1500-explore-verified-example';
const FIXTURE_SESSION = join(REPO_ROOT, 'tests/fixtures/verified-session', SESSION_NAME);
const MOCK = join(REPO_ROOT, 'tests/fixtures/triage/mock-response.json');
const KEY_ENV = 'TYPESAFE_API_KEY';
const originalKey = process.env[KEY_ENV];
const tmpDirs: string[] = [];

function makeCwd(): { cwd: string; claim: string; verification: string } {
  const cwd = mkdtempSync(join(tmpdir(), 'qualiow-providers-'));
  tmpDirs.push(cwd);
  const session = join(cwd, 'output', 'sessions', SESSION_NAME);
  cpSync(FIXTURE_SESSION, session, { recursive: true });
  const verification = join(session, 'verification');
  for (const f of readdirSync(verification)) if (/^(JEV|LAYA)-/.test(f)) rmSync(join(verification, f));
  return { cwd, claim: join(verification, 'claims', 'CLAIM-101.md'), verification };
}

function writeTarget(cwd: string, verificationLines: string[], id = 'both'): void {
  mkdirSync(join(cwd, 'data', 'targets'), { recursive: true });
  writeFileSync(
    join(cwd, 'data', 'targets', `${id}.yml`),
    [
      `id: ${id}`,
      'name: Provider target',
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
      'verification:',
      ...verificationLines.map((l) => `  ${l}`),
      '',
    ].join('\n'),
  );
}

/** Answers every question; `refute` pushes the verdict toward refuted so the route is refute-risk. */
function answeringFetch(model: string, refute = false) {
  return vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string) as { questions: Record<string, TriageQuestion> };
    const answers: Record<string, unknown> = {};
    for (const [id, q] of Object.entries(body.questions)) {
      if (q.type === 'noul') answers[id] = { type: 'noul', noul: id === 'evidence_shows_actual' || id === 'steps_sufficient' ? 0.9 : 0.1 };
      else if (id === 'severity_fit')
        answers[id] = { type: 'choice', choice: 'medium', probabilities: { critical: 0, high: 0.2, medium: 0.7, low: 0.1 }, confidence: 0.6 };
      else
        answers[id] = {
          type: 'choice',
          choice: refute ? 'refuted' : 'confirmed',
          probabilities: refute
            ? { confirmed: 0.1, confirmed_adjusted: 0.1, refuted: 0.7, unreproducible: 0.1 }
            : { confirmed: 0.9, confirmed_adjusted: 0.05, refuted: 0.03, unreproducible: 0.02 },
          confidence: 0.9,
        };
    }
    return new Response(JSON.stringify({ model, answers, usage: { input_tokens: 900, output_tokens: 0 } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
}

/** Routes each request to a per-endpoint stub. */
function routedFetch(byHost: Record<string, ReturnType<typeof answeringFetch>>) {
  return vi.fn(async (url: string, init: RequestInit) => {
    const host = new URL(url).hostname;
    const stub = byHost[host];
    if (!stub) throw new Error(`unexpected host ${host}`);
    return stub(url, init);
  });
}

afterEach(() => {
  if (originalKey === undefined) delete process.env[KEY_ENV];
  else process.env[KEY_ENV] = originalKey;
  while (tmpDirs.length) rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});

describe('verification schema — providers', () => {
  const base = {
    id: 't',
    name: 'T',
    base_url: 'https://example.com',
    domain: 'ecommerce',
    auth: { strategy: 'none' },
    browser: { headless: true, viewport: { width: 1280, height: 720 } },
    scope: { max_depth: 2 },
  };

  it('accepts triage_providers with a laya block', () => {
    const parsed = TargetConfigSchema.safeParse({
      ...base,
      verification: {
        mode: 'triage-shadow',
        triage_providers: ['typesafe', 'laya'],
        laya: { endpoint: 'http://127.0.0.1:8765/v1/systemone', model: 'multilingual', max_len: 4096 },
      },
    });
    expect(parsed.success).toBe(true);
  });

  it('requires a provider for triage-shadow, and only for it', () => {
    expect(TargetConfigSchema.safeParse({ ...base, verification: { mode: 'triage-shadow' } }).success).toBe(false);
    expect(TargetConfigSchema.safeParse({ ...base, verification: { mode: 'triage-shadow', triage_providers: ['laya'] } }).success).toBe(true);
    expect(TargetConfigSchema.safeParse({ ...base, verification: { mode: 'judge' } }).success).toBe(true);
    expect(TargetConfigSchema.safeParse({ ...base, verification: { mode: 'off' } }).success).toBe(true);
  });

  it('rejects removed and unknown modes, an empty list, an unknown provider and an unknown laya key', () => {
    const bad = [
      { mode: 'triage-always', triage_provider: 'typesafe' },
      { mode: 'triage-shadow', triage_providers: [] },
      { mode: 'triage-shadow', triage_providers: ['other'] },
      { mode: 'triage-shadow', triage_provider: 'laya', laya: { url: 'http://127.0.0.1' } },
      { mode: 'triage-shadow', triage_provider: 'typesafe', evidence_max_lines: 0 },
      { mode: 'triage-shadow', triage_provider: 'laya', triage_providers: ['laya'] },
      { mode: 'triage-shadow', triage_provider: 'typesafe', triage_api_key_env: 'my key' },
    ];
    for (const verification of bad) expect(TargetConfigSchema.safeParse({ ...base, verification }).success).toBe(false);
  });

  it('is not accepted on a mobile target yet', () => {
    const mobile = {
      id: 'm',
      name: 'M',
      platform: 'ios',
      domain: 'ecommerce',
      device: { name: 'qa-iphone' },
      app: { bundle_id: 'com.apple.mobilesafari' },
      web: { base_url: 'https://example.com' },
      auth: { strategy: 'none' },
      verification: { mode: 'triage-shadow', triage_provider: 'laya' },
    };
    expect(TargetConfigSchema.safeParse(mobile).success).toBe(false);
  });
});

describe('resolveProviders / combineRoutes', () => {
  it('uses the list, then the single field; typesafe only as the no-config fallback', () => {
    expect(resolveProviders({ triage_providers: ['laya', 'typesafe', 'laya'] })).toEqual(['laya', 'typesafe']);
    expect(resolveProviders({ triage_provider: 'laya' })).toEqual(['laya']);
    expect(resolveProviders(undefined)).toEqual(['typesafe']);
  });

  it('lets --provider narrow the list but never add to it', () => {
    expect(resolveProviders({ triage_providers: ['laya', 'typesafe'] }, 'typesafe')).toEqual(['typesafe']);
    expect(resolveProviders({ triage_provider: 'laya' }, 'laya')).toEqual(['laya']);
    expect(() => resolveProviders({ triage_provider: 'laya' }, 'typesafe')).toThrow(TriageNotEnabledError);
    expect(() => resolveProviders({ triage_providers: ['laya'] }, 'typesafe')).toThrow(/not one of the providers/);
  });

  it('takes the most cautious reading', () => {
    expect(combineRoutes(['likely-confirmed', 'unclear'])).toBe('unclear');
    expect(combineRoutes(['unclear', 'refute-risk', 'likely-confirmed'])).toBe('refute-risk');
    expect(combineRoutes(['likely-confirmed'])).toBe('likely-confirmed');
  });
});

describe('runJudgeTriage — providers', () => {
  it('--mock with both writes JEV and LAYA files and a combined ROUTE', async () => {
    const { cwd, claim, verification } = makeCwd();
    writeTarget(cwd, ['mode: triage-shadow', 'triage_providers: [typesafe, laya]']);
    const result = await runJudgeTriage(claim, { target: 'both', mock: MOCK }, { cwd });

    expect(result.ok).toBe(true);
    expect(existsSync(join(verification, 'JEV-101.md'))).toBe(true);
    expect(existsSync(join(verification, 'LAYA-101.md'))).toBe(true);
    const laya = readFileSync(join(verification, 'LAYA-101.md'), 'utf-8');
    expect(hasConfidentialityHeader(laya)).toBe(true);
    expect(laya).toContain('LAYA_VERDICT:');
    expect(laya).not.toContain('JEV_VERDICT:');
    expect(JSON.parse(readFileSync(join(verification, 'LAYA-101.json'), 'utf-8')).provider).toBe('laya');
    expect(JSON.parse(readFileSync(join(verification, 'JEV-101.json'), 'utf-8')).provider).toBeUndefined();

    expect(result.stdout).toContain('JEV_FILE:');
    expect(result.stdout).toContain('LAYA_FILE:');
    const routeLines = result.stdout.split('\n').filter((l) => l.startsWith('ROUTE: '));
    expect(routeLines).toHaveLength(3); // one per block + the combined line, which comes last
    expect(routeLines.at(-1)).toBe(`ROUTE: ${result.route}`);
    expect(result.stdout).toMatch(/ROUTE_SOURCE: most cautious of typesafe=\S+, laya=\S+/);
    expect(result.providers?.map((p) => p.provider)).toEqual(['typesafe', 'laya']);
  });

  it('a single-provider target prints one block (no combined lines)', async () => {
    const { cwd, claim } = makeCwd();
    writeTarget(cwd, ['mode: triage-shadow', 'triage_provider: typesafe'], 'hostedonly');
    const result = await runJudgeTriage(claim, { target: 'hostedonly', mock: MOCK }, { cwd });
    expect(result.stdout).not.toContain('ROUTE_SOURCE');
    expect(result.stdout).not.toContain('LAYA');
    expect(result.stdout.trim().split('\n').at(-1)).toMatch(/^JEV_FILE: /);
  });

  it('live: sends to both, Laya without a key; the more cautious reading wins', async () => {
    const { cwd, claim } = makeCwd();
    process.env[KEY_ENV] = 'ts-test-key';
    writeTarget(cwd, [
      'mode: triage-shadow',
      'triage_providers: [typesafe, laya]',
      'laya:',
      '  endpoint: http://127.0.0.1:8765/v1/systemone',
    ]);
    const hosted = answeringFetch('jev-mock');
    const laya = answeringFetch('laya-mock', true);
    const fetchMock = routedFetch({ 'api.typesafe.ai': hosted, '127.0.0.1': laya });

    const result = await runJudgeTriage(claim, { target: 'both' }, { cwd, fetch: fetchMock as never });

    expect(hosted).toHaveBeenCalledTimes(1);
    expect(laya).toHaveBeenCalledTimes(1);
    const hostedHeaders = (hosted.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    const layaInit = laya.mock.calls[0][1] as RequestInit;
    expect(hostedHeaders.Authorization).toBe('Bearer ts-test-key');
    expect((layaInit.headers as Record<string, string>).Authorization).toBeUndefined();
    const layaBody = JSON.parse(layaInit.body as string);
    expect(layaBody.model).toBe('multilingual');
    expect(layaBody.max_len).toBe(8192);
    // The hosted key never reaches the local server.
    expect(JSON.stringify(layaInit)).not.toContain('ts-test-key');

    expect(result.route).toBe('refute-risk');
    expect(result.providers?.find((p) => p.provider === 'laya')?.route).toBe('refute-risk');
    expect(result.providers?.find((p) => p.provider === 'typesafe')?.route).toBe('likely-confirmed');
  });

  it('live: --provider typesafe on a Laya-only target is refused and nothing reaches the hosted API', async () => {
    const { cwd, claim, verification } = makeCwd();
    process.env[KEY_ENV] = 'ts-test-key';
    writeTarget(cwd, ['mode: triage-shadow', 'triage_provider: laya'], 'layaonly');
    const fetchMock = vi.fn();
    await expect(
      runJudgeTriage(claim, { target: 'layaonly', provider: 'typesafe' }, { cwd, fetch: fetchMock as never }),
    ).rejects.toBeInstanceOf(TriageNotEnabledError);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(readdirSync(verification).filter((f) => /^(JEV|LAYA)-/.test(f))).toEqual([]);
  });

  it('live: --provider laya on a two-provider target runs only Laya', async () => {
    const { cwd, claim, verification } = makeCwd();
    process.env[KEY_ENV] = 'ts-test-key';
    writeTarget(cwd, ['mode: triage-shadow', 'triage_providers: [typesafe, laya]']);
    const laya = answeringFetch('laya-mock');
    const result = await runJudgeTriage(claim, { target: 'both', provider: 'laya' }, { cwd, fetch: routedFetch({ '127.0.0.1': laya }) as never });
    expect(result.ok).toBe(true);
    expect(laya).toHaveBeenCalledTimes(1);
    expect(existsSync(join(verification, 'JEV-101.md'))).toBe(false);
  });

  it('live: a missing hosted key skips that provider and still runs Laya', async () => {
    const { cwd, claim, verification } = makeCwd();
    delete process.env[KEY_ENV];
    writeTarget(cwd, ['mode: triage-shadow', 'triage_providers: [typesafe, laya]', 'triage_api_key_env: QUALIOW_TEST_NO_SUCH_KEY']);
    const laya = answeringFetch('laya-mock');
    const result = await runJudgeTriage(claim, { target: 'both' }, { cwd, fetch: routedFetch({ '127.0.0.1': laya }) as never });

    expect(result.ok).toBe(true);
    expect(result.skipped?.[0]?.provider).toBe('typesafe');
    expect(result.stdout).toContain('SKIPPED: typesafe');
    expect(existsSync(join(verification, 'JEV-101.md'))).toBe(false);
    expect(existsSync(join(verification, 'LAYA-101.md'))).toBe(true);
  });

  it.each([
    'https://laya.example.com/v1/systemone',
    'http://127.evil.example/v1/systemone',
  ])('live: refuses the non-loopback Laya endpoint %s and sends nothing', async (endpoint) => {
    const { cwd, claim } = makeCwd();
    writeTarget(cwd, ['mode: triage-shadow', 'triage_provider: laya', 'laya:', `  endpoint: ${endpoint}`]);
    const fetchMock = vi.fn();
    await expect(runJudgeTriage(claim, { target: 'both' }, { cwd, fetch: fetchMock as never })).rejects.toBeInstanceOf(
      TriageNotEnabledError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never echoes credentials from a refused endpoint', async () => {
    const { cwd, claim } = makeCwd();
    writeTarget(cwd, ['mode: triage-shadow', 'triage_provider: laya']);
    await expect(
      runJudgeTriage(claim, { target: 'both', endpoint: 'http://u:hunter2@10.0.0.9/v1' }, { cwd, fetch: vi.fn() as never }),
    ).rejects.toThrow(/laya endpoint 10\.0\.0\.9 is not loopback/);
    await runJudgeTriage(claim, { target: 'both', endpoint: 'http://u:hunter2@10.0.0.9/v1' }, { cwd }).catch((err: Error) => {
      expect(err.message).not.toContain('hunter2');
    });
  });

  it('refuses --endpoint when laya is not among the providers', async () => {
    const { cwd, claim } = makeCwd();
    writeTarget(cwd, ['mode: triage-shadow', 'triage_provider: typesafe'], 'hostedonly');
    await expect(
      runJudgeTriage(claim, { target: 'hostedonly', mock: MOCK, endpoint: 'http://127.0.0.1:9/v1' }, { cwd }),
    ).rejects.toThrow(/--endpoint applies to the laya provider only/);
  });

  it('live: --endpoint cannot point Laya off the machine either', async () => {
    const { cwd, claim } = makeCwd();
    writeTarget(cwd, ['mode: triage-shadow', 'triage_provider: laya']);
    const fetchMock = vi.fn();
    await expect(
      runJudgeTriage(claim, { target: 'both', endpoint: 'http://192.168.1.20:8000/v1/systemone' }, { cwd, fetch: fetchMock as never }),
    ).rejects.toBeInstanceOf(TriageNotEnabledError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('live: exit 3 only when every provider is unavailable', async () => {
    const { cwd, claim } = makeCwd();
    process.env[KEY_ENV] = 'ts-test-key';
    writeTarget(cwd, ['mode: triage-shadow', 'triage_providers: [typesafe, laya]']);
    const down = vi.fn(async () => new Response('down', { status: 500 }));
    const result = await runJudgeTriage(claim, { target: 'both' }, { cwd, fetch: down as never, sleep: async () => {} });
    expect(result.exitCode).toBe(EXIT_UNAVAILABLE);
    expect(result.route).toBeNull();
  });

  it('live: one provider down still records the other', async () => {
    const { cwd, claim } = makeCwd();
    process.env[KEY_ENV] = 'ts-test-key';
    writeTarget(cwd, ['mode: triage-shadow', 'triage_providers: [typesafe, laya]']);
    const hosted = answeringFetch('jev-mock');
    const fetchMock = vi.fn(async (url: string, init: RequestInit) =>
      new URL(url).hostname === '127.0.0.1' ? new Response('down', { status: 500 }) : hosted(url, init),
    );
    const result = await runJudgeTriage(claim, { target: 'both' }, { cwd, fetch: fetchMock as never, sleep: async () => {} });
    expect(result.exitCode).toBe(0);
    expect(result.providers?.find((p) => p.provider === 'laya')?.verdict).toMatch(/^UNAVAILABLE/);
    expect(result.stdout).toContain('laya=unavailable');
  });
});
