import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  ALL_BUGS_COLUMNS,
  ALL_BUGS_MD_HEADER,
  INDEX_COLUMNS,
  INDEX_MD_HEADER,
  buildTableRow,
  escapeTableCell,
} from '../../src/utils/index-files.js';
import { parseMarkdownTable, splitTableRow } from '../../src/utils/markdown-table.js';
import {
  runSessionArchive,
  runSessionDelete,
  runSessionFinalize,
} from '../../src/cli/commands/session.js';
import { redact } from '../../src/utils/redact.js';

const tmpDirs: string[] = [];
afterEach(() => {
  while (tmpDirs.length) rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});
const silentLog = () => {};

const FIXTURE = resolve(
  process.cwd(),
  'tests',
  'fixtures',
  'canonical-session',
  '2026-09-08-1813-explore-example',
);
const SESSION = '2026-09-08-1813-explore-example';
const VICTIM = '2026-01-01-0900-explore-victim';

describe('escapeTableCell / buildTableRow', () => {
  it('escapes pipes and collapses line breaks', () => {
    expect(escapeTableCell('a | b\r\nc\nd')).toBe('a \\| b c d');
  });

  it('a value with pipes and newlines stays one row with the header width', () => {
    const row = buildTableRow([...INDEX_COLUMNS], {
      date: '2026-09-08',
      target: 'Evil | 9 | 1 min | complete | x/session-report.md |\n| forged',
      report: `${SESSION}/session-report.md`,
    });
    expect(row).not.toContain('\n');
    expect(splitTableRow(row)).toHaveLength(INDEX_COLUMNS.length);
    const table = parseMarkdownTable(INDEX_MD_HEADER + row + '\n');
    expect(table?.rows).toHaveLength(1);
    expect(table?.rows[0].target).toBe('Evil | 9 | 1 min | complete | x/session-report.md | | forged');
    expect(table?.rows[0].report).toBe(`${SESSION}/session-report.md`);
  });

  it('round-trips a backslash before a pipe', () => {
    const row = buildTableRow(['A', 'B'], { a: 'x\\|y', b: 'z' });
    const table = parseMarkdownTable(`| A | B |\n|---|---|\n${row}\n`);
    expect(table?.rows[0]).toEqual({ a: 'x\\|y', b: 'z' });
  });
});

