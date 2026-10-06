/**
 * `qualiow session finalize` — the credential-value scan, the verdict cross-check
 * and `evidence-manifest.json`.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runSessionFinalize, runSessionLevel } from '../../src/cli/commands/session.js';
import { checkVerdicts } from '../../src/session/verdict-check.js';

const REPO_ROOT = resolve(process.cwd());
const VERIFIED_NAME = '2026-09-20-1500-explore-verified-example';
const VERIFIED_DIR = join(REPO_ROOT, 'tests', 'fixtures', 'verified-session', VERIFIED_NAME);
const C2_NAME = '2026-10-05-1000-explore-c2';
const C2_DIR = join(REPO_ROOT, 'tests', 'fixtures', 'contract2-session', C2_NAME);
const C2_QUICK_NAME = '2026-10-05-1100-quick-c2q';
const C2_QUICK_DIR = join(REPO_ROOT, 'tests', 'fixtures', 'contract2-quick', C2_QUICK_NAME);
const CANONICAL_NAME = '2026-09-08-1813-explore-example';
const CANONICAL_DIR = join(REPO_ROOT, 'tests', 'fixtures', 'canonical-session', CANONICAL_NAME);

const HEADER =
  '> CONFIDENTIAL: This report may contain internal URLs, security vulnerabilities,\n' +
  '> and application details. Do not share outside your organization without review.\n';

const silentLog = (): void => {};
const tmpDirs: string[] = [];

afterEach(() => {
  vi.unstubAllEnvs();
  while (tmpDirs.length) rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});

function copy(fixture: string, name: string): { cwd: string; sessionDir: string } {
  const cwd = mkdtempSync(join(tmpdir(), 'qualiow-finalize-judge-'));
  tmpDirs.push(cwd);
  const sessionDir = join(cwd, 'output', 'sessions', name);
  cpSync(fixture, sessionDir, { recursive: true });
  return { cwd, sessionDir };
}

const verified = () => copy(VERIFIED_DIR, VERIFIED_NAME);

function edit(path: string, from: string | RegExp, to: string): void {
  const before = readFileSync(path, 'utf-8');
  const after = before.replace(from, to);
  expect(after).not.toBe(before);
  writeFileSync(path, after);
}

const check = (cwd: string, name = VERIFIED_NAME) => runSessionFinalize(name, { check: true }, { cwd, log: silentLog });

// ─── credential values ──────────────────────────────────────────────

// Obvious fakes. A typed password has no shape the pattern rules know.
const FAKE_PASS = 'Fake-Pass 2026!';
const FAKE_SHOP_SECRET = 'not-a-real-shop-login-42';

describe('finalize — credential values', () => {
  it('refuses a session holding the QA_PASS value, naming the category only', async () => {
    vi.stubEnv('QA_PASS', FAKE_PASS);
    const { cwd, sessionDir } = verified();
    appendFileSync(join(sessionDir, 'bugs', 'BUG-101.md'), `\nTyped ${FAKE_PASS} into the password field.\n`);

    const result = await check(cwd);
    expect(result.ok).toBe(false);
    expect(result.violations).toEqual([
      `${join('bugs', 'BUG-101.md')} contains a secret: Credential value (run with --redact to fix)`,
    ]);
    expect(result.violations.join('\n')).not.toContain(FAKE_PASS);
    expect(result.violations.join('\n')).not.toContain('QA_PASS');
  });

  it('reads the env var the target declares, from qa/.env, and --redact removes an encoded copy', async () => {
    const { cwd, sessionDir } = copy(C2_DIR, C2_NAME);
    mkdirSync(join(cwd, 'data', 'targets'), { recursive: true });
    writeFileSync(
      join(cwd, 'data', 'targets', 'example-shop.yml'),
      'id: example-shop\nauth:\n  credentials:\n    username: QA_USER\n    password: SHOP_LOGIN_SECRET\n',
    );
    mkdirSync(join(cwd, 'qa'), { recursive: true });
    writeFileSync(join(cwd, 'qa', '.env'), `SHOP_LOGIN_SECRET=${FAKE_SHOP_SECRET}\n`);
    const evidence = join(sessionDir, 'evidence', 'A2-checkout-requests.txt');
    const encoded = Buffer.from(FAKE_SHOP_SECRET).toString('base64');
    appendFileSync(evidence, `POST /login body=${encoded}\n`);

    const refused = await runSessionFinalize(C2_NAME, { check: true }, { cwd, log: silentLog });
    expect(refused.violations).toEqual([
      `${join('evidence', 'A2-checkout-requests.txt')} contains a secret: Credential value (run with --redact to fix)`,
    ]);

    const fixed = await runSessionFinalize(C2_NAME, { redact: true }, { cwd, log: silentLog });
    expect(fixed.ok).toBe(true);
    expect(fixed.redactedFiles).toEqual([
      { file: join('evidence', 'A2-checkout-requests.txt'), categories: ['Credential value'] },
    ]);
    expect(readFileSync(evidence, 'utf-8')).not.toContain(encoded);
    expect(readFileSync(evidence, 'utf-8')).toContain('POST /login body=[REDACTED]');
  });

  it('a value that is not configured is not a finding', async () => {
    const { cwd, sessionDir } = verified();
    appendFileSync(join(sessionDir, 'bugs', 'BUG-101.md'), `\nTyped ${FAKE_PASS} into the field.\n`);
    vi.stubEnv('QA_PASS', 'some-other-fake-value');
    expect((await check(cwd)).ok).toBe(true);
  });
});

// ─── verdict cross-check ────────────────────────────────────────────

describe('finalize — verdict cross-check', () => {
  const OVERRULE_HINT =
    'ship it as Unverified (<reason>), move it to bugs/refuted/, or write Verified (judge overruled: <reason>)';

  it('passes every fixture that follows the protocol', async () => {
    for (const [fixture, name] of [
      [VERIFIED_DIR, VERIFIED_NAME],
      [C2_DIR, C2_NAME],
      [C2_QUICK_DIR, C2_QUICK_NAME],
      [CANONICAL_DIR, CANONICAL_NAME],
    ] as const) {
      const { sessionDir } = copy(fixture, name);
      expect(checkVerdicts(sessionDir)).toEqual([]);
    }
  });

  it('Verified on a REFUTED verdict is refused', async () => {
    const { cwd, sessionDir } = verified();
    edit(join(sessionDir, 'verification', 'VERDICT-101.md'), 'VERDICT: CONFIRMED', 'VERDICT: REFUTED');
    const result = await check(cwd);
    expect(result.violations).toEqual([
      `bugs/BUG-101.md says Verified, but verification/VERDICT-101.md is REFUTED — ${OVERRULE_HINT}`,
    ]);
  });

  it('Verified on an UNVERIFIED verdict is refused', async () => {
    const { cwd, sessionDir } = verified();
    edit(join(sessionDir, 'bugs', 'BUG-103.md'), /\*\*Verification:\*\* Unverified \(judge unavailable: timeout\)/, '**Verification:** Verified');
    const result = await check(cwd);
    expect(result.violations).toEqual([
      `bugs/BUG-103.md says Verified, but verification/VERDICT-103.md is UNVERIFIED — ${OVERRULE_HINT}`,
    ]);
  });

  it('judge overruled ships on any verdict — but the verdict must be on file', async () => {
    const { cwd, sessionDir } = verified();
    edit(join(sessionDir, 'verification', 'VERDICT-101.md'), 'VERDICT: CONFIRMED', 'VERDICT: REFUTED');
    edit(
      join(sessionDir, 'bugs', 'BUG-101.md'),
      '**Verification:** Verified',
      '**Verification:** Verified (judge overruled: its run used a stale cache)',
    );
    expect((await check(cwd)).ok).toBe(true);

    rmSync(join(sessionDir, 'verification', 'VERDICT-101.md'));
    expect((await check(cwd)).violations).toEqual([
      'bugs/BUG-101.md says Verified, but verification/VERDICT-101.md does not exist',
    ]);
  });

  it('a Verified bug with no verdict file is refused', async () => {
    const { cwd, sessionDir } = verified();
    rmSync(join(sessionDir, 'verification', 'VERDICT-102.md'));
    expect((await check(cwd)).violations).toEqual([
      'bugs/BUG-102.md says Verified, but verification/VERDICT-102.md does not exist',
    ]);
  });

  it('the Full verdict link is followed before the bug number', async () => {
    const { cwd, sessionDir } = verified();
    edit(join(sessionDir, 'bugs', 'BUG-101.md'), '../verification/VERDICT-101.md', '../verification/VERDICT-104.md');
    expect((await check(cwd)).violations).toEqual([
      `bugs/BUG-101.md says Verified, but verification/VERDICT-104.md is REFUTED — ${OVERRULE_HINT}`,
    ]);
  });

  it('a Verification line with no verification/ directory is refused; Unverified is not', async () => {
    const { cwd, sessionDir } = verified();
    rmSync(join(sessionDir, 'verification'), { recursive: true });
    expect((await check(cwd)).violations).toEqual([
      'bugs/BUG-101.md says Verified, but the session has no verification/ directory — no verdict backs it',
      'bugs/BUG-102.md says Verified, but the session has no verification/ directory — no verdict backs it',
      'bugs/refuted/BUG-104.md says Refuted, but the session has no verification/ directory — no verdict backs it',
    ]);
  });

  it('a refuted bug needs the verdict that refuted it', async () => {
    const { cwd, sessionDir } = verified();
    const refuted = join(sessionDir, 'bugs', 'refuted', 'BUG-104.md');
    edit(refuted, '**Verification:** Refuted', '**Verification:** Unreproducible');
    expect((await check(cwd)).violations).toEqual([
      'bugs/refuted/BUG-104.md says Unreproducible, but verification/VERDICT-104.md is REFUTED — it needs UNREPRODUCIBLE',
    ]);

    edit(refuted, '**Verification:** Unreproducible', '**Verification:** Refuted');
    edit(join(sessionDir, 'verification', 'VERDICT-104.md'), 'VERDICT: REFUTED', 'VERDICT: CONFIRMED');
    expect((await check(cwd)).violations).toEqual([
      'bugs/refuted/BUG-104.md says Refuted, but verification/VERDICT-104.md is CONFIRMED — it needs REFUTED',
    ]);
  });

  it('a refuted bug in bugs/, or a shipped one under bugs/refuted/, is refused', async () => {
    const { cwd, sessionDir } = verified();
    edit(join(sessionDir, 'bugs', 'BUG-102.md'), /\*\*Verification:\*\* Verified \(severity adjusted from High\)/, '**Verification:** Refuted');
    edit(join(sessionDir, 'bugs', 'refuted', 'BUG-104.md'), '**Verification:** Refuted', '**Verification:** Verified');
    expect((await check(cwd)).violations).toEqual([
      'bugs/BUG-102.md says Refuted — a candidate the judge did not uphold belongs under bugs/refuted/',
      'bugs/refuted/BUG-104.md says Verified but sits under bugs/refuted/ — a shipped bug belongs in bugs/',
    ]);
  });

  it('an Unverified bug is never cross-checked', async () => {
    const { cwd, sessionDir } = verified();
    writeFileSync(join(sessionDir, 'verification', 'VERDICT-103.md'), `${HEADER}\n\`\`\`\nVERDICT: REFUTED\n\`\`\`\n`);
    expect((await check(cwd)).ok).toBe(true);
  });

  it('every verdict file must parse, with a known METHOD and CONFIDENCE', async () => {
    const { cwd, sessionDir } = verified();
    const v = (n: string) => join(sessionDir, 'verification', `VERDICT-${n}.md`);
    writeFileSync(v('105'), `${HEADER}\nThe judge thinks this is probably fine.\n`);
    edit(v('101'), 'METHOD: live-repro', 'METHOD: vibes');
    edit(v('102'), 'CONFIDENCE: high', 'CONFIDENCE: certain');
    expect((await check(cwd)).violations).toEqual([
      'verification/VERDICT-101.md: METHOD is neither live-repro nor evidence-only',
      'verification/VERDICT-102.md: CONFIDENCE is not high, medium or low',
      'verification/VERDICT-105.md has no recognisable VERDICT line (CONFIRMED, CONFIRMED-ADJUSTED, REFUTED, UNREPRODUCIBLE or UNVERIFIED)',
    ]);
  });

  it('a METHOD with a reason after it is accepted', async () => {
    const { cwd, sessionDir } = verified();
    edit(join(sessionDir, 'verification', 'VERDICT-101.md'), 'METHOD: live-repro', 'METHOD: evidence-only — budget ran out');
    expect((await check(cwd)).ok).toBe(true);
  });

  it('a reasoning-first block with REPRO_COMMANDS passes', async () => {
    const { cwd, sessionDir } = verified();
    writeFileSync(
      join(sessionDir, 'verification', 'VERDICT-101.md'),
      `${HEADER}\n\`\`\`\nMETHOD: live-repro\nREPRO_RESULT: Reproduced 2/2.\nREASONING: Saw it twice.\n` +
        'VERDICT: CONFIRMED\nCONFIDENCE: high\nSEVERITY: agree with claimed High\n' +
        'REPRO_COMMANDS:\n  playwright-cli -s=<sid> open https://example.com/\n  playwright-cli -s=<sid> snapshot\n```\n',
    );
    expect((await check(cwd)).ok).toBe(true);
  });
});

// ─── evidence manifest ──────────────────────────────────────────────

const sha256 = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
const manifestOf = (sessionDir: string) => join(sessionDir, 'evidence-manifest.json');

describe('finalize — evidence-manifest.json', () => {
  it('lists every evidence file, sorted, text scanned and binary marked as not scanned', async () => {
    const { cwd, sessionDir } = copy(C2_DIR, C2_NAME);
    const result = await runSessionFinalize(C2_NAME, {}, { cwd, log: silentLog });
    expect(result.ok).toBe(true);
    expect(result.evidenceManifestWritten).toBe(true);

    const manifest = JSON.parse(readFileSync(manifestOf(sessionDir), 'utf-8'));
    const row = (path: string, scan: string) => ({
      path,
      size: readFileSync(join(sessionDir, path)).length,
      sha256: sha256(join(sessionDir, path)),
      scan,
    });
    expect(manifest).toEqual({
      generated_by: 'qualiow session finalize',
      files: [
        row('evidence/A2-checkout-requests.txt', 'text-clean'),
        row('screenshots/A1-login.png', 'binary-not-scanned'),
        row('screenshots/A2-checkout.png', 'binary-not-scanned'),
        row('screenshots/A3-search.png', 'binary-not-scanned'),
        row('screenshots/A4-account.png', 'binary-not-scanned'),
      ],
    });
  });

  it('is written only by a passing, non---check run', async () => {
    const { cwd, sessionDir } = verified();
    expect((await check(cwd)).ok).toBe(true);
    expect(existsSync(manifestOf(sessionDir))).toBe(false);

    edit(join(sessionDir, 'bugs', 'BUG-101.md'), /^> CONFIDENTIAL.*\n/, '');
    expect((await runSessionFinalize(VERIFIED_NAME, {}, { cwd, log: silentLog })).ok).toBe(false);
    expect(existsSync(manifestOf(sessionDir))).toBe(false);
  });

  it('is idempotent, and a finalized contract-2 session still passes --check and session level', async () => {
    const { cwd, sessionDir } = copy(C2_DIR, C2_NAME);
    expect((await runSessionFinalize(C2_NAME, {}, { cwd, log: silentLog })).ok).toBe(true);
    const first = readFileSync(manifestOf(sessionDir), 'utf-8');

    const again = await runSessionFinalize(C2_NAME, {}, { cwd, log: silentLog });
    expect(again.violations).toEqual([]);
    expect(readFileSync(manifestOf(sessionDir), 'utf-8')).toBe(first);

    expect((await runSessionFinalize(C2_NAME, { check: true }, { cwd, log: silentLog })).violations).toEqual([]);
    const level = await runSessionLevel(C2_NAME, {}, { cwd, log: silentLog });
    expect(level.violations).toEqual([]);
  });

  it('a contract-1 session with a manifest is not taken for a contract-2 one', async () => {
    const { cwd } = verified();
    expect((await runSessionFinalize(VERIFIED_NAME, {}, { cwd, log: silentLog })).ok).toBe(true);
    expect((await check(cwd)).violations).toEqual([]);
  });

  it('--check refuses a manifest the evidence no longer matches; finalize rewrites it', async () => {
    const { cwd, sessionDir } = copy(C2_DIR, C2_NAME);
    await runSessionFinalize(C2_NAME, {}, { cwd, log: silentLog });
    appendFileSync(join(sessionDir, 'evidence', 'A2-checkout-requests.txt'), 'GET /api/extra 200 5ms\n');

    const stale = await runSessionFinalize(C2_NAME, { check: true }, { cwd, log: silentLog });
    expect(stale.violations).toEqual([
      'evidence-manifest.json is stale or edited by hand — it does not match the evidence on disk; ' +
        `re-run \`qualiow session finalize ${C2_NAME}\``,
    ]);

    expect((await runSessionFinalize(C2_NAME, {}, { cwd, log: silentLog })).ok).toBe(true);
    expect((await runSessionFinalize(C2_NAME, { check: true }, { cwd, log: silentLog })).ok).toBe(true);
  });

  it('is not secret-scanned, but a hand-written one is refused by --check', async () => {
    const { cwd, sessionDir } = verified();
    // A 16-digit Luhn-valid run in a file name reads as a card number to the scan.
    writeFileSync(manifestOf(sessionDir), '{"files":[{"path":"screenshots/4111111111111111.png"}]}\n');
    const result = await check(cwd);
    expect(result.violations).toEqual([
      'evidence-manifest.json is stale or edited by hand — it does not match the evidence on disk; ' +
        `re-run \`qualiow session finalize ${VERIFIED_NAME}\``,
    ]);
    expect((await runSessionFinalize(VERIFIED_NAME, {}, { cwd, log: silentLog })).ok).toBe(true);
    const gitkeep = join(sessionDir, 'screenshots', '.gitkeep');
    expect(JSON.parse(readFileSync(manifestOf(sessionDir), 'utf-8')).files).toEqual([
      { path: 'screenshots/.gitkeep', size: readFileSync(gitkeep).length, sha256: sha256(gitkeep), scan: 'text-clean' },
    ]);
  });

  it('a manifest that is a symbolic link is refused, and nothing is written through it', async () => {
    const { cwd, sessionDir } = verified();
    const elsewhere = join(cwd, 'elsewhere.json');
    writeFileSync(elsewhere, '{}\n');
    symlinkSync(elsewhere, manifestOf(sessionDir));
    const result = await runSessionFinalize(VERIFIED_NAME, {}, { cwd, log: silentLog });
    expect(result.ok).toBe(false);
    expect(result.violations).toContain('evidence-manifest.json is not a regular file — remove it; finalize writes it');
    expect(readFileSync(elsewhere, 'utf-8')).toBe('{}\n');
    expect(existsSync(join(cwd, 'output', 'sessions', 'INDEX.md'))).toBe(false);
  });
});
