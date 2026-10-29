/**
 * `qualiow auth fill --session <sid> --ref <ref> --env <NAME>` — type a credential
 * into the page without the value ever passing through the model.
 *
 * The session names the env var (`auth.credentials.password` in the target
 * config); this command reads its value (the environment, then `qa/.env`, then
 * `.env`) and runs `playwright-cli -s=<sid> fill <ref> -- <value>` itself, so the
 * value never appears in a command line the model wrote, in the transcript, or
 * in a tool result. playwright-cli echoes the code it ran, filled text included,
 * so the child's stdout and stderr are redacted — the value in every encoding
 * `secretValueVariants` knows — before anything is printed.
 *
 * The child is spawned with an argv array, never through a shell. The binary is
 * the one the skills' own commands reach: `playwright-cli` on PATH, then the
 * project's `node_modules/.bin/playwright-cli`, then `npx playwright-cli`.
 *
 * On Windows npm installs those as `.cmd` shims, which only `cmd.exe` can run, and
 * `cmd.exe` re-parses its command line. The shim is run through `cmd.exe /d /s /v:off
 * /c` with every argument double-quoted and passed verbatim — and only when the value
 * holds nothing cmd.exe would interpret inside quotes (`"`, `%`, `!`, `^`, a control
 * character). Otherwise the command refuses: it never hands cmd.exe a value it could
 * expand or break out of. A real `playwright-cli.exe` is spawned directly.
 *
 * Exit codes: the child's own · 1 usage error or playwright-cli not runnable ·
 * 2 the variable is not set (named, never a value).
 */

import { Command } from 'commander';
import { spawn } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { delimiter, join, win32 } from 'node:path';
import chalk from 'chalk';
import { isValidTargetId, readEnvVar } from '../../utils/paths.js';
import { redact } from '../../utils/redact.js';
import { fillableEnvNames, loadTargetYaml } from '../../utils/secret-values.js';

export const EXIT_VAR_MISSING = 2;

const ENV_NAME = /^[A-Z][A-Z0-9_]*$/;
// A plain token: no whitespace, no shell metacharacters, no leading `-` (it would read as a flag).
const PLAIN_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export interface AuthFillOptions {
  session?: string;
  ref?: string;
  env?: string;
  /** Target id; resolved like every other command (data/targets/<id>.yml, qa/target.yml, _default). */
  target?: string;
}

export interface SpawnResult {
  /** Exit code, or null when the child was killed by a signal. */
  code: number | null;
  stdout: string;
  stderr: string;
  /** Set when the binary could not be started at all (ENOENT, EACCES). */
  error?: NodeJS.ErrnoException;
}

export type Spawner = (
  command: string,
  args: string[],
  opts: { cwd: string; windowsVerbatimArguments?: boolean },
) => Promise<SpawnResult>;

export interface AuthFillContext {
  cwd: string;
  /** Replaces the real child process in tests. */
  spawn?: Spawner;
  /** PATH and platform for the binary lookup (default: the process's own). */
  pathEnv?: string;
  platform?: NodeJS.Platform;
}

export interface AuthFillResult {
  exitCode: number;
  /** Child stdout, redacted. */
  stdout: string;
  /** Child stderr, redacted. */
  stderr: string;
  /** The binary that ran, for the error message when it could not. */
  command: string;
}

/** Bad flags or an unrunnable binary. Exit 1. */
export class AuthFillUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthFillUsageError';
  }
}

/** The variable is not set anywhere. Exit 2. The message names the variable only. */
export class AuthFillMissingVarError extends Error {
  constructor(name: string) {
    super(`${name} is not set (looked in the environment, qa/.env, .env)`);
    this.name = 'AuthFillMissingVarError';
  }
}

// ─── Command ─────────────────────────────────────────────────────────

