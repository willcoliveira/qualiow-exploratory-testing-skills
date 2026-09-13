import { describe, it, expect, afterEach } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  cpSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { resolveSessionDir, runReport } from '../../src/cli/commands/report.js';
import { runExplore, parseTimeBox } from '../../src/cli/commands/explore.js';
import { readSessionIndex, runList } from '../../src/cli/commands/list.js';
import { runValidate } from '../../src/cli/commands/validate.js';
import { SESSION_DIR_RE, parseSessionDirName } from '../../src/utils/session-dir.js';

const REPO_ROOT = resolve(process.cwd());
const CANONICAL_SESSION_DIR = join(
  REPO_ROOT,
  'tests',
  'fixtures',
  'canonical-session',
  '2026-09-08-1813-explore-example',
);

const tmpDirs: string[] = [];

function makeTmpCwd(): string {
  const dir = mkdtempSync(join(tmpdir(), 'qualiow-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tmpDirs.length) {
    const dir = tmpDirs.pop()!;
    rmSync(dir, { recursive: true, force: true });
  }
});

const silentLog = () => {};

// ─── resolveSessionDir ──────────────────────────────────────────────

describe('resolveSessionDir', () => {
  function makeSessionsDir(): string {
    const cwd = makeTmpCwd();
    const sessionsDir = join(cwd, 'output', 'sessions');
    for (const name of [
      '2026-09-01-1000-explore-alpha',
      '2026-09-02-1000-quick-alpha',
      '2026-09-03-1000-explore-beta',
      '20260101-0900-old', // legacy, does not match SESSION_DIR_RE
    ]) {
      mkdirSync(join(sessionsDir, name), { recursive: true });
    }
    return sessionsDir;
  }

  it('"latest" picks the lexicographically last canonical directory', () => {
    const sessionsDir = makeSessionsDir();
    const resolved = resolveSessionDir(sessionsDir, 'latest');
    expect(resolved).toBe(join(sessionsDir, '2026-09-03-1000-explore-beta'));
  });

  it('an exact directory name wins even when it is also a substring of others', () => {
    const sessionsDir = makeSessionsDir();
    const resolved = resolveSessionDir(sessionsDir, '2026-09-01-1000-explore-alpha');
    expect(resolved).toBe(join(sessionsDir, '2026-09-01-1000-explore-alpha'));
  });

  it('a unique substring resolves to the one matching directory', () => {
    const sessionsDir = makeSessionsDir();
    const resolved = resolveSessionDir(sessionsDir, 'beta');
    expect(resolved).toBe(join(sessionsDir, '2026-09-03-1000-explore-beta'));
  });

  it('an ambiguous substring throws, listing the candidates', () => {
    const sessionsDir = makeSessionsDir();
    expect(() => resolveSessionDir(sessionsDir, 'alpha')).toThrow(/matches 2 sessions/);
  });

  it('an unknown id throws', () => {
    const sessionsDir = makeSessionsDir();
    expect(() => resolveSessionDir(sessionsDir, 'zzz-nope')).toThrow(/No session matches/);
  });
});

// ─── runReport ──────────────────────────────────────────────────────

function makeTmpSessionCwd(): { cwd: string; sessionDir: string } {
  const cwd = makeTmpCwd();
  const sessionDir = join(cwd, 'output', 'sessions', '2026-09-08-1813-explore-example');
  cpSync(CANONICAL_SESSION_DIR, sessionDir, { recursive: true });
  return { cwd, sessionDir };
}

describe('runReport — md format', () => {
  it('writes session-summary.md starting with the confidentiality header', async () => {
    const { cwd, sessionDir } = makeTmpSessionCwd();
    const result = await runReport(
      { session: 'latest', format: 'md', stdout: false },
      { cwd, log: silentLog },
    );
    expect(result.outputPath).toBe(join(sessionDir, 'session-summary.md'));
    expect(existsSync(result.outputPath!)).toBe(true);
    expect(result.content.startsWith('> CONFIDENTIAL:')).toBe(true);
  });
});

describe('runReport — html format', () => {
  it('contains the confidentiality notice and never the raw JWT or email', async () => {
    const { cwd } = makeTmpSessionCwd();
    const result = await runReport(
      { session: 'latest', format: 'html', stdout: false },
      { cwd, log: silentLog },
    );
    expect(result.content).toContain(
      'CONFIDENTIAL: This report may contain internal URLs',
    );
    expect(result.content).not.toContain('eyJhbGciOiJIUzI1NiJ9');
    expect(result.content).not.toContain('qa.user@corp-internal.test');
  });
});

