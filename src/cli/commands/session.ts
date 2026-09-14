/**
 * `qualiow session …` — finalize, list, archive, delete and prune session output.
 *
 * `finalize` is the Tier-0 replacement for a skill hand-writing INDEX.md / all-bugs.md
 * rows and re-checking the confidentiality header / secrets scan itself: it reuses the
 * same building blocks `qualiow report` and `qualiow list` already depend on.
 */

import { Command } from 'commander';
import { execFileSync } from 'node:child_process';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import chalk from 'chalk';
import { resolveSessionDir } from './report.js';
import { runList } from './list.js';
import { parseSession } from '../../utils/parse-session.js';
import { SessionMetricsSchema } from '../../schemas/session-metrics.schema.js';
import {
  describeSessionDir,
  parseSessionDirName,
  type DiscoveredSessionDir,
} from '../../utils/session-dir.js';
import { hasConfidentialityHeader } from '../../utils/confidentiality.js';
import { containsSecrets, redact } from '../../utils/redact.js';
import {
  ALL_BUGS_COLUMNS,
  ALL_BUGS_MD_HEADER,
  INDEX_COLUMNS,
  INDEX_MD_HEADER,
  buildTableRow,
  headersMatchColumns,
  missingColumns,
} from '../../utils/index-files.js';
import { parseMarkdownTable } from '../../utils/markdown-table.js';
import { appendSessionMetricsDeduped } from '../../utils/metrics.js';
import type { SessionMetrics } from '../../types/index.js';

type Log = (line: string) => void;
const defaultLog: Log = (line: string) => console.log(line);

// ─── Command group ──────────────────────────────────────────────────

export function sessionCommand(): Command {
  const cmd = new Command('session').description(
    'Manage exploratory testing session output: finalize, list, archive, delete, prune',
  );

  cmd
    .command('finalize')
    .description(
      'Validate a session (confidentiality header, no secrets, stats.json shape) and append its INDEX.md / all-bugs.md rows',
    )
    .argument('<dir>', 'Session directory name, a unique substring, or "latest"')
    .option('--check', 'Validate only; write nothing', false)
    .option('--redact', 'Rewrite files containing secrets with the redacted text', false)
    .action(async (dir: string, options: { check: boolean; redact: boolean }) => {
      try {
        const result = await runSessionFinalize(dir, options, { cwd: process.cwd() });
        if (!result.ok) {
          console.error(chalk.red(`\n${result.violations.length} violation(s):`));
          result.violations.forEach((v, i) => console.error(chalk.red(`  ${i + 1}. ${v}`)));
          console.error('');
          process.exit(1);
        }
      } catch (err) {
        console.error(chalk.red('Error:'), err instanceof Error ? err.message : err);
        process.exit(1);
      }
    });

  cmd
    .command('list')
    .description('List sessions (same as `qualiow list sessions`)')
    .action(async () => {
      try {
        await runList('sessions', process.cwd());
      } catch (err) {
        console.error(chalk.red('Error:'), err instanceof Error ? err.message : err);
        process.exit(1);
      }
    });

  cmd
    .command('archive')
    .description('Archive a session directory to a .tar.gz next to it')
    .argument('<dir>', 'Session directory name, a unique substring, or "latest"')
    .option('--remove', 'Delete the session directory after archiving', false)
    .action((dir: string, options: { remove: boolean }) => {
      try {
        runSessionArchive(dir, options, { cwd: process.cwd() });
      } catch (err) {
        console.error(chalk.red('Error:'), err instanceof Error ? err.message : err);
        process.exit(1);
      }
    });

  cmd
    .command('delete')
    .description('Delete a session directory (dry run unless --yes)')
    .argument('<dir>', 'Session directory name, a unique substring, or "latest"')
    .option('--yes', 'Perform the deletion instead of a dry run', false)
    .action((dir: string, options: { yes: boolean }) => {
      try {
        runSessionDelete(dir, options, { cwd: process.cwd() });
      } catch (err) {
        console.error(chalk.red('Error:'), err instanceof Error ? err.message : err);
        process.exit(1);
      }
    });

  cmd
    .command('repair-index')
    .description(
      'Merge an INDEX.md / all-bugs.md table split into blocks by blank lines between its rows (dry run unless --yes)',
    )
    .option('--yes', 'Rewrite the files instead of a dry run', false)
    .action((options: { yes: boolean }) => {
      try {
        runSessionRepairIndex(options, { cwd: process.cwd() });
      } catch (err) {
        console.error(chalk.red('Error:'), err instanceof Error ? err.message : err);
        process.exit(1);
      }
    });

  cmd
    .command('prune')
    .description('Delete sessions older than N days (dry run unless --yes)')
    .requiredOption('--older-than <days>', 'Delete sessions with a timestamp older than N days')
    .option('--yes', 'Perform the deletion instead of a dry run', false)
    .action((options: { olderThan: string; yes: boolean }) => {
      try {
        runSessionPrune(options, { cwd: process.cwd() });
      } catch (err) {
        console.error(chalk.red('Error:'), err instanceof Error ? err.message : err);
        process.exit(1);
      }
    });

  return cmd;
}