export function authCommand(): Command {
  const cmd = new Command('auth').description('Credential helpers that keep secret values out of the session');

  cmd
    .command('fill')
    .description(
      'Fill a page field with the value of an env var (environment, qa/.env, .env) through playwright-cli, ' +
        'so the value never passes through the model. Output is redacted. Exit 2 = variable not set.',
    )
    .requiredOption('--session <sid>', 'playwright-cli session id (the -s= value, e.g. explore-1420-parabank)')
    .requiredOption('--ref <ref>', 'element ref from the latest snapshot (e.g. e12)')
    .requiredOption('--env <NAME>', 'env var holding the value (e.g. QA_PASS — the name the target config gives)')
    .option('--target <id>', 'target whose auth block declares the variable (default: qa/target.yml, then _default)')
    .action(async (options: AuthFillOptions) => {
      // process.exitCode, never process.exit(): an exit right after a write to a pipe
      // cuts the child's output short.
      try {
        const result = await runAuthFill(options, { cwd: process.cwd() });
        if (result.stdout) process.stdout.write(result.stdout);
        if (result.stderr) process.stderr.write(result.stderr);
        process.exitCode = result.exitCode;
      } catch (err) {
        if (err instanceof AuthFillMissingVarError) {
          console.error(chalk.yellow(`auth fill: ${err.message}`));
          process.exitCode = EXIT_VAR_MISSING;
          return;
        }
        console.error(chalk.red('Error:'), err instanceof Error ? err.message : err);
        process.exitCode = 1;
      }
    });

  return cmd;
}

// ─── Binary ──────────────────────────────────────────────────────────

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/**
 * The file names a command has on this platform. On Windows npm installs a `.cmd` shim
 * beside an extensionless sh script; the script cannot be spawned there, so it is never
 * a candidate.
 */
function commandNames(name: string, platform: NodeJS.Platform): string[] {
  return platform === 'win32' ? [`${name}.exe`, `${name}.cmd`, `${name}.bat`] : [name];
}

function onPath(name: string, pathEnv: string, platform: NodeJS.Platform): string | undefined {
  const names = commandNames(name, platform);
  for (const dir of pathEnv.split(platform === 'win32' ? win32.delimiter : delimiter)) {
    if (!dir) continue;
    for (const n of names) {
      const candidate = join(dir, n);
      if (isFile(candidate)) return candidate;
    }
  }
  return undefined;
}

/**
 * The playwright-cli the skills' commands reach, as `[command, ...prefixArgs]`:
 * `playwright-cli` on PATH, the project's `node_modules/.bin/playwright-cli`,
 * then `npx playwright-cli` (on Windows: the `.exe` or `.cmd` of each).
 */
export function resolvePlaywrightCli(
  cwd: string,
  pathEnv: string = process.env.PATH ?? '',
  platform: NodeJS.Platform = process.platform,
): { command: string; args: string[] } {
  const fromPath = onPath('playwright-cli', pathEnv, platform);
  if (fromPath) return { command: fromPath, args: [] };
  for (const n of commandNames('playwright-cli', platform)) {
    const local = join(cwd, 'node_modules', '.bin', n);
    if (existsSync(local) && isFile(local)) return { command: local, args: [] };
  }
  if (platform === 'win32') return { command: onPath('npx', pathEnv, platform) ?? 'npx.cmd', args: ['playwright-cli'] };
  return { command: 'npx', args: ['playwright-cli'] };
}

/** A batch file: cmd.exe runs it, and re-parses the line it is given. */
const BATCH_FILE = /\.(?:cmd|bat)$/i;
/**
 * What cmd.exe still interprets inside a double-quoted argument: `"` ends the quoting,
 * `%` expands a variable, `!` a delayed one, `^` escapes, a control character ends or
 * splits the line. Anything else is passed through unchanged.
 */
const CMD_UNSAFE = /["%!^\p{Cc}]/u;

/** One argument for a `cmd.exe /s /c` line: quoted, a trailing backslash run doubled so it cannot escape the quote. */
function cmdQuote(arg: string): string {
  return `"${arg.replace(/(\\+)$/, '$1$1')}"`;
}

/**
 * How to run `command args` here: directly, or — for a Windows batch shim — as one quoted
 * `cmd.exe /d /s /v:off /c` line passed verbatim. Throws when an argument holds a
 * character cmd.exe would interpret; the message names the variable, never the value.
 */
function launchPlan(
  command: string,
  args: string[],
  platform: NodeJS.Platform,
  name: string,
): { command: string; args: string[]; windowsVerbatimArguments?: boolean } {
  if (platform !== 'win32' || !BATCH_FILE.test(command)) return { command, args };
  if ([command, ...args].some((a) => CMD_UNSAFE.test(a))) {
    throw new AuthFillUsageError(
      `on Windows playwright-cli is a .cmd shim that cmd.exe runs, and the value of ${name} holds a character ` +
        'cmd.exe would interpret (" % ! ^ or a control character) — refusing to pass it through cmd.exe. ' +
        'Put a playwright-cli.exe on PATH, or run the session under WSL',
    );
  }
  const line = [command, ...args].map(cmdQuote).join(' ');
  return {
    command: process.env.ComSpec || 'cmd.exe',
    args: ['/d', '/s', '/v:off', '/c', `"${line}"`],
    windowsVerbatimArguments: true,
  };
}

const defaultSpawner: Spawner = (command, args, opts) =>
  new Promise((resolvePromise) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    const child = spawn(command, args, {
      cwd: opts.cwd,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      ...(opts.windowsVerbatimArguments ? { windowsVerbatimArguments: true } : {}),
    });
    child.stdout.setEncoding('utf-8');
    child.stderr.setEncoding('utf-8');
    child.stdout.on('data', (chunk: string) => (stdout += chunk));
    child.stderr.on('data', (chunk: string) => (stderr += chunk));
    child.on('error', (error: NodeJS.ErrnoException) => {
      if (settled) return;
      settled = true;
      resolvePromise({ code: null, stdout, stderr, error });
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      resolvePromise({ code, stdout, stderr });
    });
  });