describe('runReport — json format', () => {
  it('has meta.classification CONFIDENTIAL and no raw JWT', async () => {
    const { cwd } = makeTmpSessionCwd();
    const result = await runReport(
      { session: 'latest', format: 'json', stdout: false },
      { cwd, log: silentLog },
    );
    const parsed = JSON.parse(result.content);
    expect(parsed.meta.classification).toBe('CONFIDENTIAL');
    expect(result.content).not.toContain('eyJhbGciOiJIUzI1NiJ9');
  });
});

describe('runReport — jira format (CSV formula-injection guard)', () => {
  it('prefixes a formula-shaped description with a leading apostrophe', async () => {
    const { cwd, sessionDir } = makeTmpSessionCwd();
    // A bug whose Summary section begins with a spreadsheet formula payload.
    // csvEscape() only inspects the first character of each cell, so the
    // guard is only observable on the exact field that begins with it — the
    // Description column here. (The Summary/first column is always
    // `${bug.id}: ${bug.title}`, and every bug id starts with "BUG-", so
    // that column can never itself begin with a formula character.)
    writeFileSync(
      join(sessionDir, 'bugs', 'BUG-003.md'),
      [
        '> CONFIDENTIAL: This report may contain internal URLs, security vulnerabilities,',
        '> and application details. Do not share outside your organization without review.',
        '',
        '# BUG-003: [Export] allows a formula-injection payload in a free-text field',
        '',
        '**Severity:** Low',
        '**Priority:** P3',
        '**Component:** Export',
        '**URL:** https://example.com/export',
        '**Environment:** Chromium 1280x720',
        '**Reproduction rate:** Always',
        '',
        '## Summary',
        '',
        '=cmd()|\'/C calc\'!A0 was accepted as a free-text export field.',
        '',
        '## Expected Behavior',
        '',
        'Leading formula characters should be neutralised on export.',
        '',
        '## Actual Behavior',
        '',
        'The raw value is exported unescaped.',
        '',
        '## Steps to Reproduce',
        '',
        '1. Enter the payload above into the export field.',
        '2. Export to CSV.',
        '3. Open in a spreadsheet application.',
        '',
        '## Business Impact',
        '',
        '- **Revenue impact:** None identified.',
        '- **Trust impact:** A malicious export could execute code for the opener.',
        '- **Regulatory risk:** None identified.',
        '- **Data risk:** None identified.',
        '- **Scale:** Any user who exports and opens the file.',
        '',
        '## Evidence',
        '',
        '- Screenshot: screenshots/BUG-003.png',
        '- Console errors: none',
        '- Network failures: none',
        '',
        '## Recommended Fix Priority',
        '',
        'P3 — low likelihood, but easy to fix at the export boundary.',
        '',
      ].join('\n'),
    );

    const result = await runReport(
      { session: 'latest', format: 'jira', stdout: false },
      { cwd, log: silentLog },
    );

    const bug003Row = result.content
      .split('\n')
      .find((line) => line.startsWith('"BUG-003:'));
    expect(bug003Row).toBeDefined();
    // Summary (first cell) is always safe — it starts with the bug id.
    expect(bug003Row!.startsWith('"BUG-003:')).toBe(true);
    // Description (third cell) begins with the formula payload and must be
    // neutralised with a leading apostrophe inside the quoted cell.
    expect(bug003Row).toContain("\"'=cmd()");
  });
});

describe('runReport — metrics are appended once', () => {
  it('does not duplicate the metrics.jsonl entry across two runs', async () => {
    const { cwd } = makeTmpSessionCwd();
    await runReport({ session: 'latest', format: 'md', stdout: false }, { cwd, log: silentLog });
    await runReport({ session: 'latest', format: 'md', stdout: false }, { cwd, log: silentLog });

    const metricsPath = join(cwd, 'output', 'metrics.jsonl');
    expect(existsSync(metricsPath)).toBe(true);
    const lines = readFileSync(metricsPath, 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]);
    expect(parsed.session_id).toBe('2026-09-08-1813-explore-example');
  });
});

// ─── runExplore / parseTimeBox ──────────────────────────────────────