describe('finalize — crafted titles and targets cannot forge or hide rows', () => {
  function setup(): string {
    const cwd = mkdtempSync(join(tmpdir(), 'qualiow-index-files-'));
    tmpDirs.push(cwd);
    const sessionDir = join(cwd, 'output', 'sessions', SESSION);
    cpSync(FIXTURE, sessionDir, { recursive: true });
    const bug002 = join(sessionDir, 'bugs', 'BUG-002.md');
    writeFileSync(bug002, redact(readFileSync(bug002, 'utf-8')).text);
    return cwd;
  }

  it('a target with pipes and newlines writes exactly one INDEX row', async () => {
    const cwd = setup();
    const statsPath = join(cwd, 'output', 'sessions', SESSION, 'stats.json');
    const stats = JSON.parse(readFileSync(statsPath, 'utf-8'));
    stats.target = `Evil | 1 | 1 min | complete | ${VICTIM}/session-report.md |\n| 2026 | forged`;
    writeFileSync(statsPath, JSON.stringify(stats));

    const result = await runSessionFinalize(SESSION, {}, { cwd, log: silentLog });
    expect(result.ok).toBe(true);
    const index = readFileSync(join(cwd, 'output', 'sessions', 'INDEX.md'), 'utf-8');
    const rows = parseMarkdownTable(index)!.rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].report).toBe(`${SESSION}/session-report.md`);
  });

  it("a row that merely mentions this session's path does not count as its row", async () => {
    const cwd = setup();
    const indexPath = join(cwd, 'output', 'sessions', 'INDEX.md');
    // Another session's row whose target names this session's report path.
    writeFileSync(
      indexPath,
      `${INDEX_MD_HEADER}| 2026-01-01 | explore | see ${SESSION}/session-report.md | 0 | 1 min | complete | ${VICTIM}/session-report.md |\n`,
    );
    const result = await runSessionFinalize(SESSION, {}, { cwd, log: silentLog });
    expect(result.indexRowAdded).toBe(true);
  });

  it('delete removes only rows whose Report cell is the session, not rows mentioning it', async () => {
    const cwd = setup();
    const sessionsDir = join(cwd, 'output', 'sessions');
    mkdirSync(join(sessionsDir, VICTIM), { recursive: true });
    writeFileSync(
      join(sessionsDir, 'INDEX.md'),
      INDEX_MD_HEADER +
        `| 2026-01-01 | explore | Victim | 0 | 1 min | complete | ${VICTIM}/session-report.md |\n` +
        `| 2026-09-08 | explore | ${VICTIM}/session-report.md | 2 | 42 min | complete | ${SESSION}/session-report.md |\n`,
    );
    mkdirSync(join(cwd, 'output', 'bugs'), { recursive: true });
    writeFileSync(
      join(cwd, 'output', 'bugs', 'all-bugs.md'),
      ALL_BUGS_MD_HEADER +
        `| BUG-001 | ${VICTIM} | Victim bug | High | open | ${VICTIM}/bugs/BUG-001.md |\n` +
        `| BUG-001 | ${SESSION} | names ${VICTIM}/bugs/BUG-001.md | High | open | ${SESSION}/bugs/BUG-001.md |\n`,
    );

    const dry = runSessionDelete(VICTIM, {}, { cwd, log: silentLog });
    expect(dry.indexRows).toBe(1);
    expect(dry.bugRows).toBe(1);

    runSessionDelete(VICTIM, { yes: true }, { cwd, log: silentLog });
    const index = parseMarkdownTable(readFileSync(join(sessionsDir, 'INDEX.md'), 'utf-8'))!.rows;
    expect(index.map((r) => r.report)).toEqual([`${SESSION}/session-report.md`]);
    const bugs = parseMarkdownTable(readFileSync(join(cwd, 'output', 'bugs', 'all-bugs.md'), 'utf-8'))!.rows;
    expect(bugs.map((r) => r.report)).toEqual([`${SESSION}/bugs/BUG-001.md`]);
  });

  it('archive --remove marks only the archived session, keeping escaped pipes intact', async () => {
    const cwd = setup();
    const sessionsDir = join(cwd, 'output', 'sessions');
    mkdirSync(join(sessionsDir, VICTIM), { recursive: true });
    writeFileSync(join(sessionsDir, VICTIM, 'note.md'), 'x');
    const keep = `| 2026-09-08 | explore | ${VICTIM}/ a \\| b | 2 | 42 min | complete | ${SESSION}/session-report.md |`;
    writeFileSync(
      join(sessionsDir, 'INDEX.md'),
      INDEX_MD_HEADER +
        `| 2026-01-01 | explore | Victim \\| x | 0 | 1 min | complete | ${VICTIM}/session-report.md |\n` +
        `${keep}\n`,
    );

    runSessionArchive(VICTIM, { remove: true }, { cwd, log: silentLog });
    const text = readFileSync(join(sessionsDir, 'INDEX.md'), 'utf-8');
    expect(text).toContain(keep);
    expect(text).toContain(`| 2026-01-01 | explore | Victim \\| x | 0 | 1 min | archived | ${VICTIM}/session-report.md |`);
  });

  it('a bug title with pipes stays in its own Title cell', async () => {
    const cwd = setup();
    const bug001 = join(cwd, 'output', 'sessions', SESSION, 'bugs', 'BUG-001.md');
    writeFileSync(
      bug001,
      readFileSync(bug001, 'utf-8').replace(
        /^# BUG-001: .*$/m,
        `# BUG-001: x | ${VICTIM} | y | High | open | ${VICTIM}/bugs/BUG-009.md`,
      ),
    );
    const result = await runSessionFinalize(SESSION, {}, { cwd, log: silentLog });
    expect(result.ok).toBe(true);
    const rows = parseMarkdownTable(
      readFileSync(join(cwd, 'output', 'bugs', 'all-bugs.md'), 'utf-8'),
    )!.rows;
    expect(rows[0].title).toContain(`${VICTIM}/bugs/BUG-009.md`);
    expect(rows.map((r) => r.session)).toEqual([SESSION, SESSION]);
    expect(rows.every((r) => Object.keys(r).length === ALL_BUGS_COLUMNS.length)).toBe(true);
    expect(rows.map((r) => r.report)).toEqual([`${SESSION}/bugs/BUG-001.md`, `${SESSION}/bugs/BUG-002.md`]);
  });
});