// ─── finalize ───────────────────────────────────────────────────────

export interface RedactedFile {
  file: string;
  categories: string[];
}

export interface SessionFinalizeResult {
  ok: boolean;
  violations: string[];
  sessionDir?: string;
  redactedFiles?: RedactedFile[];
  indexRowAdded?: boolean;
  bugRowsAdded?: string[];
}

export async function runSessionFinalize(
  dir: string,
  options: { check?: boolean; redact?: boolean },
  ctx: { cwd: string; log?: Log },
): Promise<SessionFinalizeResult> {
  const cwd = ctx.cwd;
  const log = ctx.log ?? defaultLog;
  const sessionsDir = resolve(cwd, 'output', 'sessions');
  if (!existsSync(sessionsDir)) {
    throw new Error('No output/sessions directory found. Run `npx qualiow init` first.');
  }

  const sessionDir = resolveSessionDir(sessionsDir, dir);
  const dirName = basename(sessionDir);
  const parsedDirName = parseSessionDirName(dirName);

  const violations: string[] = [];
  const redactedFiles: RedactedFile[] = [];

  // 1. stats.json — strict schema, default `kind` from the directory name when absent.
  let stats: SessionMetrics | undefined;
  const statsPath = join(sessionDir, 'stats.json');
  if (!existsSync(statsPath)) {
    violations.push('stats.json is missing');
  } else {
    let raw: Record<string, unknown> | undefined;
    try {
      raw = JSON.parse(readFileSync(statsPath, 'utf-8')) as Record<string, unknown>;
    } catch (err) {
      violations.push(`stats.json is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (raw) {
      const effective = { ...raw };
      if (effective.kind === undefined && parsedDirName) {
        effective.kind = parsedDirName.kind;
      }
      const result = SessionMetricsSchema.strict().safeParse(effective);
      if (!result.success) {
        for (const issue of result.error.issues) {
          const path = issue.path.length ? issue.path.join('.') : '(root)';
          violations.push(`stats.json: ${path} — ${issue.message}`);
        }
      } else {
        stats = result.data as SessionMetrics;
      }
    }
  }

  // 2. every *.md under the session dir must start with the confidentiality header.
  const allFiles = listFilesRecursive(sessionDir);
  for (const file of allFiles) {
    if (!file.toLowerCase().endsWith('.md')) continue;
    const content = readFileSync(file, 'utf-8');
    if (!hasConfidentialityHeader(content)) {
      violations.push(`${relative(sessionDir, file)} is missing the confidentiality header`);
    }
  }

  // 3. no secrets in .md/.json/.log/.yml/.yaml, except under snapshots/.
  const scannedExtRe = /\.(md|json|log|ya?ml)$/i;
  for (const file of allFiles) {
    if (!scannedExtRe.test(file)) continue;
    const rel = relative(sessionDir, file);
    if (rel.split(sep).includes('snapshots')) continue;
    const content = readFileSync(file, 'utf-8');
    if (!containsSecrets(content)) continue;

    const { text, redactions } = redact(content);
    if (options.redact) {
      writeFileSync(file, text);
      redactedFiles.push({ file: rel, categories: redactions });
      log(chalk.yellow(`  ⚠ Redacted ${rel}: ${redactions.join(', ')}`));
    } else {
      violations.push(`${rel} contains a secret: ${redactions.join(', ')} (run with --redact to fix)`);
    }
  }

  if (violations.length > 0) {
    return { ok: false, violations, sessionDir, redactedFiles };
  }

  if (options.check) {
    log(chalk.green(`  ✓ ${dirName} passes finalize checks (--check — nothing written)`));
    return { ok: true, violations: [], sessionDir, redactedFiles };
  }

  // stats is guaranteed defined here: an undefined stats always pushes a violation above.
  const finalStats = stats as SessionMetrics;
  const kind = finalStats.kind ?? parsedDirName?.kind ?? '';

  const indexPath = join(sessionsDir, 'INDEX.md');
  ensureFileWithHeader(indexPath, INDEX_MD_HEADER);
  const bugsOutputDir = resolve(cwd, 'output', 'bugs');
  mkdirSync(bugsOutputDir, { recursive: true });
  const allBugsPath = join(bugsOutputDir, 'all-bugs.md');
  ensureFileWithHeader(allBugsPath, ALL_BUGS_MD_HEADER);

  const appendIndexRow = tableRowAppender(indexPath, INDEX_COLUMNS, 'INDEX.md', log);
  let indexRowAdded = false;
  if (!tableRowsText(indexPath).some((t) => t.includes(`${dirName}/`))) {
    appendIndexRow({
      date: finalStats.date,
      kind,
      target: finalStats.target,
      bugs: String(finalStats.bugs_found),
      duration: `${finalStats.duration_min} min`,
      status: 'complete',
      report: `${dirName}/session-report.md`,
    });
    indexRowAdded = true;
  }

  const parsedSession = await parseSession(sessionDir);
  const bugs = [...parsedSession.bugs].sort((a, b) => a.id.localeCompare(b.id));
  const existingBugRows = readAllBugsRows(allBugsPath);
  const existingBugRowsText = tableRowsText(allBugsPath);
  const appendBugRow = tableRowAppender(allBugsPath, ALL_BUGS_COLUMNS, 'all-bugs.md', log);
  const bugRowsAdded: string[] = [];
  for (const bug of bugs) {
    const reportPath = `${dirName}/bugs/${bug.id}.md`;
    // Either identification is enough: the id/session pair under the current columns,
    // the report path under a layout that names them differently.
    if (existingBugRows.some((r) => r.id === bug.id && r.session === dirName)) continue;
    if (existingBugRowsText.some((t) => t.includes(reportPath))) continue;
    const title = bug.component ? `[${bug.component}] ${bug.title}` : bug.title;
    const severity = bug.severity.charAt(0).toUpperCase() + bug.severity.slice(1);
    appendBugRow({
      id: bug.id,
      session: dirName,
      title,
      severity,
      status: 'open',
      report: reportPath,
    });
    bugRowsAdded.push(bug.id);
  }

  warnSplitTable(indexPath, 'INDEX.md', log);
  warnSplitTable(allBugsPath, 'all-bugs.md', log);

  if (appendSessionMetricsDeduped(resolve(cwd, 'output'), finalStats)) {
    log(chalk.green('  ✓ Metrics appended to output/metrics.jsonl'));
  }

  const progressPath = join(sessionDir, 'progress.json');
  if (existsSync(progressPath)) {
    try {
      const progress = JSON.parse(readFileSync(progressPath, 'utf-8')) as Record<string, unknown>;
      progress.status = 'complete';
      writeFileSync(progressPath, `${JSON.stringify(progress, null, 2)}\n`);
    } catch {
      // Malformed progress.json — leave it untouched rather than corrupt it further.
    }
  }

  log(chalk.green(`  ✓ ${dirName} finalized`));
  if (indexRowAdded) log(chalk.white('    INDEX.md row appended'));
  if (bugRowsAdded.length) log(chalk.white(`    all-bugs.md rows appended: ${bugRowsAdded.join(', ')}`));

  return { ok: true, violations: [], sessionDir, redactedFiles, indexRowAdded, bugRowsAdded };
}

function ensureFileWithHeader(path: string, header: string): void {
  if (existsSync(path)) return;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, header);
}

// ─── index tables ───────────────────────────────────────────────────
//
// A project initialised by an earlier version has an INDEX.md / all-bugs.md whose
// header predates the current column set. Appending a row built from the current
// columns would make that row wider than its header, and every value in it would
// then be read back under the wrong column name. Rows are written in the layout
// the file already has instead; existing rows are never widened or rewritten.

/** The header cells of the first markdown table in `path`, or null if there is none. */
function readTableHeaders(path: string): string[] | null {
  if (!existsSync(path)) return null;
  return parseMarkdownTable(readFileSync(path, 'utf-8'))?.headers ?? null;
}

function isTableLine(line: string): boolean {
  return line.trim().startsWith('|');
}

/** A separator line — cells made only of dashes, colons and spaces. */
function isSeparatorLine(line: string): boolean {
  const t = line.trim();
  return t.startsWith('|') && /^[|\s:-]+$/.test(t) && t.includes('--');
}

/** A row with nothing in any cell, which a markdown reader skips. */
function isEmptyRowLine(line: string): boolean {
  return /^[|\s]+$/.test(line.trim());
}

/**
 * The span of the first table: its header line, and the line the table ends
 * before. A heading closes it, so a second table further down the file — under
 * its own heading — is never read or rewritten as part of this one.
 */
function tableBounds(lines: string[]): { headerIdx: number; endIdx: number } {
  let headerIdx = -1;
  for (let i = 0; i < lines.length - 1; i++) {
    if (isTableLine(lines[i]) && isSeparatorLine(lines[i + 1])) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return { headerIdx, endIdx: lines.length };
  let endIdx = lines.length;
  for (let i = headerIdx + 2; i < lines.length; i++) {
    if (/^#{1,6}\s/.test(lines[i])) {
      endIdx = i;
      break;
    }
  }
  return { headerIdx, endIdx };
}

/**
 * Every data row line of the table, in every block — header, separators and empty
 * rows excluded. A parser stops at the first blank line, this does not.
 */
function tableRowLines(lines: string[]): { index: number; text: string }[] {
  const { headerIdx, endIdx } = tableBounds(lines);
  if (headerIdx === -1) return [];
  const out: { index: number; text: string }[] = [];
  for (let i = headerIdx + 1; i < endIdx; i++) {
    const line = lines[i];
    if (!isTableLine(line) || isSeparatorLine(line) || isEmptyRowLine(line)) continue;
    out.push({ index: i, text: line });
  }
  return out;
}

/**
 * Every data row of the table in `path`, for reference checks. Read line by line
 * rather than through the parser, so a row below a blank line still counts as
 * present — otherwise finalize would append a second copy of it.
 */
function tableRowsText(path: string): string[] {
  if (!existsSync(path)) return [];
  return tableRowLines(readFileSync(path, 'utf-8').split('\n')).map((r) => r.text);
}

/**
 * Returns an appender that writes rows into `path` in that file's own column
 * order, keyed by lower-cased column name. The header is read on the first
 * write, and a layout that is not the canonical one is reported once.
 */
function tableRowAppender(
  path: string,
  columns: readonly string[],
  label: string,
  log: Log,
): (values: Record<string, string>) => void {
  let headers: string[] | undefined;
  return (values) => {
    if (!headers) {
      headers = readTableHeaders(path) ?? [...columns];
      if (!headersMatchColumns(headers, columns)) {
        const missing = missingColumns(headers, columns);
        const detail = missing.length
          ? `an older column set (no ${missing.join(', ')})`
          : 'a different column set';
        log(chalk.yellow(`  ○ ${label} uses ${detail}; row written in that layout`));
      }
    }
    insertTableRow(path, buildTableRow(headers, values));
  };
}

/**
 * Writes `row` directly after the last table line in the file. A table a person
 * has split into blocks with blank lines gains the row inside its last block
 * instead of below the blank lines at end of file, where no reader would reach
 * it. On a file whose table runs to the end this writes the same bytes as an
 * append.
 */
function insertTableRow(path: string, row: string): void {
  if (!existsSync(path)) {
    appendFileSync(path, `${row}\n`);
    return;
  }
  const lines = readFileSync(path, 'utf-8').split('\n');
  const { headerIdx, endIdx } = tableBounds(lines);
  let last = -1;
  for (let i = headerIdx === -1 ? 0 : headerIdx; i < endIdx; i++) {
    if (isTableLine(lines[i])) last = i;
  }
  if (last === -1) {
    appendFileSync(path, `${row}\n`);
    return;
  }
  lines.splice(last + 1, 0, row);
  writeFileSync(path, lines.join('\n'));
}

// ─── split tables ───────────────────────────────────────────────────
//
// A hand-maintained index can carry blank lines between its rows, which splits
// one markdown table into several one-row blocks. A reader stops at the first
// blank line, so the rows under it are on disk and invisible: `list sessions`
// undercounts and a finalized session reads back as unindexed. Finalize reports
// the gap; `session repair-index` closes it.

interface SplitTableReport {
  /** Data rows in the file, in every block. */
  total: number;
  /** Data rows a markdown reader reaches. */
  visible: number;
  /** Line indices of the blank lines that sit strictly between two table lines. */
  blankLines: number[];
}

function nonBlankNeighbour(lines: string[], from: number, step: -1 | 1): number {
  for (let i = from + step; i >= 0 && i < lines.length; i += step) {
    if (lines[i].trim() !== '') return i;
  }
  return -1;
}

function analyseTable(content: string): SplitTableReport {
  const lines = content.split('\n');
  const { headerIdx, endIdx } = tableBounds(lines);
  if (headerIdx === -1) return { total: 0, visible: 0, blankLines: [] };

  const blankLines: number[] = [];
  for (let i = headerIdx + 1; i < endIdx; i++) {
    if (lines[i].trim() !== '') continue;
    // Removable only with a table line on both sides: a blank line before the
    // table, after it, or between the title and the header stays where it is.
    const prev = nonBlankNeighbour(lines, i, -1);
    const next = nonBlankNeighbour(lines, i, 1);
    if (prev >= headerIdx && next !== -1 && isTableLine(lines[prev]) && isTableLine(lines[next])) {
      blankLines.push(i);
    }
  }

  return {
    total: tableRowLines(lines).length,
    visible: parseMarkdownTable(content)?.rows.length ?? 0,
    blankLines,
  };
}

/** Reports rows a reader cannot see, once per file, with counts taken from disk. */
function warnSplitTable(path: string, label: string, log: Log): void {
  if (!existsSync(path)) return;
  const report = analyseTable(readFileSync(path, 'utf-8'));
  const hidden = report.total - report.visible;
  if (hidden <= 0) return;
  log(
    chalk.yellow(
      `  ○ ${label} has ${hidden} row(s) outside the first table block (blank lines split it); ` +
        `readers see ${report.visible} of ${report.total} — run \`qualiow session repair-index\``,
    ),
  );
}

// ─── repair-index ───────────────────────────────────────────────────

export interface RepairedIndexFile {
  file: string;
  /** Blank lines sitting between two table rows. */
  blankLines: number;
  /** Rows a reader cannot currently see. */
  hiddenRows: number;
  repaired: boolean;
}

export interface SessionRepairIndexResult {
  ok: boolean;
  dryRun: boolean;
  files: RepairedIndexFile[];
}

/**
 * Removes the blank lines that sit strictly between two rows of the same table,
 * and nothing else: row text is never reflowed, re-aligned, re-ordered or
 * rewritten, and a row with a stray pipe in it survives byte for byte.
 */
export function runSessionRepairIndex(
  options: { yes?: boolean },
  ctx: { cwd: string; log?: Log },
): SessionRepairIndexResult {
  const cwd = ctx.cwd;
  const log = ctx.log ?? defaultLog;
  const targets = [
    { path: resolve(cwd, 'output', 'sessions', 'INDEX.md'), label: 'INDEX.md' },
    { path: resolve(cwd, 'output', 'bugs', 'all-bugs.md'), label: 'all-bugs.md' },
  ];

  const files: RepairedIndexFile[] = [];
  for (const { path, label } of targets) {
    if (!existsSync(path)) continue;
    const content = readFileSync(path, 'utf-8');
    const report = analyseTable(content);
    const hiddenRows = Math.max(report.total - report.visible, 0);
    const blankLines = report.blankLines.length;

    if (blankLines === 0) {
      log(chalk.green(`  ✓ ${label}: nothing to repair`));
      files.push({ file: label, blankLines, hiddenRows: 0, repaired: false });
      continue;
    }

    if (!options.yes) {
      log(
        chalk.cyan(
          `  ${label}: ${blankLines} blank line(s) between table rows; ${hiddenRows} row(s) would become visible`,
        ),
      );
      files.push({ file: label, blankLines, hiddenRows, repaired: false });
      continue;
    }

    const drop = new Set(report.blankLines);
    writeFileSync(path, content.split('\n').filter((_, i) => !drop.has(i)).join('\n'));
    log(
      chalk.green(
        `  ✓ ${label}: removed ${blankLines} blank line(s) between table rows; ${hiddenRows} row(s) now visible`,
      ),
    );
    files.push({ file: label, blankLines, hiddenRows, repaired: true });
  }

  if (files.length === 0) {
    log(chalk.yellow('  No output/sessions/INDEX.md or output/bugs/all-bugs.md found.'));
  } else if (!options.yes && files.some((f) => f.blankLines > 0)) {
    log(chalk.white('  Re-run with --yes to rewrite.'));
  }

  return { ok: true, dryRun: !options.yes, files };
}

interface AllBugsRow {
  id: string;
  session: string;
  title: string;
  severity: string;
  status: string;
  report: string;
}

function readAllBugsRows(path: string): AllBugsRow[] {
  if (!existsSync(path)) return [];
  const table = parseMarkdownTable(readFileSync(path, 'utf-8'));
  if (!table) return [];
  return table.rows
    .map((r) => ({
      id: r['id'] ?? '',
      session: r['session'] ?? '',
      title: r['title'] ?? '',
      severity: r['severity'] ?? '',
      status: r['status'] ?? '',
      report: r['report'] ?? '',
    }))
    .filter((r) => r.id);
}

function listFilesRecursive(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listFilesRecursive(full));
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

// ─── archive ────────────────────────────────────────────────────────

export interface SessionArchiveResult {
  ok: boolean;
  sessionDir: string;
  tarPath: string;
  removed: boolean;
}

export function runSessionArchive(
  dir: string,
  options: { remove?: boolean },
  ctx: { cwd: string; log?: Log },
): SessionArchiveResult {
  const cwd = ctx.cwd;
  const log = ctx.log ?? defaultLog;
  const sessionsDir = resolve(cwd, 'output', 'sessions');
  if (!existsSync(sessionsDir)) {
    throw new Error('No output/sessions directory found. Run `npx qualiow init` first.');
  }

  const sessionDir = resolveSessionDir(sessionsDir, dir);
  const dirName = basename(sessionDir);
  const tarPath = join(sessionsDir, `${dirName}.tar.gz`);

  execFileSync('tar', ['-czf', tarPath, '-C', sessionsDir, dirName]);
  log(chalk.green(`  ✓ Archived ${dirName} → ${relative(cwd, tarPath)}`));

  let removed = false;
  if (options.remove) {
    rmSync(sessionDir, { recursive: true, force: true });
    setIndexRowStatus(join(sessionsDir, 'INDEX.md'), dirName, 'archived');
    removed = true;
    log(chalk.green(`  ✓ Removed ${dirName} (INDEX.md row marked archived)`));
  }

  return { ok: true, sessionDir, tarPath, removed };
}

function setIndexRowStatus(indexPath: string, dirName: string, status: string): void {
  if (!existsSync(indexPath)) return;
  // The Status cell is located from the file's own header: its position differs in
  // an index written before the Kind column existed.
  const headers = readTableHeaders(indexPath) ?? [...INDEX_COLUMNS];
  const statusIdx = headers.findIndex((h) => h.trim().toLowerCase() === 'status');
  if (statusIdx === -1) return;
  const lines = readFileSync(indexPath, 'utf-8').split('\n');
  const updated = lines.map((line) => {
    if (!line.trim().startsWith('|')) return line;
    if (!line.includes(`${dirName}/`)) return line;
    const cells = line.split('|');
    if (cells.length < 3) return line;
    const inner = cells.slice(1, -1).map((c) => c.trim());
    if (inner.length <= statusIdx) return line;
    inner[statusIdx] = status;
    return `| ${inner.join(' | ')} |`;
  });
  writeFileSync(indexPath, updated.join('\n'));
}

// ─── delete ─────────────────────────────────────────────────────────

export interface SessionDeleteResult {
  ok: boolean;
  dryRun: boolean;
  sessionDir: string;
  fileCount: number;
  totalBytes: number;
  indexRows: number;
  bugRows: number;
}

export function runSessionDelete(
  dir: string,
  options: { yes?: boolean },
  ctx: { cwd: string; log?: Log },
): SessionDeleteResult {
  const cwd = ctx.cwd;
  const log = ctx.log ?? defaultLog;
  const sessionsDir = resolve(cwd, 'output', 'sessions');
  if (!existsSync(sessionsDir)) {
    throw new Error('No output/sessions directory found. Run `npx qualiow init` first.');
  }

  const sessionDir = resolveSessionDir(sessionsDir, dir);
  const dirName = basename(sessionDir);
  const { fileCount, totalBytes } = dirStats(sessionDir);

  const indexPath = join(sessionsDir, 'INDEX.md');
  const allBugsPath = resolve(cwd, 'output', 'bugs', 'all-bugs.md');
  // Counted by reference rather than by column name, so the numbers hold on an
  // index whose header predates the current column set.
  const indexRows = tableRowsText(indexPath).filter((t) => t.includes(`${dirName}/`));
  const bugRows = tableRowsText(allBugsPath).filter((t) => t.includes(`${dirName}/bugs/`));

  if (!options.yes) {
    log(chalk.cyan(`\nDry run — would delete ${dirName}`));
    log(chalk.white(`  Files: ${fileCount}  Size: ${formatBytes(totalBytes)}`));
    log(chalk.white(`  INDEX.md rows to remove: ${indexRows.length}`));
    log(chalk.white(`  all-bugs.md rows to remove: ${bugRows.length}`));
    log(chalk.white('  Re-run with --yes to delete.\n'));
    return {
      ok: true,
      dryRun: true,
      sessionDir,
      fileCount,
      totalBytes,
      indexRows: indexRows.length,
      bugRows: bugRows.length,
    };
  }

  performDelete(cwd, sessionDir);
  log(chalk.green(`  ✓ Deleted ${dirName} (${fileCount} files, ${formatBytes(totalBytes)})`));

  return {
    ok: true,
    dryRun: false,
    sessionDir,
    fileCount,
    totalBytes,
    indexRows: indexRows.length,
    bugRows: bugRows.length,
  };
}

function performDelete(cwd: string, sessionDir: string): void {
  const dirName = basename(sessionDir);
  rmSync(sessionDir, { recursive: true, force: true });
  removeTableRows(join(cwd, 'output', 'sessions', 'INDEX.md'), (line) =>
    line.includes(`${dirName}/session-report.md`),
  );
  removeTableRows(join(cwd, 'output', 'bugs', 'all-bugs.md'), (line) => line.includes(`${dirName}/bugs/`));
}

function removeTableRows(filePath: string, matches: (line: string) => boolean): void {
  if (!existsSync(filePath)) return;
  const lines = readFileSync(filePath, 'utf-8').split('\n');
  const sepIdx = lines.findIndex((l) => /^\|(\s*:?-{2,}\s*\|)+\s*$/.test(l.trim()));
  if (sepIdx === -1) return;
  const head = lines.slice(0, sepIdx + 1);
  const rest = lines.slice(sepIdx + 1).filter((l) => !matches(l));
  writeFileSync(filePath, [...head, ...rest].join('\n'));
}

function dirStats(dir: string): { fileCount: number; totalBytes: number } {
  let fileCount = 0;
  let totalBytes = 0;
  for (const file of listFilesRecursive(dir)) {
    fileCount++;
    totalBytes += statSync(file).size;
  }
  return { fileCount, totalBytes };
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── prune ──────────────────────────────────────────────────────────

export interface SessionPruneResult {
  ok: boolean;
  dryRun: boolean;
  candidates: string[];
}

export function runSessionPrune(
  options: { olderThan: string | number; yes?: boolean },
  ctx: { cwd: string; log?: Log; now?: Date },
): SessionPruneResult {
  const cwd = ctx.cwd;
  const log = ctx.log ?? defaultLog;
  const now = ctx.now ?? new Date();

  const days = typeof options.olderThan === 'string' ? Number(options.olderThan) : options.olderThan;
  if (!Number.isFinite(days) || days < 0) {
    throw new Error(`--older-than must be a non-negative number of days (got "${options.olderThan}")`);
  }

  const sessionsDir = resolve(cwd, 'output', 'sessions');
  if (!existsSync(sessionsDir)) {
    throw new Error('No output/sessions directory found. Run `npx qualiow init` first.');
  }

  const thresholdMs = days * 24 * 60 * 60 * 1000;
  // Directories named before the current scheme are discovered too: a project
  // upgraded from an earlier version has output that would otherwise be unprunable.
  const dirs = readdirSync(sessionsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => describeSessionDir(d.name))
    .filter((d): d is DiscoveredSessionDir => d !== null)
    .sort((a, b) => a.name.localeCompare(b.name));

  const selected = dirs.filter((d) => now.getTime() - d.timestamp.getTime() > thresholdMs);
  const candidates = selected.map((d) => d.name);

  if (!options.yes) {
    log(chalk.cyan(`\nDry run — ${candidates.length} session(s) older than ${days} day(s):`));
    for (const d of selected) {
      log(chalk.white(`  ${d.name}${d.legacy ? '  (legacy name)' : ''}`));
    }
    if (!candidates.length) log(chalk.white('  (none)'));
    log('');
    return { ok: true, dryRun: true, candidates };
  }

  for (const d of selected) {
    performDelete(cwd, join(sessionsDir, d.name));
    log(chalk.green(`  ✓ Deleted ${d.name}${d.legacy ? '  (legacy name)' : ''}`));
  }

  return { ok: true, dryRun: false, candidates };
}
