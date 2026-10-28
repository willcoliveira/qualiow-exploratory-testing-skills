/**
 * `qualiow session finalize` — where the credential-value scan looks, and which
 * values it looks for when the session's target does not resolve.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { appendFileSync, cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runSessionFinalize } from '../../src/cli/commands/session.js';
import { editStats } from './contract2-helpers.js';

const REPO_ROOT = resolve(process.cwd());
const C2_NAME = '2026-10-05-1000-explore-c2';
const C2_DIR = join(REPO_ROOT, 'tests', 'fixtures', 'contract2-session', C2_NAME);

// Obvious fakes, under names no real environment sets.
const SHOP_NAME = 'QUALIOW_TEST_SHOP_PASSWORD';
const SHOP_VALUE = 'not-a-real-shop-pass-77';

const tmpDirs: string[] = [];

afterEach(() => {
  vi.unstubAllEnvs();
  while (tmpDirs.length) rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});

function copyC2(): { cwd: string; sessionDir: string } {
  const cwd = mkdtempSync(join(tmpdir(), 'qualiow-finalize-cred-'));
  tmpDirs.push(cwd);
  const sessionDir = join(cwd, 'output', 'sessions', C2_NAME);
  cpSync(C2_DIR, sessionDir, { recursive: true });
  return { cwd, sessionDir };
}

function writeEnv(cwd: string, body: string): void {
  mkdirSync(join(cwd, 'qa'), { recursive: true });
  writeFileSync(join(cwd, 'qa', '.env'), body);
}

async function checkWithLog(cwd: string): Promise<{ result: Awaited<ReturnType<typeof runSessionFinalize>>; lines: string[] }> {
  const lines: string[] = [];
  const result = await runSessionFinalize(C2_NAME, { check: true }, { cwd, log: (l) => lines.push(l) });
  return { result, lines };
}

describe('finalize — a target that does not resolve fails closed', () => {
  it.each([
    ['the URL of an ad-hoc run', 'https://shop.example.com/?ref=qa&token=abc123'],
    ['an id with no config behind it', 'no-such-target'],
  ])('stats.target is %s: every secret-named .env variable is scanned, with a warning', async (_label, target) => {
    const { cwd, sessionDir } = copyC2();
    editStats(sessionDir, (st) => void (st.target = target));
    writeEnv(cwd, `${SHOP_NAME}=${SHOP_VALUE}\nQUALIOW_TEST_PLAIN=${SHOP_VALUE}-plain\n`);
    appendFileSync(join(sessionDir, 'phase-3-discovery.md'), `\nLogged in with ${encodeURIComponent(SHOP_VALUE)}.\n`);

    const { result, lines } = await checkWithLog(cwd);
    expect(result.ok).toBe(false);
    expect(result.violations).toEqual([
      'phase-3-discovery.md contains a secret: Credential value (run with --redact to fix)',
    ]);
    const all = [...result.violations, ...lines].join('\n');
    expect(all).not.toContain(SHOP_VALUE);
    expect(all).not.toContain('token=abc123');
    expect(lines.some((l) => /does not resolve to a target config/.test(l))).toBe(true);
  });

  it('a variable outside the name rule is not scanned for (the rule is the write guard’s)', async () => {
    const { cwd, sessionDir } = copyC2();
    editStats(sessionDir, (st) => void (st.target = 'no-such-target'));
    writeEnv(cwd, `QUALIOW_TEST_PLAIN=${SHOP_VALUE}\n`);
    appendFileSync(join(sessionDir, 'phase-3-discovery.md'), `\nSaw ${SHOP_VALUE} on the page.\n`);
    expect((await checkWithLog(cwd)).result.ok).toBe(true);
  });

  it('a target that resolves keeps to the names it declares, and prints no warning', async () => {
    const { cwd, sessionDir } = copyC2();
    mkdirSync(join(cwd, 'data', 'targets'), { recursive: true });
    writeFileSync(join(cwd, 'data', 'targets', 'example-shop.yml'), 'id: example-shop\nauth:\n  strategy: none\n');
    writeEnv(cwd, `${SHOP_NAME}=${SHOP_VALUE}\n`);
    appendFileSync(join(sessionDir, 'phase-3-discovery.md'), `\nSaw ${SHOP_VALUE} on the page.\n`);
    const { result, lines } = await checkWithLog(cwd);
    expect(result.ok).toBe(true);
    expect(lines.some((l) => /does not resolve/.test(l))).toBe(false);
  });
});
