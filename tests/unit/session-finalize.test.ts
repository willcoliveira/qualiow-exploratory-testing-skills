import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, cpSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
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
