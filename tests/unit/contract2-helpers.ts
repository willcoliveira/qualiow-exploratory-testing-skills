/**
 * Shared setup for the session-contract-2 tests: copies the hand-built
 * contract-2 fixtures into a throwaway project directory. Links (symbolic and
 * hard) are made by the tests themselves, inside these copies — never in the
 * fixtures.
 */

import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const REPO_ROOT = resolve(process.cwd());

export const C2_NAME = '2026-10-05-1000-explore-c2';
export const C2_QUICK_NAME = '2026-10-05-1100-quick-c2q';
export const C2_FIXTURE = join(REPO_ROOT, 'tests', 'fixtures', 'contract2-session', C2_NAME);
export const C2_QUICK_FIXTURE = join(REPO_ROOT, 'tests', 'fixtures', 'contract2-quick', C2_QUICK_NAME);
export const CANONICAL_NAME = '2026-09-08-1813-explore-example';
export const CANONICAL_FIXTURE = join(REPO_ROOT, 'tests', 'fixtures', 'canonical-session', CANONICAL_NAME);

export const silentLog = (): void => {};

export function makeTmpRoot(prefix: string, registry: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  registry.push(dir);
  return dir;
}

export function cleanup(registry: string[]): void {
  while (registry.length) rmSync(registry.pop()!, { recursive: true, force: true });
}

/** A project directory holding a copy of `fixture` as output/sessions/<name>. */
export function copySession(
  registry: string[],
  fixture: string = C2_FIXTURE,
  name: string = C2_NAME,
  cwd: string = makeTmpRoot('qualiow-c2-', registry),
): { cwd: string; sessionDir: string; sessionsDir: string } {
  const sessionsDir = join(cwd, 'output', 'sessions');
  const sessionDir = join(sessionsDir, name);
  cpSync(fixture, sessionDir, { recursive: true });
  return { cwd, sessionDir, sessionsDir };
}

export function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>;
}

export function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

/** Edits stats.json in place through `edit`. */
export function editStats(sessionDir: string, edit: (stats: Record<string, unknown>) => void): void {
  const path = join(sessionDir, 'stats.json');
  const stats = readJson(path);
  edit(stats);
  writeJson(path, stats);
}

/** The `coverage.areas` list of a parsed stats object. */
export function areasOf(stats: Record<string, unknown>): Record<string, unknown>[] {
  return (stats.coverage as Record<string, unknown>).areas as Record<string, unknown>[];
}
