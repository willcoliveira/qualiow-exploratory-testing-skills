import { describe, it, expect, afterEach } from 'vitest';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  AuthFillMissingVarError,
  AuthFillUsageError,
  redactFilledValue,
  resolvePlaywrightCli,
  runAuthFill,
  type SpawnResult,
  type Spawner,
} from '../../src/cli/commands/auth.js';

// Obviously fake, and unique enough that no real environment sets them.
const NAME = 'QUALIOW_TEST_AUTH_PASS';
const VALUE = 'Summer2026!fake';

const tmpDirs: string[] = [];
// Every project declares NAME as its login password, as a real target config would.
function makeCwd(envFile?: string, targetYaml = `id: test-target\nauth:\n  strategy: credentials\n  credentials:\n    username: QA_USER\n    password: ${NAME}\n`): string {
  const cwd = mkdtempSync(join(tmpdir(), 'qualiow-auth-'));
  tmpDirs.push(cwd);
  mkdirSync(join(cwd, 'qa'), { recursive: true });
  writeFileSync(join(cwd, 'qa', 'target.yml'), targetYaml);
  if (envFile !== undefined) writeFileSync(join(cwd, 'qa', '.env'), envFile);
  return cwd;
}
afterEach(() => {
  delete process.env[NAME];
  while (tmpDirs.length) rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});

interface Call {
  command: string;
  args: string[];
  cwd: string;
}

function stub(result: Partial<SpawnResult> = {}): { spawn: Spawner; calls: Call[] } {
  const calls: Call[] = [];
  const spawn: Spawner = async (command, args, opts) => {
    calls.push({ command, args, cwd: opts.cwd });
    return { code: 0, stdout: '', stderr: '', ...result };
  };
  return { spawn, calls };
}

// An empty PATH makes the lookup deterministic: no playwright-cli on it, so the
// project's node_modules/.bin or npx is chosen.
const NO_PATH = { pathEnv: '', platform: 'darwin' as NodeJS.Platform };

