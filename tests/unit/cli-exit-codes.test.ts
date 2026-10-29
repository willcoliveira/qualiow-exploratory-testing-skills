/**
 * The documented exit codes of `qualiow auth fill` and `qualiow judge triage`, from the
 * built CLI in a child process — and stdout reaching a pipe whole before the process
 * exits. Skipped when `dist/` has not been built, like build.test.ts.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const REPO_ROOT = resolve(process.cwd());
const CLI_ENTRY = join(REPO_ROOT, 'dist', 'cli', 'index.js');
const SESSION_NAME = '2026-09-20-1500-explore-verified-example';
const FIXTURE_SESSION = join(REPO_ROOT, 'tests/fixtures/verified-session', SESSION_NAME);

// Obvious fakes, under names no real environment sets.
const PASS_NAME = 'QUALIOW_TEST_EXIT_PASSWORD';
const PASS_VALUE = 'Fake-Exit-Pass-2026';

const tmpDirs: string[] = [];
afterEach(() => {
  while (tmpDirs.length) rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});

function makeCwd(): string {
  const cwd = mkdtempSync(join(tmpdir(), 'qualiow-exit-'));
  tmpDirs.push(cwd);
  return cwd;
}

/** The environment the child runs in: this one, without any credential the tests rely on being unset. */
function childEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, FORCE_COLOR: '0', ...extra };
  for (const name of ['QA_PASS', 'QA_USER', 'QA_TOKEN', 'TYPESAFE_API_KEY', PASS_NAME]) {
    if (!(name in extra)) delete env[name];
  }
  return env;
}

function run(
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv = childEnv(),
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [CLI_ENTRY, ...args], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf-8');
    child.stderr.setEncoding('utf-8');
    child.stdout.on('data', (c: string) => (stdout += c));
    child.stderr.on('data', (c: string) => (stderr += c));
    child.on('error', reject);
    child.on('close', (code) => resolvePromise({ code, stdout, stderr }));
  });
}

function sessionWithTarget(verification: string[]): { cwd: string; claim: string; verification: string } {
  const cwd = makeCwd();
  const session = join(cwd, 'output', 'sessions', SESSION_NAME);
  cpSync(FIXTURE_SESSION, session, { recursive: true });
  const verificationDir = join(session, 'verification');
  for (const f of readdirSync(verificationDir)) if (/^(JEV|LAYA)-/.test(f)) rmSync(join(verificationDir, f));
  mkdirSync(join(cwd, 'data', 'targets'), { recursive: true });
  writeFileSync(
    join(cwd, 'data', 'targets', 'local.yml'),
    [
      'id: local',
      'name: Exit-code target',
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
      ...(verification.length ? ['verification:', ...verification.map((l) => `  ${l}`)] : []),
      '',
    ].join('\n'),
  );
  return { cwd, claim: join(verificationDir, 'claims', 'CLAIM-101.md'), verification: verificationDir };
}

/** A loopback port nothing listens on. */
function closedPort(): Promise<number> {
  return new Promise((resolvePromise, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolvePromise(port));
    });
  });
}

describe.skipIf(!existsSync(CLI_ENTRY))('documented exit codes (dist/cli/index.js)', () => {
  it('auth fill: 2 when the variable is not set, naming it', async () => {
    const cwd = makeCwd();
    const r = await run(['auth', 'fill', '--session', 's1', '--ref', 'e1', '--env', 'QA_PASS'], cwd);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('QA_PASS is not set');
  });

  it('auth fill: 1 for a --target that is not a target id', async () => {
    const cwd = makeCwd();
    const r = await run(['auth', 'fill', '--session', 's1', '--ref', 'e1', '--env', 'QA_PASS', '--target', '../x'], cwd);
    expect(r.code).toBe(1);
  });

  it.skipIf(process.platform === 'win32')(
    'auth fill: the child’s code, and its whole output reaches a pipe before the process exits',
    async () => {
      const cwd = makeCwd();
      const bin = join(cwd, 'bin');
      mkdirSync(bin);
      const fake = join(bin, 'playwright-cli');
      // Far more than a pipe buffer, so an exit right after the write would cut it short.
      writeFileSync(
        fake,
        `#!${process.execPath}\nprocess.stdout.write('x'.repeat(1024 * 1024) + '\\nEND\\n', () => process.exit(5));\n`,
      );
      chmodSync(fake, 0o755);
      const r = await run(
        ['auth', 'fill', '--session', 's1', '--ref', 'e1', '--env', 'QA_PASS'],
        cwd,
        childEnv({ QA_PASS: PASS_VALUE, PATH: `${bin}:${process.env.PATH ?? ''}` }),
      );
      expect(r.code).toBe(5);
      expect(r.stdout.length).toBe(1024 * 1024 + 5);
      expect(r.stdout.endsWith('\nEND\n')).toBe(true);
    },
  );

  it('judge triage: 2 when the target does not opt in, nothing written', async () => {
    const { cwd, claim, verification } = sessionWithTarget([]);
    const r = await run(['judge', 'triage', claim, '--target', 'local'], cwd);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('not enabled');
    expect(readdirSync(verification).filter((f) => /^(JEV|LAYA)-/.test(f))).toEqual([]);
  });

  it('judge triage: 3 when the provider is unavailable, with the block on stdout', async () => {
    const port = await closedPort();
    const { cwd, claim } = sessionWithTarget([
      'mode: triage-shadow',
      'triage_provider: laya',
      'laya:',
      `  endpoint: http://127.0.0.1:${port}/v1/systemone`,
    ]);
    const r = await run(['judge', 'triage', claim, '--target', 'local'], cwd);
    expect(r.code).toBe(3);
    expect(r.stdout).toContain('LAYA_FILE:');
    expect(r.stderr).toContain('unavailable');
  }, 30_000);

  it('judge triage: 3 when the state carries a credential value, naming it, nothing sent', async () => {
    const port = await closedPort();
    const { cwd, claim, verification } = sessionWithTarget([
      'mode: triage-shadow',
      'triage_provider: laya',
      'laya:',
      `  endpoint: http://127.0.0.1:${port}/v1/systemone`,
    ]);
    mkdirSync(join(cwd, 'qa'));
    writeFileSync(join(cwd, 'qa', '.env'), `${PASS_NAME}=${PASS_VALUE}\n`);
    const card = readFileSync(claim, 'utf-8');
    writeFileSync(claim, card.replace('3. Reload the page.', `3. Type ${PASS_VALUE} into the password field.\n4. Reload the page.`));
    const r = await run(['judge', 'triage', claim, '--target', 'local'], cwd);
    expect(r.code).toBe(3);
    expect(r.stderr).toContain(PASS_NAME);
    expect(`${r.stdout}${r.stderr}`).not.toContain(PASS_VALUE);
    expect(readdirSync(verification).filter((f) => /^(JEV|LAYA)-/.test(f))).toEqual([]);
  });
});
