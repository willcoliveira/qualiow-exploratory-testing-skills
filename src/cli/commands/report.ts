import { Command } from 'commander';
import { resolve, join, basename, relative, dirname, isAbsolute, sep } from 'node:path';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import chalk from 'chalk';
import { generateHtmlReport } from '../../formatters/html-report.js';
import { generateJsonReport } from '../../formatters/json-report.js';
import { generateJiraExport } from '../../formatters/jira-export.js';
import { generateMarkdownSummary } from '../../formatters/markdown-summary.js';
import { SESSION_DIR_RE } from '../../utils/session-dir.js';
import { SessionMetricsSchema } from '../../schemas/session-metrics.schema.js';
import { appendSessionMetricsDeduped } from '../../utils/metrics.js';

export interface ReportOptions {
  session: string;
  format: string;
  output?: string;
  stdout: boolean;
}

export function reportCommand(): Command {
  const cmd = new Command('report')
    .description('Generate a report (md summary, html, json or jira csv) from a session')
    .option('-s, --session <id>', 'Session directory name, a unique substring, or "latest"', 'latest')
    .option('-f, --format <format>', 'Output format: md, html, json, jira', 'md')
    .option('-o, --output <file>', 'Write to this file under output/ instead of the session directory')
    .option('--stdout', 'Print to stdout instead of writing a file', false)
    .action(async (options: ReportOptions) => {
      try {
        await runReport(options, { cwd: process.cwd() });
      } catch (err) {
        console.error(chalk.red('Error:'), err instanceof Error ? err.message : err);
        process.exit(1);
      }
    });
  return cmd;
}

const DEFAULT_FILENAMES: Record<string, string> = {
  md: 'session-summary.md',
  html: 'session-report.html',
  json: 'session-report.json',
  jira: 'jira-export.csv',
};

export async function runReport(
  options: ReportOptions,
  ctx: { cwd: string; log?: (line: string) => void },
): Promise<{ outputPath?: string; content: string }> {
  const cwd = ctx.cwd;
  const log = ctx.log ?? ((line: string) => console.log(line));
  const sessionsDir = resolve(cwd, 'output', 'sessions');

  if (!existsSync(sessionsDir)) {
    throw new Error('No output/sessions directory found. Run `npx qualiow init` first.');
  }

  const sessionDir = resolveSessionDir(sessionsDir, options.session);
  const sessionName = basename(sessionDir);
  const format = options.format.toLowerCase();

  let content: string;
  switch (format) {
    case 'md':
      content = await generateMarkdownSummary(sessionDir);
      break;
    case 'html':
      content = await generateHtmlReport(sessionDir);
      break;
    case 'json':
      content = JSON.stringify(await generateJsonReport(sessionDir), null, 2);
      break;
    case 'jira':
      content = await generateJiraExport(sessionDir);
      break;
    default:
      throw new Error(`Unknown format: "${format}". Choose from: md, html, json, jira`);
  }

  if (options.stdout) {
    process.stdout.write(content.endsWith('\n') ? content : content + '\n');
    return { content };
  }

  const outputPath = options.output
    ? resolveReportOutputPath(cwd, options.output)
    : join(sessionDir, DEFAULT_FILENAMES[format]);
  writeFileSync(outputPath, content);
  log(chalk.cyan(`\nSession: ${sessionName}`));
  log(chalk.green(`  ${format.toUpperCase()} written: ${relative(cwd, outputPath)}`));

  // Record metrics once per session when the skill produced a valid stats.json.
  const statsPath = join(sessionDir, 'stats.json');
  if (existsSync(statsPath)) {
    try {
      const stats = SessionMetricsSchema.parse(JSON.parse(readFileSync(statsPath, 'utf-8')));
      if (appendSessionMetricsDeduped(resolve(cwd, 'output'), stats)) {
        log(chalk.green('  ✓ Metrics appended to output/metrics.jsonl'));
      }
    } catch {
      log(chalk.yellow('  ⚠ stats.json present but not in the expected shape — metrics not recorded'));
    }
  }
  log('');

  return { outputPath, content };
}

