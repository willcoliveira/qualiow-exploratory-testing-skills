import { describe, it, expect, afterEach } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  symlinkSync,
  truncateSync,
  openSync,
  writeSync,
  closeSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { runSessionFinalize } from '../../src/cli/commands/session.js';
import { redact } from '../../src/utils/redact.js';
import { INDEX_MD_HEADER } from '../../src/utils/index-files.js';

const REPO_ROOT = resolve(process.cwd());
const CANONICAL_SESSION_DIR = join(
  REPO_ROOT,
  'tests',
  'fixtures',
  'canonical-session',
  '2026-09-08-1813-explore-example',
);
const SESSION_NAME = '2026-09-08-1813-explore-example';

const tmpDirs: string[] = [];

function makeTmpCwd(): string {
  const dir = mkdtempSync(join(tmpdir(), 'qualiow-finalize-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tmpDirs.length) {
    rmSync(tmpDirs.pop()!, { recursive: true, force: true });
  }
});

const silentLog = () => {};

function makeTmpSessionCwd(): { cwd: string; sessionDir: string } {
  const cwd = makeTmpCwd();
  const sessionDir = join(cwd, 'output', 'sessions', SESSION_NAME);
  cpSync(CANONICAL_SESSION_DIR, sessionDir, { recursive: true });
  return { cwd, sessionDir };
}

const indexPathOf = (cwd: string) => join(cwd, 'output', 'sessions', 'INDEX.md');
const allBugsPathOf = (cwd: string) => join(cwd, 'output', 'bugs', 'all-bugs.md');
const metricsPathOf = (cwd: string) => join(cwd, 'output', 'metrics.jsonl');

describe('runSessionFinalize — --check on the untouched fixture', () => {
  it('fails with a violation naming the secret in BUG-002.md', async () => {
    const { cwd } = makeTmpSessionCwd();
    const result = await runSessionFinalize(
      'latest',
      { check: true },
      { cwd, log: silentLog },
    );
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.includes('BUG-002.md'))).toBe(true);
    // --check must write nothing.
    expect(existsSync(indexPathOf(cwd))).toBe(false);
    expect(existsSync(allBugsPathOf(cwd))).toBe(false);
  });
});

describe('runSessionFinalize — --redact then finalize', () => {
  it('redacts the secret, appends 1 INDEX row, 2 bug rows, 1 metrics line', async () => {
    const { cwd, sessionDir } = makeTmpSessionCwd();

    const result = await runSessionFinalize(
      'latest',
      { redact: true },
      { cwd, log: silentLog },
    );

    expect(result.ok).toBe(true);
    expect(result.redactedFiles?.some((r) => r.file.includes('BUG-002.md'))).toBe(true);

    // The redacted file on disk no longer contains the raw secret.
    const bug002 = readFileSync(join(sessionDir, 'bugs', 'BUG-002.md'), 'utf-8');
    expect(bug002).not.toContain('eyJhbGciOiJIUzI1NiJ9');
    expect(bug002).not.toContain('qa.user@corp-internal.test');

    // INDEX.md — exactly 1 data row, created with the canonical header.
    const indexContent = readFileSync(indexPathOf(cwd), 'utf-8');
    expect(indexContent.startsWith(INDEX_MD_HEADER)).toBe(true);
    const indexDataLines = indexContent
      .split('\n')
      .filter((l) => l.trim().startsWith('|') && l.includes(`${SESSION_NAME}/`));
    expect(indexDataLines).toHaveLength(1);

    // all-bugs.md — one row per fixture bug (BUG-001, BUG-002).
    const allBugsContent = readFileSync(allBugsPathOf(cwd), 'utf-8');
    expect(allBugsContent).toContain(`| BUG-001 | ${SESSION_NAME} |`);
    expect(allBugsContent).toContain(`| BUG-002 | ${SESSION_NAME} |`);

    // metrics.jsonl — exactly 1 line.
    const metricsLines = readFileSync(metricsPathOf(cwd), 'utf-8').trim().split('\n');
    expect(metricsLines).toHaveLength(1);
    expect(JSON.parse(metricsLines[0]).session_id).toBe(SESSION_NAME);
  });
});

describe('runSessionFinalize — idempotency', () => {
  it('running finalize twice leaves both index files byte-identical and metrics still 1 line', async () => {
    const { cwd } = makeTmpSessionCwd();

    await runSessionFinalize('latest', { redact: true }, { cwd, log: silentLog });

    const firstResult = await runSessionFinalize('latest', {}, { cwd, log: silentLog });
    expect(firstResult.ok).toBe(true);
    const indexAfterFirst = readFileSync(indexPathOf(cwd), 'utf-8');
    const allBugsAfterFirst = readFileSync(allBugsPathOf(cwd), 'utf-8');

    const secondResult = await runSessionFinalize('latest', {}, { cwd, log: silentLog });
    expect(secondResult.ok).toBe(true);
    const indexAfterSecond = readFileSync(indexPathOf(cwd), 'utf-8');
    const allBugsAfterSecond = readFileSync(allBugsPathOf(cwd), 'utf-8');

    expect(indexAfterSecond).toBe(indexAfterFirst);
    expect(allBugsAfterSecond).toBe(allBugsAfterFirst);

    const metricsLines = readFileSync(metricsPathOf(cwd), 'utf-8').trim().split('\n');
    expect(metricsLines).toHaveLength(1);
  });
});

