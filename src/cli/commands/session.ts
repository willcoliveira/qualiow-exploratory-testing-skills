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
import { parseSessionDirName, SESSION_DIR_RE } from '../../utils/session-dir.js';
import { hasConfidentialityHeader } from '../../utils/confidentiality.js';
import { containsSecrets, redact } from '../../utils/redact.js';
import { ALL_BUGS_MD_HEADER, INDEX_COLUMNS, INDEX_MD_HEADER } from '../../utils/index-files.js';
import { parseMarkdownTable } from '../../utils/markdown-table.js';
import { readSessionIndex } from './list.js';
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

  let indexRowAdded = false;
  const existingIndexRows = readSessionIndex(indexPath);
  if (!existingIndexRows.some((r) => r.report.includes(`${dirName}/`))) {
    const row =
      `| ${finalStats.date} | ${kind} | ${finalStats.target} | ${finalStats.bugs_found} | ` +
      `${finalStats.duration_min} min | complete | ${dirName}/session-report.md |\n`;
    appendFileSync(indexPath, row);
    indexRowAdded = true;
  }

  const parsedSession = await parseSession(sessionDir);
  const bugs = [...parsedSession.bugs].sort((a, b) => a.id.localeCompare(b.id));
  const existingBugRows = readAllBugsRows(allBugsPath);
  const bugRowsAdded: string[] = [];
  for (const bug of bugs) {
    if (existingBugRows.some((r) => r.id === bug.id && r.session === dirName)) continue;
    const title = bug.component ? `[${bug.component}] ${bug.title}` : bug.title;
    const severity = bug.severity.charAt(0).toUpperCase() + bug.severity.slice(1);
    const row = `| ${bug.id} | ${dirName} | ${title} | ${severity} | open | ${dirName}/bugs/${bug.id}.md |\n`;
    appendFileSync(allBugsPath, row);
    bugRowsAdded.push(bug.id);
  }

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
  const statusIdx = INDEX_COLUMNS.indexOf('Status');
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
  const indexRows = readSessionIndex(indexPath).filter((r) => r.report.includes(`${dirName}/`));
  const bugRows = readAllBugsRows(allBugsPath).filter((r) => r.session === dirName);

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
  const dirs = readdirSync(sessionsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && SESSION_DIR_RE.test(d.name))
    .map((d) => d.name)
    .sort();

  const candidates = dirs.filter((name) => {
    const parsed = parseSessionDirName(name);
    if (!parsed) return false;
    const dirDate = timestampToDate(parsed.timestamp);
    return now.getTime() - dirDate.getTime() > thresholdMs;
  });

  if (!options.yes) {
    log(chalk.cyan(`\nDry run — ${candidates.length} session(s) older than ${days} day(s):`));
    for (const c of candidates) log(chalk.white(`  ${c}`));
    if (!candidates.length) log(chalk.white('  (none)'));
    log('');
    return { ok: true, dryRun: true, candidates };
  }

  for (const name of candidates) {
    performDelete(cwd, join(sessionsDir, name));
    log(chalk.green(`  ✓ Deleted ${name}`));
  }

  return { ok: true, dryRun: false, candidates };
}

function timestampToDate(ts: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})$/.exec(ts);
  if (!m) return new Date(NaN);
  const [, y, mo, d, h, mi] = m;
  return new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi));
}
