/**
 * How finalize, archive, delete and prune write output/sessions/INDEX.md,
 * output/bugs/all-bugs.md and output/metrics.jsonl.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  runSessionArchive,
  runSessionDelete,
  runSessionFinalize,
  runSessionRepairIndex,
} from '../../src/cli/commands/session.js';
import { ALL_BUGS_MD_HEADER, INDEX_MD_HEADER } from '../../src/utils/index-files.js';
import { C2_NAME, cleanup, copySession, silentLog } from './contract2-helpers.js';

const registry: string[] = [];
afterEach(() => cleanup(registry));

const indexPathOf = (cwd: string) => join(cwd, 'output', 'sessions', 'INDEX.md');
const OTHER_ROW = '| 2026-10-01 | explore | other | 0 | 10 min | complete | 2026-10-01-0900-explore-other/session-report.md |';

describe('index rows — a file without a trailing newline', () => {
  it('a row appended to a file with no table starts on its own line', async () => {
    const { cwd } = copySession(registry);
    writeFileSync(indexPathOf(cwd), '# Exploratory Testing Sessions');
    expect((await runSessionFinalize(C2_NAME, {}, { cwd, log: silentLog })).ok).toBe(true);
    const lines = readFileSync(indexPathOf(cwd), 'utf-8').split('\n');
    expect(lines[0]).toBe('# Exploratory Testing Sessions');
    expect(lines[1].startsWith(`| 2026-10-05 | explore |`)).toBe(true);
  });

  it('a row inserted after the last table line leaves the file ending in a newline', async () => {
    const { cwd } = copySession(registry);
    writeFileSync(indexPathOf(cwd), `${INDEX_MD_HEADER}${OTHER_ROW}`);
    expect((await runSessionFinalize(C2_NAME, {}, { cwd, log: silentLog })).ok).toBe(true);
    const text = readFileSync(indexPathOf(cwd), 'utf-8');
    expect(text.endsWith('\n')).toBe(true);
    expect(text.split('\n').filter((l) => l.startsWith('| 2026-'))).toEqual([
      OTHER_ROW,
      expect.stringContaining(`${C2_NAME}/session-report.md`),
    ]);
  });
});

const toCrlf = (text: string): string => text.replace(/\r?\n/g, '\r\n');
const allBugsPathOf = (cwd: string) => join(cwd, 'output', 'bugs', 'all-bugs.md');
const OTHER_BUG_ROW = '| BUG-001 | 2026-10-01-0900-explore-other | [X] y | Low | open | 2026-10-01-0900-explore-other/bugs/BUG-001.md |';

/** Every line break in `text` is CRLF — none is a bare LF. */
function expectOnlyCrlf(text: string): void {
  expect(text).toContain('\r\n');
  expect(text.replace(/\r\n/g, '')).not.toContain('\n');
}

/** A copied contract-2 session beside a CRLF INDEX.md and all-bugs.md that already hold another session. */
function crlfProject() {
  const project = copySession(registry);
  mkdirSync(join(project.cwd, 'output', 'bugs'), { recursive: true });
  writeFileSync(indexPathOf(project.cwd), toCrlf(`${INDEX_MD_HEADER}${OTHER_ROW}\n`));
  writeFileSync(allBugsPathOf(project.cwd), toCrlf(`${ALL_BUGS_MD_HEADER}${OTHER_BUG_ROW}\n`));
  return project;
}