describe('runSessionFinalize — missing confidentiality header', () => {
  it('stripping the header from a bug report is a violation', async () => {
    const { cwd, sessionDir } = makeTmpSessionCwd();

    // Clear the pre-existing secret via redact() directly so this test isolates the
    // header check; the file is not run through the CLI yet.
    const bug002Path = join(sessionDir, 'bugs', 'BUG-002.md');
    writeFileSync(bug002Path, redact(readFileSync(bug002Path, 'utf-8')).text);

    // Strip the two-line confidentiality header from BUG-001.md.
    const bug001Path = join(sessionDir, 'bugs', 'BUG-001.md');
    const bug001Lines = readFileSync(bug001Path, 'utf-8').split('\n');
    writeFileSync(bug001Path, bug001Lines.slice(3).join('\n'));

    const result = await runSessionFinalize('latest', { check: true }, { cwd, log: silentLog });
    expect(result.ok).toBe(false);
    expect(
      result.violations.some((v) => v.includes('BUG-001.md') && v.includes('confidentiality')),
    ).toBe(true);
  });
});

describe('runSessionFinalize — unknown stats.json key', () => {
  it('an extra top-level key in stats.json is a violation', async () => {
    const { cwd, sessionDir } = makeTmpSessionCwd();

    const statsPath = join(sessionDir, 'stats.json');
    const stats = JSON.parse(readFileSync(statsPath, 'utf-8'));
    stats.unexpected_field = 'nope';
    writeFileSync(statsPath, JSON.stringify(stats, null, 2));

    // Fix the pre-existing secret so only the stats.json violation is under test.
    const bug002Path = join(sessionDir, 'bugs', 'BUG-002.md');
    writeFileSync(bug002Path, redact(readFileSync(bug002Path, 'utf-8')).text);

    const result = await runSessionFinalize('latest', { check: true }, { cwd, log: silentLog });
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.includes('stats.json'))).toBe(true);
  });
});

describe('runSessionFinalize — missing INDEX.md', () => {
  it('creates INDEX.md with the canonical header when it does not exist yet', async () => {
    const { cwd } = makeTmpSessionCwd();
    expect(existsSync(indexPathOf(cwd))).toBe(false);

    const result = await runSessionFinalize('latest', { redact: true }, { cwd, log: silentLog });
    expect(result.ok).toBe(true);
    expect(existsSync(indexPathOf(cwd))).toBe(true);
    expect(readFileSync(indexPathOf(cwd), 'utf-8').startsWith(INDEX_MD_HEADER)).toBe(true);
  });
});

describe('runSessionFinalize — defaults kind from the directory name', () => {
  it('fills the INDEX row Kind column from the session directory when stats.json omits it', async () => {
    const { cwd, sessionDir } = makeTmpSessionCwd();

    const statsPath = join(sessionDir, 'stats.json');
    const stats = JSON.parse(readFileSync(statsPath, 'utf-8'));
    delete stats.kind;
    writeFileSync(statsPath, JSON.stringify(stats, null, 2));

    const result = await runSessionFinalize('latest', { redact: true }, { cwd, log: silentLog });
    expect(result.ok).toBe(true);

    const indexContent = readFileSync(indexPathOf(cwd), 'utf-8');
    const row = indexContent.split('\n').find((l) => l.includes(`${SESSION_NAME}/`));
    expect(row).toBeDefined();
    // Columns: | Date | Kind | Target | Bugs | Duration | Status | Report |
    const kindCell = row!.split('|').map((c) => c.trim())[2];
    expect(kindCell).toBe('explore');
  });
});

describe('runSessionFinalize — missing session', () => {
  it('throws when output/sessions does not exist', async () => {
    const cwd = makeTmpCwd();
    await expect(
      runSessionFinalize('latest', {}, { cwd, log: silentLog }),
    ).rejects.toThrow(/output\/sessions/);
  });
});

// ── Verified session (adversarial bug judge) ───────────────────────────────

const VERIFIED_SESSION_NAME = '2026-09-20-1500-explore-verified-example';
const VERIFIED_SESSION_DIR = join(
  REPO_ROOT,
  'tests',
  'fixtures',
  'verified-session',
  VERIFIED_SESSION_NAME,
);

