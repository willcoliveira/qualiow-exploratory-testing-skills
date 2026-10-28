/**
 * `qualiow judge triage` never sends a credential value: the state is checked against
 * the target's credential values (every encoding the finalize scan knows) before any
 * provider is called, and a hit refuses the run with nothing sent and nothing written.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { EXIT_UNAVAILABLE, TriageRefusedError, runJudgeTriage } from '../../src/cli/commands/judge.js';

const REPO_ROOT = resolve(process.cwd());
const SESSION_NAME = '2026-09-20-1500-explore-verified-example';
const FIXTURE_SESSION = join(REPO_ROOT, 'tests/fixtures/verified-session', SESSION_NAME);
const MOCK = join(REPO_ROOT, 'tests/fixtures/triage/mock-response.json');

// Obvious fakes, under a name no real environment sets.
const PASS_NAME = 'QUALIOW_TEST_TRIAGE_PASSWORD';
const PASS_VALUE = 'Fake Triage&Pass=2026';

const tmpDirs: string[] = [];

afterEach(() => {
  vi.unstubAllEnvs();
  while (tmpDirs.length) rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});

function makeCwd(): { cwd: string; claim: string; verification: string } {
  const cwd = mkdtempSync(join(tmpdir(), 'qualiow-triage-cred-'));
  tmpDirs.push(cwd);
  const session = join(cwd, 'output', 'sessions', SESSION_NAME);
  cpSync(FIXTURE_SESSION, session, { recursive: true });
  const verification = join(session, 'verification');
  for (const f of readdirSync(verification)) if (/^(JEV|LAYA)-/.test(f)) rmSync(join(verification, f));
  mkdirSync(join(cwd, 'data', 'targets'), { recursive: true });
  writeFileSync(
    join(cwd, 'data', 'targets', 'local.yml'),
    [
      'id: local',
      'name: Local triage target',
      'base_url: https://example.com',
      'domain: ecommerce',
      'auth:',
      '  strategy: credentials',
      '  credentials:',
      '    username: QA_USER',
      `    password: ${PASS_NAME}`,
      'browser:',
      '  headless: true',
      '  viewport:',
      '    width: 1280',
      '    height: 720',
      'scope:',
      '  max_depth: 2',
      'verification:',
      '  mode: triage-shadow',
      '  triage_provider: laya',
      '  laya:',
      '    endpoint: http://127.0.0.1:8765/v1/systemone',
      '',
    ].join('\n'),
  );
  mkdirSync(join(cwd, 'qa'), { recursive: true });
  writeFileSync(join(cwd, 'qa', '.env'), `${PASS_NAME}="${PASS_VALUE}"\n`);
  return { cwd, claim: join(verification, 'claims', 'CLAIM-101.md'), verification };
}

function addStep(claim: string, step: string): void {
  const text = readFileSync(claim, 'utf-8').replace('3. Reload the page.', `3. ${step}\n4. Reload the page.`);
  writeFileSync(claim, text);
}

/** A loopback provider that would answer — it must never be reached. */
function fakeLaya() {
  return vi.fn(async () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
}

describe('judge triage — credential values never leave', () => {
  it.each([
    ['literally', PASS_VALUE],
    ['form-encoded', new URLSearchParams({ v: PASS_VALUE }).toString().slice(2)],
    ['URI-encoded', encodeURIComponent(PASS_VALUE)],
    ['base64-encoded', Buffer.from(PASS_VALUE).toString('base64')],
  ])('refuses a claim that quotes the password %s: exit 3, named, nothing sent or written', async (_label, form) => {
    const { cwd, claim, verification } = makeCwd();
    addStep(claim, `Submit the login form with body user=qa&password_field=${form} — state-changing`);
    const fetchMock = fakeLaya();

    const err = await runJudgeTriage(claim, { target: 'local' }, { cwd, fetch: fetchMock as never }).catch((e) => e);
    expect(err).toBeInstanceOf(TriageRefusedError);
    expect(err.exitCode).toBe(EXIT_UNAVAILABLE);
    expect(err.message).toContain(PASS_NAME);
    expect(err.message).not.toContain(PASS_VALUE);
    expect(err.message).not.toContain(form);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(readdirSync(verification).filter((f) => /^(JEV|LAYA)-/.test(f))).toEqual([]);
  });

  it('refuses a value carried by a text evidence file the card lists', async () => {
    const { cwd, claim, verification } = makeCwd();
    const session = join(cwd, 'output', 'sessions', SESSION_NAME);
    mkdirSync(join(session, 'evidence'), { recursive: true });
    writeFileSync(join(session, 'evidence', 'login-request.txt'), `POST /login\nbody: secret_field=${encodeURIComponent(PASS_VALUE)}\n`);
    writeFileSync(claim, readFileSync(claim, 'utf-8').replace('- Console / network excerpts: none', '- evidence/login-request.txt'));
    const fetchMock = fakeLaya();

    const err = await runJudgeTriage(claim, { target: 'local' }, { cwd, fetch: fetchMock as never }).catch((e) => e);
    expect(err).toBeInstanceOf(TriageRefusedError);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(readdirSync(verification).filter((f) => /^(JEV|LAYA)-/.test(f))).toEqual([]);
  });

  it('--mock is refused the same way: the request would be written into the session', async () => {
    const { cwd, claim, verification } = makeCwd();
    addStep(claim, `Type ${PASS_VALUE} into the password field — state-changing`);
    const err = await runJudgeTriage(claim, { target: 'local', mock: MOCK }, { cwd }).catch((e) => e);
    expect(err).toBeInstanceOf(TriageRefusedError);
    expect(readdirSync(verification).filter((f) => /^(JEV|LAYA)-/.test(f))).toEqual([]);
  });

  it('--dry-run names the variable a live run would refuse on, never the value', async () => {
    const { cwd, claim } = makeCwd();
    addStep(claim, `Type ${PASS_VALUE} into the password field — state-changing`);
    const result = await runJudgeTriage(claim, { target: 'local', dryRun: true }, { cwd });
    expect(result.stdout).toContain(`credential values: the state carries ${PASS_NAME}`);
    expect(result.stdout).not.toContain(PASS_VALUE);
  });

  it('a clean claim is still sent', async () => {
    const { cwd, claim } = makeCwd();
    const result = await runJudgeTriage(claim, { target: 'local', dryRun: true }, { cwd });
    expect(result.stdout).toContain('credential values: none in the state');
  });
});
