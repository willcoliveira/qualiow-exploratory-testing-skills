import { describe, it, expect, afterEach, vi } from 'vitest';
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
  verbatim?: boolean;
}

function stub(result: Partial<SpawnResult> = {}): { spawn: Spawner; calls: Call[] } {
  const calls: Call[] = [];
  const spawn: Spawner = async (command, args, opts) => {
    calls.push({
      command,
      args,
      cwd: opts.cwd,
      ...(opts.windowsVerbatimArguments === undefined ? {} : { verbatim: opts.windowsVerbatimArguments }),
    });
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

describe('resolvePlaywrightCli and auth fill on Windows (mocked platform)', () => {
  const WIN = { platform: 'win32' as NodeJS.Platform };
  afterEach(() => vi.unstubAllEnvs());

  function winBin(cwd: string, ...names: string[]): string {
    const dir = join(cwd, 'win-bin');
    mkdirSync(dir, { recursive: true });
    for (const n of names) writeFileSync(join(dir, n), '@ECHO off\r\n');
    return dir;
  }

  it('finds npm’s .cmd shim on PATH, never the extensionless sh script', () => {
    const cwd = makeCwd();
    const dir = winBin(cwd, 'playwright-cli', 'playwright-cli.cmd');
    expect(resolvePlaywrightCli(cwd, dir, 'win32')).toEqual({ command: join(dir, 'playwright-cli.cmd'), args: [] });
    writeFileSync(join(dir, 'playwright-cli.exe'), 'MZ');
    expect(resolvePlaywrightCli(cwd, dir, 'win32')).toEqual({ command: join(dir, 'playwright-cli.exe'), args: [] });
  });

  it('PATH is split on ; and the project’s node_modules/.bin shim comes next, then npx.cmd', () => {
    const cwd = makeCwd();
    const dir = winBin(cwd, 'playwright-cli');
    expect(resolvePlaywrightCli(cwd, `C:\\nowhere;${dir}`, 'win32')).toEqual({ command: 'npx.cmd', args: ['playwright-cli'] });
    const npxDir = winBin(join(cwd, 'node'), 'npx.cmd');
    expect(resolvePlaywrightCli(cwd, `${dir};${npxDir}`, 'win32')).toEqual({
      command: join(npxDir, 'npx.cmd'),
      args: ['playwright-cli'],
    });
    const localBin = join(cwd, 'node_modules', '.bin');
    mkdirSync(localBin, { recursive: true });
    writeFileSync(join(localBin, 'playwright-cli.cmd'), '@ECHO off\r\n');
    expect(resolvePlaywrightCli(cwd, dir, 'win32')).toEqual({ command: join(localBin, 'playwright-cli.cmd'), args: [] });
  });

  it('runs a .cmd shim through cmd.exe /d /s /c with every argument quoted, passed verbatim', async () => {
    vi.stubEnv('ComSpec', 'C:\\Windows\\System32\\cmd.exe');
    const cwd = makeCwd(`${NAME}=Fake pass & more <x>\\\n`);
    const dir = winBin(cwd, 'playwright-cli.cmd');
    const { spawn, calls } = stub();
    expect((await runAuthFill({ session: 's1', ref: 'e7', env: NAME }, { cwd, spawn, pathEnv: dir, ...WIN })).exitCode).toBe(0);
    expect(calls).toHaveLength(1);
    expect(calls[0].command).toBe('C:\\Windows\\System32\\cmd.exe');
    expect(calls[0].verbatim).toBe(true);
    // A trailing backslash is doubled so it cannot escape the closing quote.
    expect(calls[0].args).toEqual([
      '/d',
      '/s',
      '/v:off',
      '/c',
      `""${join(dir, 'playwright-cli.cmd')}" "-s=s1" "fill" "e7" "--" "Fake pass & more <x>\\\\""`,
    ]);
  });

  it.each([
    ['a double quote', 'Fake"pass'],
    ['a percent sign', 'Fake%PATH%pass'],
    ['an exclamation mark', 'Fake!pass!'],
    ['a caret', 'Fake^pass'],
    ['a line break', 'Fake\rpass'],
  ])('refuses a value with %s that cmd.exe would re-parse, before spawning', async (_label, value) => {
    const cwd = makeCwd();
    process.env[NAME] = value;
    const dir = winBin(cwd, 'playwright-cli.cmd');
    const { spawn, calls } = stub();
    const err = await runAuthFill({ session: 's1', ref: 'e7', env: NAME }, { cwd, spawn, pathEnv: dir, ...WIN }).catch((e) => e);
    expect(err).toBeInstanceOf(AuthFillUsageError);
    expect(err.message).toContain('cmd.exe');
    expect(err.message).not.toContain(value);
    expect(calls).toHaveLength(0);
  });

  it('spawns a real .exe directly, with no shell, whatever the value holds', async () => {
    const cwd = makeCwd();
    process.env[NAME] = 'Fake"%pass!^';
    const dir = winBin(cwd, 'playwright-cli.exe');
    const { spawn, calls } = stub();
    await runAuthFill({ session: 's1', ref: 'e7', env: NAME }, { cwd, spawn, pathEnv: dir, ...WIN });
    expect(calls[0].command).toBe(join(dir, 'playwright-cli.exe'));
    expect(calls[0].args).toEqual(['-s=s1', 'fill', 'e7', '--', 'Fake"%pass!^']);
    expect(calls[0].verbatim).toBeUndefined();
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

describe('qualiow auth fill — target ids and non-login names', () => {
  // A cloud-shaped name no real environment sets; the value is obviously fake.
  const CLOUD = 'AWS_QUALIOW_TEST_SECRET';
  const CLOUD_VALUE = 'not-a-real-cloud-secret-0000';

  it('refuses a --target that walks out of data/targets/, before reading or spawning anything', async () => {
    const cwd = makeCwd(`${CLOUD}=${CLOUD_VALUE}\n`);
    // A YAML planted outside data/targets/ that declares the cloud key as its login token.
    writeFileSync(join(cwd, 'planted.yml'), `id: planted\nauth:\n  strategy: token\n  token: ${CLOUD}\n`);
    const { spawn, calls } = stub();
    for (const target of ['../../planted', '../planted', 'sub/../../../planted', '/tmp/planted', '..']) {
      const err = await runAuthFill({ session: 's1', ref: 'e1', env: CLOUD, target }, { cwd, spawn, ...NO_PATH }).catch((e) => e);
      expect(err, target).toBeInstanceOf(AuthFillUsageError);
      expect(err.message).toContain('--target');
      expect(err.message).not.toContain(CLOUD_VALUE);
    }
    expect(calls).toHaveLength(0);
  });

  it.each([
    ['a cloud key declared as the login token', `auth:\n  strategy: token\n  token: ${CLOUD}\n`, CLOUD],
    ['an *_API_KEY declared as the password', 'auth:\n  strategy: credentials\n  credentials:\n    password: SHOP_API_KEY\n', 'SHOP_API_KEY'],
    ['a TYPESAFE_* name declared as the token', 'auth:\n  strategy: token\n  token: TYPESAFE_QUALIOW_TEST\n', 'TYPESAFE_QUALIOW_TEST'],
    [
      "the target's own api.token_env declared as the password",
      'auth:\n  strategy: credentials\n  credentials:\n    password: SVC_TOKEN\napi:\n  auth: api-key-env\n  token_env: SVC_TOKEN\n',
      'SVC_TOKEN',
    ],
    [
      'the triage key declared as the token',
      'auth:\n  strategy: token\n  token: TRIAGE_KEY\nverification:\n  mode: triage-shadow\n  triage_api_key_env: TRIAGE_KEY\n',
      'TRIAGE_KEY',
    ],
    [
      'the local triage server key declared as the password',
      'auth:\n  strategy: credentials\n  credentials:\n    password: LAYA_LOCAL_KEY\nverification:\n  laya:\n    api_key_env: LAYA_LOCAL_KEY\n',
      'LAYA_LOCAL_KEY',
    ],
    [
      'a default login name the target uses as its API key',
      'auth:\n  strategy: none\napi:\n  auth: api-key-env\n  token_env: QA_TOKEN\n',
      'QA_TOKEN',
    ],
  ])('refuses %s', async (_label, body, name) => {
    const cwd = makeCwd(`${name}=not-a-real-key-value-0000\n`, `id: test-target\n${body}`);
    const { spawn, calls } = stub();
    const saved = process.env[name];
    delete process.env[name];
    try {
      const err = await runAuthFill({ session: 's1', ref: 'e1', env: name }, { cwd, spawn, ...NO_PATH }).catch((e) => e);
      expect(err).toBeInstanceOf(AuthFillUsageError);
      expect(err.message).not.toContain('not-a-real-key-value-0000');
    } finally {
      if (saved !== undefined) process.env[name] = saved;
    }
    expect(calls).toHaveLength(0);
  });
});