function makeTmpVerifiedSessionCwd(): { cwd: string; sessionDir: string } {
  const cwd = makeTmpCwd();
  const sessionDir = join(cwd, 'output', 'sessions', VERIFIED_SESSION_NAME);
  cpSync(VERIFIED_SESSION_DIR, sessionDir, { recursive: true });
  return { cwd, sessionDir };
}

describe('runSessionFinalize — verified session with verification/ and bugs/refuted/', () => {
  it('--check passes: every verification artefact carries the header and no secret', async () => {
    const { cwd } = makeTmpVerifiedSessionCwd();
    const result = await runSessionFinalize('latest', { check: true }, { cwd, log: silentLog });
    expect(result.violations).toEqual([]);
    expect(result.ok).toBe(true);
    expect(existsSync(indexPathOf(cwd))).toBe(false);
  });

  it('finalize counts shipped bugs only: Bugs cell 3, no row for the refuted BUG-104', async () => {
    const { cwd } = makeTmpVerifiedSessionCwd();
    const result = await runSessionFinalize('latest', {}, { cwd, log: silentLog });
    expect(result.ok).toBe(true);

    const indexContent = readFileSync(indexPathOf(cwd), 'utf-8');
    const row = indexContent.split('\n').find((l) => l.includes(`${VERIFIED_SESSION_NAME}/`));
    expect(row).toBeDefined();
    // Columns: | Date | Kind | Target | Bugs | Duration | Status | Report |
    const cells = row!.split('|').map((c) => c.trim());
    expect(cells[2]).toBe('explore');
    expect(cells[4]).toBe('3');

    const allBugsContent = readFileSync(allBugsPathOf(cwd), 'utf-8');
    expect(allBugsContent).toContain(`| BUG-101 | ${VERIFIED_SESSION_NAME} |`);
    expect(allBugsContent).toContain(`| BUG-102 | ${VERIFIED_SESSION_NAME} |`);
    expect(allBugsContent).toContain(`| BUG-103 | ${VERIFIED_SESSION_NAME} |`);
    expect(allBugsContent).not.toContain('BUG-104');

    const metricsLines = readFileSync(metricsPathOf(cwd), 'utf-8').trim().split('\n');
    expect(metricsLines).toHaveLength(1);
    expect(JSON.parse(metricsLines[0]).bugs_found).toBe(3);
  });

  it('a verification artefact without the header is a violation', async () => {
    const { cwd, sessionDir } = makeTmpVerifiedSessionCwd();
    const verdictPath = join(sessionDir, 'verification', 'VERDICT-101.md');
    writeFileSync(verdictPath, readFileSync(verdictPath, 'utf-8').split('\n').slice(3).join('\n'));
    const result = await runSessionFinalize('latest', { check: true }, { cwd, log: silentLog });
    expect(result.ok).toBe(false);
    expect(
      result.violations.some((v) => v.includes('VERDICT-101.md') && v.includes('confidentiality')),
    ).toBe(true);
  });
});

// ─── scan scope ─────────────────────────────────────────────────────
//
// Every text artefact is scanned whatever its extension or folder; only the
// session's own top-level snapshots/ is exempt, and a symlink cannot carry
// content in from outside or hide it from the scan.

// Assembled at runtime so no literal secret sits in the test source.
const AWS_KEY = ['AKIA', 'IOSFODNN7', 'EXAMPLE'].join('');
const JWT = ['eyJhbGciOiJIUzI1NiJ9', 'eyJzdWIiOiIxMjM0NTY3ODkwIn0', 'abcdefghijklmnop'].join('.');
const CARD = ['4111', '1111', '1111', '1111'].join('');

function makeCleanSessionCwd(): { cwd: string; sessionDir: string } {
  const { cwd, sessionDir } = makeTmpSessionCwd();
  const bug002Path = join(sessionDir, 'bugs', 'BUG-002.md');
  writeFileSync(bug002Path, redact(readFileSync(bug002Path, 'utf-8')).text);
  return { cwd, sessionDir };
}