describe('qualiow auth fill', () => {
  it('reads the value from qa/.env and passes it to playwright-cli as one argv entry, after --', async () => {
    const cwd = makeCwd(`${NAME}=${VALUE}\n`);
    const { spawn, calls } = stub();
    const result = await runAuthFill({ session: 'explore-1420-parabank', ref: 'e12', env: NAME }, { cwd, spawn, ...NO_PATH });
    expect(result.exitCode).toBe(0);
    expect(calls).toHaveLength(1);
    expect(calls[0].command).toBe('npx');
    expect(calls[0].args).toEqual(['playwright-cli', '-s=explore-1420-parabank', 'fill', 'e12', '--', VALUE]);
    expect(calls[0].cwd).toBe(cwd);
  });

  it('prefers the process environment over qa/.env (the paths.md order)', async () => {
    const cwd = makeCwd(`${NAME}=from-file-fake\n`);
    process.env[NAME] = VALUE;
    const { spawn, calls } = stub();
    await runAuthFill({ session: 's1', ref: 'e3', env: NAME }, { cwd, spawn, ...NO_PATH });
    expect(calls[0].args.at(-1)).toBe(VALUE);
  });

  it('redacts the value from the child output, including the code playwright-cli echoes', async () => {
    const cwd = makeCwd(`${NAME}=${VALUE}\n`);
    const echoed = [
      '### Ran Playwright code',
      "await page.getByRole('textbox', { name: 'Password' }).fill('Summer2026!fake');",
      `posted password ${encodeURIComponent(VALUE)} and ${Buffer.from(VALUE).toString('base64')}`,
    ].join('\n');
    const { spawn } = stub({ stdout: echoed, stderr: `warning: ${VALUE}` });
    const result = await runAuthFill({ session: 's1', ref: 'e3', env: NAME }, { cwd, spawn, ...NO_PATH });
    for (const text of [result.stdout, result.stderr]) {
      expect(text).not.toContain(VALUE);
      expect(text).not.toContain(encodeURIComponent(VALUE));
      expect(text).not.toContain(Buffer.from(VALUE).toString('base64'));
    }
    expect(result.stdout).toContain("fill('[REDACTED]')");
    expect(result.stdout).toContain('### Ran Playwright code');
  });

  it('redacts a short value and its single-quoted JavaScript form', () => {
    expect(redactFilledValue('fill("abc")', NAME, 'abc')).toBe('fill("[REDACTED]")');
    expect(redactFilledValue("fill('it\\'s-fake')", NAME, "it's-fake")).toBe("fill('[REDACTED]')");
  });

  it('exits with the child code', async () => {
    const cwd = makeCwd(`${NAME}=${VALUE}\n`);
    const { spawn } = stub({ code: 3, stderr: `Error: ref e99 not found while filling ${VALUE}` });
    const result = await runAuthFill({ session: 's1', ref: 'e99', env: NAME }, { cwd, spawn, ...NO_PATH });
    expect(result.exitCode).toBe(3);
    expect(result.stderr).toContain('ref e99 not found');
    expect(result.stderr).not.toContain(VALUE);

    const killed = stub({ code: null });
    expect((await runAuthFill({ session: 's1', ref: 'e1', env: NAME }, { cwd, spawn: killed.spawn, ...NO_PATH })).exitCode).toBe(1);
  });

  it('refuses a missing variable, naming it and never spawning', async () => {
    const cwd = makeCwd('');
    const { spawn, calls } = stub();
    const err = await runAuthFill({ session: 's1', ref: 'e3', env: NAME }, { cwd, spawn, ...NO_PATH }).catch((e) => e);
    expect(err).toBeInstanceOf(AuthFillMissingVarError);
    expect(err.message).toContain(NAME);
    expect(calls).toHaveLength(0);
  });

  it.each([
    ['session', { session: 'a b', ref: 'e1', env: NAME }],
    ['session', { session: '-rf', ref: 'e1', env: NAME }],
    ['session', { session: 's1;rm', ref: 'e1', env: NAME }],
    ['session', { session: 's1$(id)', ref: 'e1', env: NAME }],
    ['ref', { session: 's1', ref: '--help', env: NAME }],
    ['ref', { session: 's1', ref: 'e1 e2', env: NAME }],
    ['ref', { session: 's1', ref: '`id`', env: NAME }],
    ['env', { session: 's1', ref: 'e1', env: 'qa_pass' }],
    ['env', { session: 's1', ref: 'e1', env: VALUE }],
    ['env', { session: 's1', ref: 'e1', env: undefined }],
  ])('refuses a bad --%s before reading or spawning anything', async (_flag, options) => {
    const cwd = makeCwd(`${NAME}=${VALUE}\n`);
    const { spawn, calls } = stub();
    const err = await runAuthFill(options, { cwd, spawn, ...NO_PATH }).catch((e) => e);
    expect(err).toBeInstanceOf(AuthFillUsageError);
    expect(err.message).not.toContain(VALUE); // not even when it was passed in place of a name
    expect(calls).toHaveLength(0);
  });

  it('never puts the value in the error when the binary cannot start', async () => {
    const cwd = makeCwd(`${NAME}=${VALUE}\n`);
    const enoent = Object.assign(new Error(`spawn npx ENOENT ${VALUE}`), { code: 'ENOENT' }) as NodeJS.ErrnoException;
    const { spawn } = stub({ code: null, error: enoent });
    const err = await runAuthFill({ session: 's1', ref: 'e1', env: NAME }, { cwd, spawn, ...NO_PATH }).catch((e) => e);
    expect(err).toBeInstanceOf(AuthFillUsageError);
    expect(err.message).toContain('ENOENT');
    expect(err.message).not.toContain(VALUE);
  });
});