describe('parseTimeBox', () => {
  it('parses valid minute values', () => {
    expect(parseTimeBox('45m')).toBe(45);
    expect(parseTimeBox('1m')).toBe(1);
    expect(parseTimeBox('30m')).toBe(30);
  });

  it('rejects a value with an hour suffix', () => {
    expect(() => parseTimeBox('1h')).toThrow(/Invalid --time-box/);
  });

  it('rejects zero minutes', () => {
    expect(() => parseTimeBox('0m')).toThrow(/between 1m and 45m/);
  });

  it('rejects more than 45 minutes', () => {
    expect(() => parseTimeBox('60m')).toThrow(/between 1m and 45m/);
  });
});

describe('runExplore — dry run', () => {
  it('computes a session dir name matching SESSION_DIR_RE with kind explore, and writes nothing', async () => {
    const cwd = makeTmpCwd();
    const now = new Date(2026, 8, 8, 18, 13);
    const result = await runExplore(
      'https://example.com',
      { timeBox: '45m', dryRun: true },
      { cwd, now, log: silentLog },
    );
    const name = result.sessionDir.split(/[\\/]/).pop()!;
    expect(SESSION_DIR_RE.test(name)).toBe(true);
    expect(parseSessionDirName(name)?.kind).toBe('explore');
    expect(existsSync(result.sessionDir)).toBe(false);
  });
});

describe('runExplore — real run', () => {
  it('creates the session skeleton on disk', async () => {
    const cwd = makeTmpCwd();
    const now = new Date(2026, 8, 8, 18, 13);
    const result = await runExplore(
      'https://example.com',
      { timeBox: '30m', dryRun: false },
      { cwd, now, log: silentLog },
    );
    expect(existsSync(result.sessionDir)).toBe(true);
    expect(existsSync(join(result.sessionDir, 'charter.md'))).toBe(true);
    expect(existsSync(join(result.sessionDir, 'session-log.md'))).toBe(true);
    expect(existsSync(join(result.sessionDir, 'screenshots'))).toBe(true);
    expect(existsSync(join(result.sessionDir, 'bugs'))).toBe(true);
    expect(existsSync(join(result.sessionDir, 'videos'))).toBe(true);
    expect(existsSync(join(result.sessionDir, 'snapshots'))).toBe(true);
  });

  it('rejects an invalid URL', async () => {
    const cwd = makeTmpCwd();
    await expect(
      runExplore('not-a-url', { timeBox: '45m', dryRun: true }, { cwd, log: silentLog }),
    ).rejects.toThrow(/Invalid URL/);
  });
});

// ─── readSessionIndex ────────────────────────────────────────────────

describe('readSessionIndex', () => {
  it('skips the "_No sessions yet_" placeholder row', () => {
    const cwd = makeTmpCwd();
    const indexPath = join(cwd, 'INDEX.md');
    writeFileSync(
      indexPath,
      [
        '# Exploratory Testing Sessions',
        '',
        '_Index of exploratory testing sessions. Newest last._',
        '',
        '| Date | Kind | Target | Bugs | Duration | Status | Report |',
        '|---|---|---|---|---|---|---|',
        '| _No sessions yet_ | | | | | | |',
      ].join('\n'),
    );
    expect(readSessionIndex(indexPath)).toEqual([]);
  });

  it('reads real rows once at least one session is indexed', () => {
    const cwd = makeTmpCwd();
    const indexPath = join(cwd, 'INDEX.md');
    writeFileSync(
      indexPath,
      [
        '| Date | Kind | Target | Bugs | Duration | Status | Report |',
        '|---|---|---|---|---|---|---|',
        '| 2026-09-01-1000 | explore | Example | 2 | 42 min | done | output/sessions/x/session-report.md |',
      ].join('\n'),
    );
    const rows = readSessionIndex(indexPath);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      date: '2026-09-01-1000',
      kind: 'explore',
      target: 'Example',
      bugs: '2',
    });
  });

  it('returns an empty array when the file does not exist', () => {
    const cwd = makeTmpCwd();
    expect(readSessionIndex(join(cwd, 'nope.md'))).toEqual([]);
  });
});

// ─── runValidate ─────────────────────────────────────────────────────

describe('runValidate — real repo data', () => {
  it('returns 0 failures for --all against the repo itself', () => {
    const failed = runValidate({ all: true }, REPO_ROOT);
    expect(failed).toBe(0);
  });
});

// ─── runList knowledge ───────────────────────────────────────────────