describe('runSessionFinalize — scans every text artefact', () => {
  it.each([
    ['evidence/probe-output.txt', `aws_access_key_id = ${AWS_KEY}\n`],
    ['evidence/session.har', JSON.stringify({ headers: [{ name: 'Authorization', value: `Bearer ${JWT}` }] })],
    ['evidence/export.csv', `email,card\nqa.user@corp-internal.test,${CARD}\n`],
    ['evidence/page.html', `<p>token ${JWT}</p>`],
    ['evidence/noext', `key ${AWS_KEY}`],
    ['notes/snapshots/aside.md', `> CONFIDENTIAL: x\n> y\n\nkey ${AWS_KEY}\n`],
  ])('refuses %s carrying a secret, naming the file and category only', async (rel, content) => {
    const { cwd, sessionDir } = makeCleanSessionCwd();
    mkdirSync(dirname(join(sessionDir, rel)), { recursive: true });
    writeFileSync(join(sessionDir, rel), content);

    const result = await runSessionFinalize('latest', { check: true }, { cwd, log: silentLog });
    expect(result.ok).toBe(false);
    const hits = result.violations.filter((v) => v.startsWith(join(...rel.split('/'))));
    expect(hits.some((v) => /contains a secret/.test(v))).toBe(true);
    expect(result.violations.join('\n')).not.toContain(AWS_KEY);
    expect(result.violations.join('\n')).not.toContain(JWT);
    expect(result.violations.join('\n')).not.toContain(CARD);
  });

  it('still skips the top-level snapshots/ directory', async () => {
    const { cwd, sessionDir } = makeCleanSessionCwd();
    mkdirSync(join(sessionDir, 'snapshots'), { recursive: true });
    writeFileSync(join(sessionDir, 'snapshots', 'page.yml'), `- text: ${AWS_KEY}\n`);

    const result = await runSessionFinalize('latest', { check: true }, { cwd, log: silentLog });
    expect(result.violations).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('skips binary files (a NUL byte in the first 8 KB)', async () => {
    const { cwd, sessionDir } = makeCleanSessionCwd();
    mkdirSync(join(sessionDir, 'evidence'), { recursive: true });
    writeFileSync(
      join(sessionDir, 'evidence', 'shot.png'),
      Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00]), Buffer.from(AWS_KEY)]),
    );

    const result = await runSessionFinalize('latest', { check: true }, { cwd, log: silentLog });
    expect(result.ok).toBe(true);
  });

  it('scans a UTF-16 file instead of taking its NULs for binary', async () => {
    const { cwd, sessionDir } = makeCleanSessionCwd();
    mkdirSync(join(sessionDir, 'evidence'), { recursive: true });
    const text = `key ${AWS_KEY}\n`;
    writeFileSync(join(sessionDir, 'evidence', 'bom-le.txt'), Buffer.from(`\uFEFF${text}`, 'utf16le'));
    writeFileSync(join(sessionDir, 'evidence', 'plain-le.txt'), Buffer.from(text, 'utf16le'));
    writeFileSync(join(sessionDir, 'evidence', 'bom-be.txt'), Buffer.from(`\uFEFF${text}`, 'utf16le').swap16());

    const result = await runSessionFinalize('latest', { check: true }, { cwd, log: silentLog });
    expect(result.ok).toBe(false);
    for (const name of ['bom-le.txt', 'plain-le.txt', 'bom-be.txt']) {
      expect(result.violations.some((v) => v.includes(name) && v.includes('secret'))).toBe(true);
    }
  });

  it('--redact rewrites a UTF-16 file in its own encoding', async () => {
    const { cwd, sessionDir } = makeCleanSessionCwd();
    mkdirSync(join(sessionDir, 'evidence'), { recursive: true });
    const file = join(sessionDir, 'evidence', 'probe.txt');
    writeFileSync(file, Buffer.from(`\uFEFFaws_access_key_id = ${AWS_KEY}\n`, 'utf16le'));

    await runSessionFinalize('latest', { redact: true, check: true }, { cwd, log: silentLog });
    const back = readFileSync(file);
    expect([back[0], back[1]]).toEqual([0xff, 0xfe]);
    const decoded = back.toString('utf16le');
    expect(decoded).toContain('_REDACTED]');
    expect(decoded).not.toContain(AWS_KEY);
  });

  it('scans a text file whose name claims it is binary', async () => {
    const { cwd, sessionDir } = makeCleanSessionCwd();
    mkdirSync(join(sessionDir, 'evidence'), { recursive: true });
    writeFileSync(join(sessionDir, 'evidence', 'shot.png'), `key ${AWS_KEY}`);

    const result = await runSessionFinalize('latest', { check: true }, { cwd, log: silentLog });
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.includes('shot.png') && v.includes('secret'))).toBe(true);
  });

  it('--redact rewrites a .txt file in place', async () => {
    const { cwd, sessionDir } = makeCleanSessionCwd();
    mkdirSync(join(sessionDir, 'evidence'), { recursive: true });
    const probe = join(sessionDir, 'evidence', 'probe-output.txt');
    writeFileSync(probe, `aws_access_key_id = ${AWS_KEY}\n`);

    const result = await runSessionFinalize('latest', { redact: true }, { cwd, log: silentLog });
    expect(result.ok).toBe(true);
    expect(readFileSync(probe, 'utf-8')).not.toContain(AWS_KEY);
  });
});

