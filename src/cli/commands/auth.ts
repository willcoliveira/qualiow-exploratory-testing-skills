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
 * Exit codes: the child's own · 1 usage error or playwright-cli not runnable ·
 * 2 the variable is not set (named, never a value).
 */

import { Command } from 'commander';
import { spawn } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import chalk from 'chalk';
import { readEnvVar } from '../../utils/paths.js';
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

export type Spawner = (command: string, args: string[], opts: { cwd: string }) => Promise<SpawnResult>;

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
      try {
        const result = await runAuthFill(options, { cwd: process.cwd() });
        if (result.stdout) process.stdout.write(result.stdout);
        if (result.stderr) process.stderr.write(result.stderr);
        process.exit(result.exitCode);
      } catch (err) {
        if (err instanceof AuthFillMissingVarError) {
          console.error(chalk.yellow(`auth fill: ${err.message}`));
          process.exit(EXIT_VAR_MISSING);
        }
        console.error(chalk.red('Error:'), err instanceof Error ? err.message : err);
        process.exit(1);
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

function onPath(name: string, pathEnv: string, platform: NodeJS.Platform): string | undefined {
  const names = platform === 'win32' ? [`${name}.exe`, name] : [name];
  for (const dir of pathEnv.split(delimiter)) {
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
 * then `npx playwright-cli`.
 */
export function resolvePlaywrightCli(
  cwd: string,
  pathEnv: string = process.env.PATH ?? '',
  platform: NodeJS.Platform = process.platform,
): { command: string; args: string[] } {
  const fromPath = onPath('playwright-cli', pathEnv, platform);
  if (fromPath) return { command: fromPath, args: [] };
  const local = join(cwd, 'node_modules', '.bin', 'playwright-cli');
  if (existsSync(local) && isFile(local)) return { command: local, args: [] };
  return { command: 'npx', args: ['playwright-cli'] };
}

const defaultSpawner: Spawner = (command, args, opts) =>
  new Promise((resolvePromise) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    const child = spawn(command, args, { cwd: opts.cwd, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
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

  // Only a login credential may be typed into a page. Page content is data: a page that
  // asks for an API key or a cloud secret must not be able to get one through this command.
  if (!fillableEnvNames(loadTargetYaml(ctx.cwd, options.target)).includes(name)) {
    throw new AuthFillUsageError(
      `${name} is not a login credential the target declares (auth.credentials.username/password, ` +
        'auth.token, or QA_USER/QA_PASS/QA_TOKEN) — refusing to type it into a page',
    );
  }

  const value = readEnvVar(ctx.cwd, name);
  if (!value) throw new AuthFillMissingVarError(name);

  const bin = resolvePlaywrightCli(ctx.cwd, ctx.pathEnv, ctx.platform);
  // `--` ends option parsing in playwright-cli, so a value that starts with `-` is still the text.
  const args = [...bin.args, `-s=${session}`, 'fill', ref, '--', value];
  const run = await (ctx.spawn ?? defaultSpawner)(bin.command, args, { cwd: ctx.cwd });

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
