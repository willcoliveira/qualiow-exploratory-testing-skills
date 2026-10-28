/**
 * `qualiow session finalize` — where the credential-value scan looks, and which
 * values it looks for when the session's target does not resolve.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { appendFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

});

describe('finalize — snapshots/ is scanned for credential values', () => {
  // An aria snapshot taken while the password field is filled prints the typed value.
  const FAKE_PASS = 'Fake-Snapshot-Pass-2026';
  const AWS_SHAPED = ['AKIA', 'IOSFODNN7', 'EXAMPLE'].join('');
  const snapshotYml = `- textbox "Password" [active] [ref=e6]: ${FAKE_PASS}\n- text: key ${AWS_SHAPED}\n`;

  it('refuses a snapshot holding the QA_PASS value, naming the file and category only', async () => {
    vi.stubEnv('QA_PASS', FAKE_PASS);
    const { cwd, sessionDir } = copyC2();
    mkdirSync(join(sessionDir, 'snapshots'), { recursive: true });
    writeFileSync(join(sessionDir, 'snapshots', 'login.yml'), snapshotYml);

    const { result } = await checkWithLog(cwd);
    expect(result.ok).toBe(false);
    expect(result.violations).toEqual([
      `${join('snapshots', 'login.yml')} contains a secret: Credential value (run with --redact to fix)`,
    ]);
    expect(result.violations.join('\n')).not.toContain(FAKE_PASS);
  });

  it('--redact removes the value from the snapshot and leaves its page text alone', async () => {
    vi.stubEnv('QA_PASS', FAKE_PASS);
    const { cwd, sessionDir } = copyC2();
    mkdirSync(join(sessionDir, 'snapshots'), { recursive: true });
    const file = join(sessionDir, 'snapshots', 'login.yml');
    writeFileSync(file, snapshotYml);

    const fixed = await runSessionFinalize(C2_NAME, { redact: true }, { cwd, log: () => {} });
    expect(fixed.ok).toBe(true);
    expect(fixed.redactedFiles).toEqual([{ file: join('snapshots', 'login.yml'), categories: ['Credential value'] }]);
    const after = readFileSync(file, 'utf-8');
    expect(after).not.toContain(FAKE_PASS);
    expect(after).toContain('[ref=e6]: [REDACTED]');
    // The pattern rules still do not apply under snapshots/.
    expect(after).toContain(AWS_SHAPED);
  });

  it('a snapshot with no credential value in it passes, page text and all', async () => {
    vi.stubEnv('QA_PASS', FAKE_PASS);
    const { cwd, sessionDir } = copyC2();
    mkdirSync(join(sessionDir, 'snapshots'), { recursive: true });
    writeFileSync(join(sessionDir, 'snapshots', 'home.yml'), `- text: key ${AWS_SHAPED}\n`);
    expect((await checkWithLog(cwd)).result.ok).toBe(true);
  });
});

describe('finalize — a resolved target', () => {
  it('keeps to the names it declares, and prints no warning', async () => {
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