describe('index rows — a CRLF index keeps its line ends', () => {
  it('finalize writes its rows with CRLF, and a second run adds nothing', async () => {
    const { cwd } = crlfProject();
    expect((await runSessionFinalize(C2_NAME, {}, { cwd, log: silentLog })).ok).toBe(true);
    const index = readFileSync(indexPathOf(cwd), 'utf-8');
    const bugs = readFileSync(allBugsPathOf(cwd), 'utf-8');
    expectOnlyCrlf(index);
    expectOnlyCrlf(bugs);
    expect(index.split('\r\n').filter((l) => l.startsWith('| 2026-'))).toHaveLength(2);
    expect(bugs.split('\r\n').filter((l) => l.startsWith('| BUG-'))).toHaveLength(4);

    expect((await runSessionFinalize(C2_NAME, {}, { cwd, log: silentLog })).ok).toBe(true);
    expect(readFileSync(indexPathOf(cwd), 'utf-8')).toBe(index);
    expect(readFileSync(allBugsPathOf(cwd), 'utf-8')).toBe(bugs);
  });

  it.skipIf(process.platform === 'win32')('archive --remove keeps CRLF', async () => {
    const { cwd } = crlfProject();
    expect((await runSessionFinalize(C2_NAME, {}, { cwd, log: silentLog })).ok).toBe(true);
    runSessionArchive(C2_NAME, { remove: true }, { cwd, log: silentLog });
    const index = readFileSync(indexPathOf(cwd), 'utf-8');
    expectOnlyCrlf(index);
    expect(index).toContain('| archived |');
    expectOnlyCrlf(readFileSync(allBugsPathOf(cwd), 'utf-8'));
  });

  it('delete keeps CRLF', async () => {
    const { cwd } = crlfProject();
    expect((await runSessionFinalize(C2_NAME, {}, { cwd, log: silentLog })).ok).toBe(true);
    runSessionDelete(C2_NAME, { yes: true }, { cwd, log: silentLog });
    expect(readFileSync(indexPathOf(cwd), 'utf-8')).toBe(toCrlf(`${INDEX_MD_HEADER}${OTHER_ROW}\n`));
    expect(readFileSync(allBugsPathOf(cwd), 'utf-8')).toBe(toCrlf(`${ALL_BUGS_MD_HEADER}${OTHER_BUG_ROW}\n`));
  });

  it('repair-index keeps CRLF', () => {
    const { cwd } = crlfProject();
    const second = OTHER_ROW.replace('2026-10-01-0900-explore-other', '2026-10-02-0900-explore-other');
    writeFileSync(indexPathOf(cwd), toCrlf(`${INDEX_MD_HEADER}${OTHER_ROW}\n\n${second}\n`));
    const result = runSessionRepairIndex({ yes: true }, { cwd, log: silentLog });
    expect(result.files.find((f) => f.file === 'INDEX.md')?.repaired).toBe(true);
    expect(readFileSync(indexPathOf(cwd), 'utf-8')).toBe(toCrlf(`${INDEX_MD_HEADER}${OTHER_ROW}\n${second}\n`));
  });
});

describe('delete — the dry run counts exactly the rows --yes removes', () => {
  const NOTES =
    '\n## Notes kept by hand\n\n| Note | Report |\n|---|---|\n' + `| reviewed by the team | ${C2_NAME}/session-report.md |\n`;

  /** An INDEX.md whose row for the session points at another file in it, and a later table that mentions it. */
  function project() {
    const { cwd } = copySession(registry);
    const row = `| 2026-10-05 | explore | example-shop | 3 | 45 min | complete | ${C2_NAME}/session-summary.md |`;
    writeFileSync(indexPathOf(cwd), `${INDEX_MD_HEADER}${OTHER_ROW}\n${row}\n${NOTES}`);
    return cwd;
  }

  it('removes the row the dry run counted, and nothing outside the index table', () => {
    const cwd = project();
    const dry = runSessionDelete(C2_NAME, {}, { cwd, log: silentLog });
    expect(dry.indexRows).toBe(1);
    const done = runSessionDelete(C2_NAME, { yes: true }, { cwd, log: silentLog });
    expect(done.indexRows).toBe(1);
    expect(readFileSync(indexPathOf(cwd), 'utf-8')).toBe(`${INDEX_MD_HEADER}${OTHER_ROW}\n${NOTES}`);
  });
});

describe.skipIf(process.platform === 'win32')('archive --remove', () => {
  it('drops the session’s all-bugs.md rows, whose reports went with the directory', async () => {
    const { cwd } = copySession(registry);
    mkdirSync(join(cwd, 'output', 'bugs'), { recursive: true });
    writeFileSync(allBugsPathOf(cwd), `${ALL_BUGS_MD_HEADER}${OTHER_BUG_ROW}\n`);
    expect((await runSessionFinalize(C2_NAME, {}, { cwd, log: silentLog })).ok).toBe(true);
    expect(readFileSync(allBugsPathOf(cwd), 'utf-8')).toContain(`${C2_NAME}/bugs/BUG-001.md`);

    const result = runSessionArchive(C2_NAME, { remove: true }, { cwd, log: silentLog });
    expect(result.removed).toBe(true);
    expect(readFileSync(allBugsPathOf(cwd), 'utf-8')).toBe(`${ALL_BUGS_MD_HEADER}${OTHER_BUG_ROW}\n`);
    expect(readFileSync(indexPathOf(cwd), 'utf-8')).toContain(`| archived | ${C2_NAME}/session-report.md |`);
  });

  it('without --remove leaves every row in place', async () => {
    const { cwd } = copySession(registry);
    expect((await runSessionFinalize(C2_NAME, {}, { cwd, log: silentLog })).ok).toBe(true);
    const before = readFileSync(allBugsPathOf(cwd), 'utf-8');
    runSessionArchive(C2_NAME, {}, { cwd, log: silentLog });
    expect(readFileSync(allBugsPathOf(cwd), 'utf-8')).toBe(before);
  });
});