describe('runSessionFinalize — symbolic links', () => {
  it('refuses a link pointing outside the session and never reads its target', async () => {
    const { cwd, sessionDir } = makeCleanSessionCwd();
    const outside = join(cwd, 'outside.log');
    writeFileSync(outside, `Authorization: Bearer ${JWT}\n`);
    mkdirSync(join(sessionDir, 'evidence'), { recursive: true });
    symlinkSync(outside, join(sessionDir, 'evidence', 'linked.log'));

    const result = await runSessionFinalize('latest', { redact: true }, { cwd, log: silentLog });
    expect(result.ok).toBe(false);
    expect(
      result.violations.some((v) => v.includes(join('evidence', 'linked.log')) && v.includes('outside the session')),
    ).toBe(true);
    // --redact must not have written through the link.
    expect(readFileSync(outside, 'utf-8')).toContain(JWT);
  });

  it('refuses a dangling link', async () => {
    const { cwd, sessionDir } = makeCleanSessionCwd();
    symlinkSync(join(sessionDir, 'nope.txt'), join(sessionDir, 'dangling.txt'));
    const result = await runSessionFinalize('latest', { check: true }, { cwd, log: silentLog });
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.includes('dangling.txt') && v.includes('missing target'))).toBe(true);
  });

  it('scans the target of a link that stays inside the session', async () => {
    const { cwd, sessionDir } = makeCleanSessionCwd();
    // The real file sits under the exempt snapshots/; the link outside it is scanned.
    mkdirSync(join(sessionDir, 'snapshots'), { recursive: true });
    writeFileSync(join(sessionDir, 'snapshots', 'raw.txt'), `key ${AWS_KEY}\n`);
    symlinkSync(join(sessionDir, 'snapshots', 'raw.txt'), join(sessionDir, 'alias.txt'));

    const result = await runSessionFinalize('latest', { check: true }, { cwd, log: silentLog });
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.startsWith('alias.txt') && v.includes('secret'))).toBe(true);
  });
});

describe('runSessionFinalize — oversized text', () => {
  it('refuses a text file over the scan limit instead of passing it unscanned', async () => {
    const { cwd, sessionDir } = makeCleanSessionCwd();
    const big = join(sessionDir, 'big.log');
    // A sparse file: 33 MB long without writing 33 MB. Its first 16 KB are text, so
    // the 8 KB binary sniff sees no NUL and treats it as a text file.
    writeFileSync(big, 'a');
    truncateSync(big, 33 * 1024 * 1024);
    const fd = openSync(big, 'r+');
    writeSync(fd, 'x'.repeat(16 * 1024), 0);
    closeSync(fd);

    const result = await runSessionFinalize('latest', { check: true }, { cwd, log: silentLog });
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.startsWith('big.log') && v.includes('scan limit'))).toBe(true);
  });
});

// ─── session contract 2 ─────────────────────────────────────────────

const C2_NAME = '2026-10-05-1000-explore-c2';
const C2_DIR = join(REPO_ROOT, 'tests', 'fixtures', 'contract2-session', C2_NAME);
const C2_QUICK_NAME = '2026-10-05-1100-quick-c2q';
const C2_QUICK_DIR = join(REPO_ROOT, 'tests', 'fixtures', 'contract2-quick', C2_QUICK_NAME);
const RERUN = `re-run \`qualiow session level ${C2_NAME} --write\``;

function copyInto(cwd: string, fixture: string, name: string): string {
  const sessionDir = join(cwd, 'output', 'sessions', name);
  cpSync(fixture, sessionDir, { recursive: true });
  return sessionDir;
}

function makeC2Cwd(): { cwd: string; sessionDir: string } {
  const cwd = makeTmpCwd();
  return { cwd, sessionDir: copyInto(cwd, C2_DIR, C2_NAME) };
}

