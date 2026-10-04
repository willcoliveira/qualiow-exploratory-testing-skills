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
