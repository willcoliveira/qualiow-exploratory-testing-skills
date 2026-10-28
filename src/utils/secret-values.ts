/**
 * Credential VALUES a session must never write, resolved from the env var NAMES
 * its target config declares.
 *
 * The pattern rules in `redact.ts` catch secret-shaped text (keys, JWTs,
 * `password=` assignments). A plain password such as `Summer2026!` typed into a
 * form has no shape, so it slips past them; `redact(text, { values })` replaces
 * the literal value and its common encodings instead. Values are returned to the
 * caller only — never logged, never part of an error message.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { envFilePaths, parseEnvFile, readEnvVar, resolveTargetPath } from './paths.js';

export interface SecretValue {
  /** The env var NAME the value came from — safe to print. */
  name: string;
  /** The value itself — never print it. */
  value: string;
}

/** Names the shipped configs and docs use for secrets, scanned whatever the target says. */
export const DEFAULT_SECRET_ENV_NAMES = ['QA_PASS', 'QA_TOKEN', 'QA_API_TOKEN'] as const;

/**
 * Shorter values are skipped: replacing every `1234` or `test` in a report would
 * destroy it, and a credential that short is not one the scan could protect anyway.
 */
export const MIN_SECRET_VALUE_LENGTH = 6;

const ENV_NAME = /^[A-Z][A-Z0-9_]*$/;