function editJson(path: string, edit: (v: Record<string, unknown>) => void): void {
  const value = JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>;
  edit(value);
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

describe('runSessionFinalize — contract 2', () => {
  it('--check passes on the fixture and writes nothing', async () => {
    const { cwd, sessionDir } = makeC2Cwd();
    const result = await runSessionFinalize(C2_NAME, { check: true }, { cwd, log: silentLog });
    expect(result.violations).toEqual([]);
    expect(result.ok).toBe(true);
    expect(existsSync(indexPathOf(cwd))).toBe(false);
    expect(existsSync(metricsPathOf(cwd))).toBe(false);
    for (const f of ['stats.json', 'evidence-level.md', 'backlog.md']) {
      expect(readFileSync(join(sessionDir, f), 'utf-8')).toBe(readFileSync(join(C2_DIR, f), 'utf-8'));
    }
  });

  it('finalizes, is idempotent, and never writes stats.json', async () => {
    const { cwd, sessionDir } = makeC2Cwd();
    const first = await runSessionFinalize(C2_NAME, {}, { cwd, log: silentLog });
    expect(first.ok).toBe(true);
    expect(first.bugRowsAdded).toEqual(['BUG-001', 'BUG-002', 'BUG-003']);
    const index1 = readFileSync(indexPathOf(cwd), 'utf-8');
    const bugs1 = readFileSync(allBugsPathOf(cwd), 'utf-8');

    const second = await runSessionFinalize(C2_NAME, {}, { cwd, log: silentLog });
    expect(second.ok).toBe(true);
    expect(readFileSync(indexPathOf(cwd), 'utf-8')).toBe(index1);
    expect(readFileSync(allBugsPathOf(cwd), 'utf-8')).toBe(bugs1);
    expect(readFileSync(metricsPathOf(cwd), 'utf-8').trim().split('\n')).toHaveLength(1);
    expect(readFileSync(join(sessionDir, 'stats.json'), 'utf-8')).toBe(readFileSync(join(C2_DIR, 'stats.json'), 'utf-8'));
  });

  it('the metrics line carries counts and gap codes — no area reason, evidence file or areas_not_tested [M2]', async () => {
    const { cwd } = makeC2Cwd();
    await runSessionFinalize(C2_NAME, {}, { cwd, log: silentLog });
    const line = readFileSync(metricsPathOf(cwd), 'utf-8').trim();
    for (const leak of ['password change not reached', 'not reached in the time box', 'A1-login.png', 'screenshots/', 'help pages', 'inputs_digest']) {
      expect(line).not.toContain(leak);
    }
    const record = JSON.parse(line);
    expect(record.areas_not_tested).toBeUndefined();
    expect(record.coverage.areas.by_status).toEqual({ tested: 3, partial: 1, blocked: 0, 'not-tested': 0, deferred: 1 });
    expect(record.coverage.areas.by_tier.P0.tested).toBe(2);
    expect(record.coverage.areas.by_tier.P3.deferred).toBe(1);
    expect(record.coverage_level).toEqual({
      level: 'qualified',
      tiers: { P0: 'complete', P1: 'complete', P2: 'unassessed', P3: 'unassessed' },
      gaps: ['AREA_PARTIAL', 'AREA_DEFERRED', 'BUG_UNVERIFIED', 'BUG_UNMAPPED'],
    });
    expect(record.coverage.verification.judged).toBe(4);
  });

  it('the quick fixture finalizes (no continues key)', async () => {
    const cwd = makeTmpCwd();
    copyInto(cwd, C2_QUICK_DIR, C2_QUICK_NAME);
    const result = await runSessionFinalize(C2_QUICK_NAME, {}, { cwd, log: silentLog });
    expect(result.violations).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('accepts the output/sessions/<dir> path form the skills pass', async () => {
    const { cwd } = makeC2Cwd();
    const result = await runSessionFinalize(`output/sessions/${C2_NAME}`, { check: true }, { cwd, log: silentLog });
    expect(result.ok).toBe(true);
    await expect(runSessionFinalize('output/other/x', { check: true }, { cwd, log: silentLog })).rejects.toThrow(
      'not a session directory directly under output/sessions/',
    );
  });

  it('a bug edited after level --write makes the level stale ⇒ exit 1', async () => {
    const { cwd, sessionDir } = makeC2Cwd();
    const bug = join(sessionDir, 'bugs', 'BUG-002.md');
    writeFileSync(bug, readFileSync(bug, 'utf-8').replace('**Verification:** Unverified (not judged — budget)', '**Verification:** Verified'));
    const result = await runSessionFinalize(C2_NAME, {}, { cwd, log: silentLog });
    expect(result.ok).toBe(false);
    expect(result.violations).toEqual([
      `stats.json coverage_level is stale (its inputs changed since it was written) — ${RERUN}`,
      `evidence-level.md is stale or edited by hand — ${RERUN}`,
    ]);
    expect(existsSync(indexPathOf(cwd))).toBe(false);
  });

  it.each([
    ['stats.json coverage_level', (d: string) => editJson(join(d, 'stats.json'), (s) => void delete s.coverage_level), `stats.json has no coverage_level — ${RERUN}`],
    ['evidence-level.md', (d: string) => rmSync(join(d, 'evidence-level.md')), `evidence-level.md is missing — ${RERUN}`],
    ['backlog.md', (d: string) => rmSync(join(d, 'backlog.md')), `backlog.md is missing — ${RERUN}`],
  ])('missing %s ⇒ violation', async (_label, remove, expected) => {
    const { cwd, sessionDir } = makeC2Cwd();
    remove(sessionDir);
    const result = await runSessionFinalize(C2_NAME, { check: true }, { cwd, log: silentLog });
    expect(result.violations).toEqual([expected]);
  });

  it('a hand-edited evidence-level.md or backlog.md ⇒ violation', async () => {
    const { cwd, sessionDir } = makeC2Cwd();
    const ev = join(sessionDir, 'evidence-level.md');
    writeFileSync(ev, readFileSync(ev, 'utf-8').replace('**Coverage level: qualified**', '**Coverage level: complete**'));
    const bl = join(sessionDir, 'backlog.md');
    writeFileSync(bl, readFileSync(bl, 'utf-8').replace('| A5 |', '| A6 |'));
    const result = await runSessionFinalize(C2_NAME, { check: true }, { cwd, log: silentLog });
    expect(result.violations).toEqual([
      `evidence-level.md is stale or edited by hand — ${RERUN}`,
      `backlog.md is stale or edited by hand — ${RERUN}`,
    ]);
  });

  it('a hand-edited coverage_level with the same digest ⇒ violation', async () => {
    const { cwd, sessionDir } = makeC2Cwd();
    editJson(join(sessionDir, 'stats.json'), (s) => {
      (s.coverage_level as Record<string, unknown>).level = 'complete';
    });
    const result = await runSessionFinalize(C2_NAME, { check: true }, { cwd, log: silentLog });
    expect(result.violations).toEqual([`stats.json coverage_level is stale (it does not match the recomputed level) — ${RERUN}`]);
  });

  it('compares with evidence-level.md only — never with the copy in session-report.md', async () => {
    const { cwd, sessionDir } = makeC2Cwd();
    const report = join(sessionDir, 'session-report.md');
    writeFileSync(report, readFileSync(report, 'utf-8').replace('**Coverage level: qualified**', '**Coverage level (reworded)**'));
    const result = await runSessionFinalize(C2_NAME, { check: true }, { cwd, log: silentLog });
    expect(result.violations).toEqual([]);
  });

  it('a contract-2 violation is reported with the others, and blocks finalize', async () => {
    const { cwd, sessionDir } = makeC2Cwd();
    editJson(join(sessionDir, 'stats.json'), (s) => {
      const areas = (s.coverage as { areas: Record<string, unknown>[] }).areas;
      delete areas[4].reason;
    });
    const result = await runSessionFinalize(C2_NAME, {}, { cwd, log: silentLog });
    expect(result.ok).toBe(false);
    expect(result.violations).toEqual([expect.stringContaining('area A5 is deferred without a reason')]);
    expect(existsSync(indexPathOf(cwd))).toBe(false);
  });

  it('contract 2 on a mobile session ⇒ violation', async () => {
    const cwd = makeTmpCwd();
    const name = '2026-10-05-1000-mobile-c2';
    const sessionDir = copyInto(cwd, C2_DIR, name);
    editJson(join(sessionDir, 'stats.json'), (s) => {
      s.kind = 'mobile';
      s.session_id = name;
    });
    const result = await runSessionFinalize(name, { check: true }, { cwd, log: silentLog });
    expect(result.violations).toEqual([expect.stringContaining('contract 2 is explore/quick only')]);
  });
});

describe('runSessionFinalize — contract-2 artefacts without contract 2 [L1]', () => {
  it.each([
    ['coverage.areas', (d: string) => editJson(join(d, 'stats.json'), (s) => void ((s.coverage = { areas: [] })))],
    ['coverage_level', (d: string) => editJson(join(d, 'stats.json'), (s) => void ((s.coverage_level = JSON.parse(readFileSync(join(C2_DIR, 'stats.json'), 'utf-8')).coverage_level)))],
    ['continues', (d: string) => editJson(join(d, 'stats.json'), (s) => void ((s.continues = '2026-09-01-1000-explore-example')))],
    ['evidence-level.md', (d: string) => cpSync(join(C2_DIR, 'evidence-level.md'), join(d, 'evidence-level.md'))],
    ['backlog.md', (d: string) => cpSync(join(C2_DIR, 'backlog.md'), join(d, 'backlog.md'))],
  ])('%s on a contract-1 session ⇒ violation', async (label, plant) => {
    const { cwd, sessionDir } = makeCleanSessionCwd();
    plant(sessionDir);
    const result = await runSessionFinalize('latest', { check: true }, { cwd, log: silentLog });
    expect(result.ok).toBe(false);
    expect(result.violations).toEqual([expect.stringContaining(`${label} is a contract-2 artefact, but stats.json has no "contract": 2`)]);
  });

  it('"continues": null alone is not a contract-2 artefact', async () => {
    const { cwd, sessionDir } = makeCleanSessionCwd();
    editJson(join(sessionDir, 'stats.json'), (s) => void ((s.continues = null)));
    const result = await runSessionFinalize('latest', { check: true }, { cwd, log: silentLog });
    expect(result.violations).toEqual([]);
  });

  it('on an explore session, a charter ID column and **Area:** lines are contract-2 marks ⇒ violation', async () => {
    const { cwd, sessionDir } = makeCleanSessionCwd();
    writeFileSync(
      join(sessionDir, 'charter.md'),
      `${readFileSync(join(sessionDir, 'charter.md'), 'utf-8')}\n## Feature Risk Ranking\n| ID | Feature | Risk |\n|---|---|---|\n| A1 | Login | P0 |\n`,
    );
    const bug = join(sessionDir, 'bugs', 'BUG-001.md');
    writeFileSync(bug, readFileSync(bug, 'utf-8').replace('**Component:** Checkout', '**Component:** Checkout\n**Area:** A1'));
    const result = await runSessionFinalize('latest', { check: true }, { cwd, log: silentLog });
    expect(result.violations).toEqual([
      expect.stringContaining('the ID column of the charter risk table is a contract-2 artefact'),
      expect.stringContaining('the **Area:** line in bugs/ is a contract-2 artefact'),
    ]);
  });
});

describe('runSessionFinalize — a mobile contract-1 session is unchanged', () => {
  it('finalizes exactly as before (no contract-2 keys, no Area lines)', async () => {
    const cwd = makeTmpCwd();
    const name = '2026-09-08-1813-mobile-example';
    const sessionDir = copyInto(cwd, CANONICAL_SESSION_DIR, name);
    editJson(join(sessionDir, 'stats.json'), (s) => {
      s.kind = 'mobile';
      s.session_id = name;
      s.coverage = { mobile: { platform: 'ios', mode: 'web' } };
    });
    const result = await runSessionFinalize(name, { redact: true }, { cwd, log: silentLog });
    expect(result.violations).toEqual([]);
    expect(result.ok).toBe(true);
    const line = JSON.parse(readFileSync(metricsPathOf(cwd), 'utf-8').trim());
    expect(line.coverage).toEqual({ mobile: { platform: 'ios', mode: 'web' } });
    expect(line.contract).toBeUndefined();
  });
});

describe('runSessionFinalize — continues [M1]', () => {
  const PRIOR = '2026-10-04-0900-explore-c2';

  /** A finalized prior explore session of the same target, plus the c2 session continuing it. */
  async function withPrior(opts: { finalize?: boolean; target?: string } = {}) {
    const { cwd, sessionDir } = makeC2Cwd();
    const priorDir = copyInto(cwd, C2_DIR, PRIOR);
    editJson(join(priorDir, 'stats.json'), (s) => {
      s.session_id = PRIOR;
      if (opts.target) s.target = opts.target;
    });
    if (opts.finalize !== false) {
      expect((await runSessionFinalize(PRIOR, {}, { cwd, log: silentLog })).ok).toBe(true);
    }
    editJson(join(sessionDir, 'stats.json'), (s) => void ((s.continues = PRIOR)));
    return { cwd, sessionDir };
  }

  it('a finalized explore session of the same target ⇒ passes', async () => {
    const { cwd } = await withPrior();
    const result = await runSessionFinalize(C2_NAME, { check: true }, { cwd, log: silentLog });
    expect(result.violations).toEqual([]);
  });

  it('an unfinalized prior ⇒ violation', async () => {
    const { cwd } = await withPrior({ finalize: false });
    const result = await runSessionFinalize(C2_NAME, { check: true }, { cwd, log: silentLog });
    expect(result.violations).toEqual([expect.stringContaining('which is not finalized')]);
  });

  it('a prior of another target ⇒ violation', async () => {
    const { cwd } = await withPrior({ target: 'other-shop' });
    const result = await runSessionFinalize(C2_NAME, { check: true }, { cwd, log: silentLog });
    expect(result.violations).toEqual([expect.stringContaining('not a session of the same target')]);
  });

  it('a missing prior, itself, or a path ⇒ violation', async () => {
    for (const [value, expected] of [
      ['2026-01-01-0000-explore-gone', 'not a session directory under output/sessions/'],
      [C2_NAME, 'names this session itself'],
      ['../2026-01-01-0000-explore-gone', 'continues'],
    ] as const) {
      const { cwd, sessionDir } = makeC2Cwd();
      editJson(join(sessionDir, 'stats.json'), (s) => void ((s.continues = value)));
      const result = await runSessionFinalize(C2_NAME, { check: true }, { cwd, log: silentLog });
      expect(result.ok).toBe(false);
      expect(result.violations.join('\n')).toContain(expected);
    }
  });

  it('a quick session that names a prior ⇒ violation', async () => {
    const cwd = makeTmpCwd();
    const sessionDir = copyInto(cwd, C2_QUICK_DIR, C2_QUICK_NAME);
    copyInto(cwd, C2_DIR, PRIOR);
    editJson(join(sessionDir, 'stats.json'), (s) => void ((s.continues = PRIOR)));
    const result = await runSessionFinalize(C2_QUICK_NAME, { check: true }, { cwd, log: silentLog });
    expect(result.violations).toEqual([expect.stringContaining('continues is explore only')]);
  });
});
