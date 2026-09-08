import { Command } from 'commander';
import { resolve, join, basename, relative } from 'node:path';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
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
    .option('-o, --output <file>', 'Write to this file instead of the session directory')
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
    ? resolve(cwd, options.output)
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

/**
 * Resolves `latest`, an exact directory name, or a unique substring match.
 * Throws when nothing matches or when a substring matches more than one session.
 */
export function resolveSessionDir(sessionsDir: string, sessionId: string): string {
  const dirs = readdirSync(sessionsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

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