describe('qualiow auth fill — only login credentials', () => {
  it('refuses a variable the target does not declare, before reading it or spawning anything', async () => {
    const cwd = makeCwd('SOME_CLOUD_SECRET_KEY=not-a-real-cloud-key-1234\n');
    const { spawn, calls } = stub();
    const err = await runAuthFill({ session: 's1', ref: 'e1', env: 'SOME_CLOUD_SECRET_KEY' }, { cwd, spawn, ...NO_PATH }).catch((e) => e);
    expect(err).toBeInstanceOf(AuthFillUsageError);
    expect(err.message).toContain('not a login credential');
    expect(err.message).not.toContain('not-a-real-cloud-key-1234');
    expect(calls).toHaveLength(0);
  });

  it('refuses an API key the target declares for the API lane', async () => {
    const cwd = makeCwd('SVC_API_KEY=not-a-real-api-key-1234\n', `id: test-target\napi:\n  auth: api-key-env\n  token_env: SVC_API_KEY\n`);
    const { spawn, calls } = stub();
    const err = await runAuthFill({ session: 's1', ref: 'e1', env: 'SVC_API_KEY' }, { cwd, spawn, ...NO_PATH }).catch((e) => e);
    expect(err).toBeInstanceOf(AuthFillUsageError);
    expect(calls).toHaveLength(0);
  });

  it('accepts the default login names with no declaration', async () => {
    const cwd = makeCwd('QA_PASS=Default-Pass-fake\n', 'id: test-target\nauth:\n  strategy: none\n');
    const { spawn, calls } = stub();
    const saved = process.env.QA_PASS;
    delete process.env.QA_PASS;
    try {
      expect((await runAuthFill({ session: 's1', ref: 'e1', env: 'QA_PASS' }, { cwd, spawn, ...NO_PATH })).exitCode).toBe(0);
    } finally {
      if (saved !== undefined) process.env.QA_PASS = saved;
    }
    expect(calls).toHaveLength(1);
  });

  it('reads the declaration from the --target config', async () => {
    const cwd = makeCwd('SHOP_LOGIN_PASS=Shop-Pass-fake\n', 'id: other\nauth:\n  strategy: none\n');
    mkdirSync(join(cwd, 'data', 'targets'), { recursive: true });
    writeFileSync(
      join(cwd, 'data', 'targets', 'shop.yml'),
      'id: shop\nauth:\n  strategy: credentials\n  credentials:\n    username: SHOP_LOGIN_USER\n    password: SHOP_LOGIN_PASS\n',
    );
    const { spawn, calls } = stub();
    const refused = await runAuthFill({ session: 's1', ref: 'e1', env: 'SHOP_LOGIN_PASS' }, { cwd, spawn, ...NO_PATH }).catch((e) => e);
    expect(refused).toBeInstanceOf(AuthFillUsageError);
    expect((await runAuthFill({ session: 's1', ref: 'e1', env: 'SHOP_LOGIN_PASS', target: 'shop' }, { cwd, spawn, ...NO_PATH })).exitCode).toBe(0);
    expect(calls).toHaveLength(1);
  });
});

describe('resolvePlaywrightCli', () => {
  it('prefers playwright-cli on PATH, then node_modules/.bin, then npx', () => {
    const cwd = makeCwd();
    expect(resolvePlaywrightCli(cwd, '', 'darwin')).toEqual({ command: 'npx', args: ['playwright-cli'] });

    const localBin = join(cwd, 'node_modules', '.bin');
    mkdirSync(localBin, { recursive: true });
    writeFileSync(join(localBin, 'playwright-cli'), '#!/bin/sh\n');
    chmodSync(join(localBin, 'playwright-cli'), 0o755);
    expect(resolvePlaywrightCli(cwd, '', 'darwin')).toEqual({ command: join(localBin, 'playwright-cli'), args: [] });

    const pathDir = join(cwd, 'path-bin');
    mkdirSync(pathDir);
    writeFileSync(join(pathDir, 'playwright-cli'), '#!/bin/sh\n');
    expect(resolvePlaywrightCli(cwd, pathDir, 'darwin')).toEqual({ command: join(pathDir, 'playwright-cli'), args: [] });
  });
});

describe('qualiow auth fill with a real child process', () => {
  it('spawns without a shell and redacts what the child prints', async () => {
    if (process.platform === 'win32') return;
    // A value full of shell metacharacters: through a shell it would expand or split.
    const tricky = '$(echo pwned);`id`|x "fake" *';
    const cwd = makeCwd(`${NAME}='${tricky}'\n`);
    const pathDir = join(cwd, 'path-bin');
    mkdirSync(pathDir);
    const fake = join(pathDir, 'playwright-cli');
    writeFileSync(
      fake,
      `#!${process.execPath}\nconst a = process.argv.slice(2);\nconsole.log('argc=' + a.length);\nconsole.log('args=' + a.join('|'));\nprocess.exit(4);\n`,
    );
    chmodSync(fake, 0o755);
    const result = await runAuthFill({ session: 's1', ref: 'e7', env: NAME }, { cwd, pathEnv: pathDir });
    expect(result.exitCode).toBe(4);
    expect(result.command).toBe(fake);
    expect(result.stdout).toContain('argc=5');
    expect(result.stdout).toContain('args=-s=s1|fill|e7|--|');
    expect(result.stdout).not.toContain(tricky);
    expect(result.stdout).not.toContain('pwned');
  });
});