/** Collects what a runner logs, without the chalk escapes. */
async function captureList(
  type: string,
  cwd: string,
  options: Parameters<typeof runList>[2] = {},
): Promise<string> {
  const lines: string[] = [];
  await runList(type, cwd, options, (line) => lines.push(line));
  // chalk is already off when stdout is not a TTY; strip anyway so the
  // assertions hold if a runner forces colour on.
  return lines.join('\n').replace(/\[[0-9;]*m/g, '');
}

describe('runList knowledge — default listing', () => {
  it('groups the entries by type and names the version', async () => {
    const output = await captureList('knowledge', REPO_ROOT);
    expect(output).toContain('Knowledge Base:');
    expect(output).toMatch(/Version: \d+\.\d+\.\d+ \| Entries: \d+/);
    expect(output).toMatch(/Heuristics \(\d+\):/);
    expect(output).toContain('heuristic-sfdipot');
  });

  it('reads the package knowledge base from a cwd that has none', async () => {
    const cwd = makeTmpCwd();
    const output = await captureList('knowledge', cwd);
    expect(output).toContain('heuristic-sfdipot');
  });
});

describe('runList knowledge — filters', () => {
  it('--type keeps only that type', async () => {
    const output = await captureList('knowledge', REPO_ROOT, { type: 'checklist' });
    expect(output).toContain('Filter: type checklist');
    expect(output).toContain('checklist-accessibility-wcag');
    expect(output).not.toContain('heuristic-sfdipot');
  });

  it('--tag keeps only entries carrying the tag', async () => {
    const output = await captureList('knowledge', REPO_ROOT, { tag: 'accessibility' });
    expect(output).toContain('Filter: tag accessibility');
    expect(output).toContain('checklist-accessibility-wcag');
    expect(output).not.toContain('heuristic-goldilocks');
  });

  it('--domain keeps domain-specific entries alongside the "all" entries', async () => {
    const output = await captureList('knowledge', REPO_ROOT, { domain: 'fintech' });
    expect(output).toContain('Filter: domain fintech');
    expect(output).toContain('heuristic-sfdipot'); // domains: [all]
  });

  it('combined filters narrow further and report an empty result', async () => {
    const output = await captureList('knowledge', REPO_ROOT, {
      type: 'checklist',
      tag: 'does-not-exist',
    });
    expect(output).toContain('No entries match that filter.');
  });
});

describe('runList knowledge — --entry', () => {
  it('prints the raw YAML of the entry file', async () => {
    const output = await captureList('knowledge', REPO_ROOT, { entry: 'heuristic-goldilocks' });
    expect(output.startsWith('id: heuristic-goldilocks')).toBe(true);
    expect(output).toContain('content:');
  });

  it('throws on an unknown id', async () => {
    await expect(
      captureList('knowledge', REPO_ROOT, { entry: 'heuristic-nope' }),
    ).rejects.toThrow(/Unknown entry "heuristic-nope"/);
  });
});

describe('runList knowledge — --changelog', () => {
  it('prints each release with its date, summary and added ids', async () => {
    const output = await captureList('knowledge', REPO_ROOT, { changelog: true });
    expect(output).toContain('Knowledge Base Changelog:');
    expect(output).toMatch(/v\d+\.\d+\.\d+ · \d{4}-\d{2}-\d{2}/);
    expect(output).toContain('added:');
    expect(output).toContain('technique-async-callback-contracts');
  });
});

describe('runList knowledge — --stats', () => {
  it('prints the stats block, the active releases and the loading-strategy counts', async () => {
    const output = await captureList('knowledge', REPO_ROOT, { stats: true });
    expect(output).toContain('Knowledge Base Stats:');
    expect(output).toMatch(/total entries\s+\d+/);
    expect(output).toContain('Active releases');
    expect(output).toMatch(/always\s+\d+ entries/);
    expect(output).toMatch(/by_domain\s+\d+ keys, \d+ references/);
    expect(output).toMatch(/by_skill\s+\d+ keys, \d+ references/);
  });
});

describe('runList knowledge — --data', () => {
  it('reads the knowledge base from the directory it is given', async () => {
    const cwd = makeTmpCwd();
    cpSync(join(REPO_ROOT, 'data'), join(cwd, 'copied-data'), { recursive: true });
    const output = await captureList('knowledge', cwd, {
      data: join(cwd, 'copied-data'),
      type: 'reference',
    });
    expect(output).toContain('reference-heuristic-praxis');
  });

  it('reports the path it looked at when the directory holds no manifest', async () => {
    const cwd = makeTmpCwd();
    const output = await captureList('knowledge', cwd, { data: cwd });
    expect(output).toContain('No knowledge base at');
    expect(output).toContain(cwd);
  });
});