function pick(obj: unknown, ...keys: string[]): unknown {
  let cur = obj;
  for (const key of keys) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

/**
 * The session's target config as plain YAML data, or undefined when none resolves or it
 * does not parse. A `targetId` that is not a valid target id (the URL of an ad-hoc run, a
 * path) names no file under `data/targets/`; only `qa/target.yml` can still match it.
 */
export function loadTargetYaml(cwd: string, targetId: string | undefined): unknown {
  const projectTarget = resolve(cwd, 'qa', 'target.yml');
  let named: string | undefined;
  try {
    named = resolveTargetPath(cwd, targetId);
  } catch {
    named = undefined;
  }
  for (const path of [named, projectTarget]) {
    if (path === undefined || !existsSync(path)) continue;
    try {
      const data = parseYaml(readFileSync(path, 'utf-8')) as unknown;
      // qa/target.yml is only the right file when it is the session's target.
      if (path === projectTarget && targetId !== undefined && pick(data, 'id') !== targetId) continue;
      return data;
    } catch {
      continue;
    }
  }
  return undefined;
}

/** Login names `qualiow auth fill` accepts whatever the target says — the ones the shipped configs use. */
export const LOGIN_ENV_DEFAULTS = ['QA_USER', 'QA_PASS', 'QA_TOKEN'] as const;

/** Names that are never a login credential, whatever a target declares: cloud, API and triage keys. */
const NEVER_FILLABLE = /^AWS_|_API_KEY$|^TYPESAFE_/;

/**
 * The env var NAMES `qualiow auth fill` may type into a page: the defaults plus the
 * target's own login credentials (`auth.credentials.username/password`, `auth.token`).
 * API keys and triage keys are never on it — a page that asks for one gets nothing:
 * not the target's `api.token_env`, not a triage provider's key, and no name that looks
 * like a cloud, API or triage key (`AWS_*`, `*_API_KEY`, `TYPESAFE_*`), even when the
 * target declares it as a login credential.
 */
export function fillableEnvNames(target: unknown): string[] {
  const names = new Set<string>(LOGIN_ENV_DEFAULTS);
  for (const name of [
    pick(target, 'auth', 'credentials', 'username'),
    pick(target, 'auth', 'credentials', 'password'),
    pick(target, 'auth', 'token'),
  ]) {
    if (typeof name === 'string' && ENV_NAME.test(name)) names.add(name);
  }
  const keys = new Set<unknown>([
    pick(target, 'api', 'token_env'),
    pick(target, 'verification', 'triage_api_key_env'),
    pick(target, 'verification', 'laya', 'api_key_env'),
  ]);
  return [...names].filter((name) => !keys.has(name) && !NEVER_FILLABLE.test(name));
}

/** The secret env var NAMES a target config declares (password, token, API keys). */
export function secretEnvNames(target: unknown): string[] {
  const names = new Set<string>(DEFAULT_SECRET_ENV_NAMES);
  const declared = [
    pick(target, 'auth', 'credentials', 'password'),
    pick(target, 'auth', 'token'),
    pick(target, 'api', 'token_env'),
    pick(target, 'verification', 'triage_api_key_env'),
    pick(target, 'verification', 'laya', 'api_key_env'),
  ];
  for (const name of declared) {
    if (typeof name === 'string' && ENV_NAME.test(name)) names.add(name);
  }
  const triage = pick(target, 'verification', 'mode') === 'triage-shadow';
  if (triage && pick(target, 'verification', 'triage_api_key_env') === undefined) {
    names.add('TYPESAFE_API_KEY');
  }
  return [...names];
}

/**
 * The name rule the write guard applies to `.env` (`hooks/scripts/write-guard.mjs`): a
 * variable whose NAME ends in PASS, PASSWORD, TOKEN, SECRET, API_KEY or _KEY.
 */
export const SECRET_ENV_NAME = /(PASS|PASSWORD|TOKEN|SECRET|API_KEY|_KEY)$/;
const MAX_ENV_FILE_BYTES = 256 * 1024;

/** The NAMES in `qa/.env` and `.env` that the write guard's name rule calls secret. */
export function envFileSecretNames(cwd: string): string[] {
  const names = new Set<string>();
  for (const file of envFilePaths(cwd)) {
    let parsed: NodeJS.Dict<string>;
    try {
      if (statSync(file).size > MAX_ENV_FILE_BYTES) continue;
      parsed = parseEnvFile(file);
    } catch {
      continue;
    }
    for (const name of Object.keys(parsed)) if (SECRET_ENV_NAME.test(name)) names.add(name);
  }
  return [...names];
}

export interface SecretValueScan {
  values: SecretValue[];
  /**
   * False when no target config resolved for the session (the URL of an ad-hoc run, an
   * id with no file behind it). The scan then fails closed: the values are those of
   * every secret-named variable in `qa/.env` and `.env` as well as the default names.
   */
  targetResolved: boolean;
}

/**
 * Resolve the secret values for a session's target: the process environment, then
 * `qa/.env`, then `.env` (the order `paths.md` defines). Unset and too-short values
 * are dropped. A target that does not resolve yields the default names plus every
 * `.env` variable under the write guard's name rule — never fewer names than that.
 */
export function resolveSecretValues(cwd: string, targetId: string | undefined): SecretValueScan {
  const target = loadTargetYaml(cwd, targetId);
  const names = new Set(secretEnvNames(target));
  if (target === undefined) for (const name of envFileSecretNames(cwd)) names.add(name);
  const values: SecretValue[] = [];
  const seen = new Set<string>();
  for (const name of names) {
    const value = readEnvVar(cwd, name);
    if (!value || value.length < MIN_SECRET_VALUE_LENGTH || seen.has(value)) continue;
    seen.add(value);
    values.push({ name, value });
  }
  return { values, targetResolved: target !== undefined };
}

/** `resolveSecretValues(cwd, targetId).values`. */
export function collectSecretValues(cwd: string, targetId: string | undefined): SecretValue[] {
  return resolveSecretValues(cwd, targetId).values;
}

/** The NAMES of the values that occur in `text` in any form `secretValueVariants` knows — never a value. */
export function findSecretValueNames(text: string, values: ReadonlyArray<SecretValue>): string[] {
  return values.filter(({ value }) => secretValueVariants(value).some((v) => text.includes(v))).map((v) => v.name);
}

/**
 * The forms a value takes on disk: literal, URL-encoded (encodeURIComponent and both form
 * encodings), JSON-escaped, and base64 (standard and URL-safe, padded or not).
 * Longest first, so a longer form is replaced before a shorter one inside it.
 */
export function secretValueVariants(value: string): string[] {
  const b64 = Buffer.from(value, 'utf-8').toString('base64');
  const b64url = Buffer.from(value, 'utf-8').toString('base64url');
  const variants = new Set<string>([
    value,
    encodeURIComponent(value),
    encodeURIComponent(value).replace(/%20/g, '+'),
    new URLSearchParams({ v: value }).toString().slice(2),
    JSON.stringify(value).slice(1, -1),
    b64,
    b64.replace(/=+$/, ''),
    b64url,
  ]);
  return [...variants]
    .filter((v) => v.length >= MIN_SECRET_VALUE_LENGTH)
    .sort((a, b) => b.length - a.length);
}