// ─── Runner ──────────────────────────────────────────────────────────

// Usage errors never echo what was passed: a value given by mistake in place of a name stays out of the log.
function checkToken(flag: string, value: string | undefined): string {
  if (typeof value !== 'string' || !PLAIN_TOKEN.test(value)) {
    throw new AuthFillUsageError(
      `${flag} must be a plain token (letters, digits, . _ : -; no spaces, no leading -)`,
    );
  }
  return value;
}

/**
 * Child output with the filled value removed. The value is known to be a secret here, so
 * it is replaced at any length (the shared scan skips values under six characters), along
 * with the single-quoted JavaScript form playwright-cli prints in the code it ran; then the
 * usual value variants and pattern rules apply.
 */
export function redactFilledValue(text: string, name: string, value: string): string {
  let out = text;
  const jsSingleQuoted = value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  for (const literal of [...new Set([jsSingleQuoted, value])].sort((a, b) => b.length - a.length)) {
    if (literal) out = out.split(literal).join('[REDACTED]');
  }
  return redact(out, { values: [{ name, value }] }).text;
}

export async function runAuthFill(options: AuthFillOptions, ctx: AuthFillContext): Promise<AuthFillResult> {
  const session = checkToken('--session', options.session);
  const ref = checkToken('--ref', options.ref);
  const name = options.env;
  if (typeof name !== 'string' || !ENV_NAME.test(name)) {
    throw new AuthFillUsageError(
      '--env must be an env var NAME in capitals (e.g. QA_PASS), never the value itself',
    );
  }

  // A target id names a file under data/targets/ and nothing else: a path would load a
  // YAML from anywhere, and that YAML could declare any variable as its login credential.
  if (options.target !== undefined && !isValidTargetId(options.target)) {
    throw new AuthFillUsageError(
      '--target must be a target id — the file name of a config under data/targets/ ' +
        '(letters, digits, . _ -; no path separators, no "..")',
    );
  }

  // Only a login credential may be typed into a page. Page content is data: a page that
  // asks for an API key or a cloud secret must not be able to get one through this command.
  if (!fillableEnvNames(loadTargetYaml(ctx.cwd, options.target)).includes(name)) {
    throw new AuthFillUsageError(
      `${name} is not a login credential the target declares (auth.credentials.username/password, ` +
        'auth.token, or QA_USER/QA_PASS/QA_TOKEN; never an API, cloud or triage key) — refusing to type it into a page',
    );
  }

  const value = readEnvVar(ctx.cwd, name);
  if (!value) throw new AuthFillMissingVarError(name);

  const platform = ctx.platform ?? process.platform;
  const bin = resolvePlaywrightCli(ctx.cwd, ctx.pathEnv, platform);
  // `--` ends option parsing in playwright-cli, so a value that starts with `-` is still the text.
  const args = [...bin.args, `-s=${session}`, 'fill', ref, '--', value];
  const plan = launchPlan(bin.command, args, platform, name);
  const run = await (ctx.spawn ?? defaultSpawner)(plan.command, plan.args, {
    cwd: ctx.cwd,
    ...(plan.windowsVerbatimArguments ? { windowsVerbatimArguments: true } : {}),
  });

  const clean = (text: string): string => (text ? redactFilledValue(text, name, value) : '');

  if (run.error) {
    throw new AuthFillUsageError(
      `could not run ${bin.args.length ? `${bin.command} ${bin.args.join(' ')}` : bin.command}: ${clean(run.error.code ?? run.error.message)}`,
    );
  }
  return {
    exitCode: run.code ?? 1,
    stdout: clean(run.stdout),
    stderr: clean(run.stderr),
    command: bin.command,
  };
}