function isInside(root: string, path: string): boolean {
  return path === root || path.startsWith(root + sep);
}

/**
 * Where `-o <file>` may write: somewhere under `<cwd>/output/`, never elsewhere.
 * `qualiow` runs pre-approved, so an unconfined path would let any prompt that
 * reaches the model overwrite any file the user can write. A relative path is
 * taken from `output/` (a leading `output/` is accepted as well, so
 * `-o report.html` and `-o output/report.html` land in the same place); an
 * absolute path must already be inside it, and `..` is refused outright. The check is repeated on real paths,
 * so a symlinked directory under output/ cannot lead out of it, and an existing
 * symlink is never written through.
 */
export function resolveReportOutputPath(cwd: string, requested: string): string {
  const outputRoot = resolve(cwd, 'output');
  const fromCwd = resolve(cwd, requested);
  const candidate = isAbsolute(requested) || isInside(outputRoot, fromCwd)
    ? fromCwd
    : resolve(outputRoot, requested);
  const refuse = (why: string): never => {
    throw new Error(`Refusing to write the report to "${requested}": ${why}. Use a path under output/.`);
  };

  if (requested.split(/[\\/]/).includes('..')) refuse('it contains a ".." segment');
  if (!isInside(outputRoot, candidate) || candidate === outputRoot) {
    refuse('it is outside output/');
  }

  // The nearest directory that exists must really be inside output/ before any
  // missing parent is created under it.
  const realRoot = realpathSync(outputRoot);
  let ancestor = dirname(candidate);
  while (!existsSync(ancestor)) ancestor = dirname(ancestor);
  if (!isInside(realRoot, realpathSync(ancestor))) refuse('a directory on the way is a link out of output/');
  mkdirSync(dirname(candidate), { recursive: true });
  if (!isInside(realRoot, realpathSync(dirname(candidate)))) refuse('a directory on the way is a link out of output/');

  let existing: ReturnType<typeof lstatSync> | undefined;
  try {
    existing = lstatSync(candidate);
  } catch {
    existing = undefined;
  }
  if (existing?.isSymbolicLink()) refuse('it is a symbolic link');
  if (existing && !existing.isFile()) refuse('it is not a regular file');

  return candidate;
}

/**
 * Resolves `latest`, an exact directory name, a unique substring match, or a
 * path to a directory directly under `output/sessions/` (`output/sessions/<dir>`,
 * relative to the project, or absolute) — the form the session skills pass.
 * Throws when nothing matches or when a substring matches more than one session.
 */
export function resolveSessionDir(sessionsDir: string, requested: string): string {
  // A tab-completed directory name ends in a slash; it names the same session.
  const sessionId = requested.length > 1 ? requested.replace(/[\\/]+$/, '') : requested;
  const dirs = readdirSync(sessionsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  if (/[\\/]/.test(sessionId)) {
    // A path: exact match only, and only one level below output/sessions/.
    const projectRoot = dirname(dirname(resolve(sessionsDir)));
    const abs = resolve(projectRoot, sessionId);
    const name = basename(abs);
    if (dirname(abs) !== resolve(sessionsDir) || !dirs.includes(name)) {
      throw new Error(
        `"${sessionId}" is not a session directory directly under output/sessions/. ` +
          'List them with: npx qualiow list sessions',
      );
    }
    return join(sessionsDir, name);
  }

  if (sessionId === 'latest') {
    const canonical = dirs.filter((d) => SESSION_DIR_RE.test(d));
    const pool = canonical.length ? canonical : dirs;
    if (pool.length === 0) throw new Error('No sessions found. Run an exploratory testing session first.');
    return join(sessionsDir, pool[pool.length - 1]);
  }

  if (dirs.includes(sessionId)) return join(sessionsDir, sessionId);

  const matches = dirs.filter((d) => d.includes(sessionId));
  if (matches.length === 1) return join(sessionsDir, matches[0]);
  if (matches.length > 1) {
    throw new Error(
      `"${sessionId}" matches ${matches.length} sessions — be more specific:\n  ${matches.join('\n  ')}`,
    );
  }
  throw new Error(`No session matches "${sessionId}". List them with: npx qualiow list sessions`);
}
