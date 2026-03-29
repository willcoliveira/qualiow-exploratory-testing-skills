import { Command } from 'commander';
import { resolve, join, basename } from 'node:path';
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import chalk from 'chalk';
import { generateHtmlReport } from '../../formatters/html-report.js';
import { generateJsonReport } from '../../formatters/json-report.js';
import { generateJiraExport } from '../../formatters/jira-export.js';

export function reportCommand(): Command {
  const cmd = new Command('report')
    .description('Generate a report from a session')
    .option('-s, --session <id>', 'Session ID or "latest"', 'latest')
    .option('-f, --format <format>', 'Output format: md, html, json, jira', 'md')
    .action(async (options) => {
      try {
        await runReport(options);
      } catch (err) {
        console.error(chalk.red('Error:'), err instanceof Error ? err.message : err);
        process.exit(1);
      }
    });
  return cmd;
}

async function runReport(options: { session: string; format: string }): Promise<void> {
  const cwd = process.cwd();
  const sessionsDir = resolve(cwd, 'output', 'sessions');

  if (!existsSync(sessionsDir)) {
    console.error(chalk.red('No sessions directory found. Run `npx qualiow init` first.'));
    process.exit(1);
  }

  // Resolve session directory
  const sessionDir = resolveSessionDir(sessionsDir, options.session);
  if (!sessionDir) {
    console.error(chalk.red('No session found. Run an exploratory testing session first.'));
    process.exit(1);
  }

  const sessionName = basename(sessionDir);
  console.log(chalk.cyan(`\nSession: ${sessionName}`));

  const format = options.format.toLowerCase();

  switch (format) {
    case 'md': {
      const reportPath = join(sessionDir, 'session-report.md');
      if (existsSync(reportPath)) {
        console.log(chalk.green(`\n  Report: ${reportPath}`));
      } else {
        console.log(chalk.yellow('  No session-report.md found in this session.'));
      }
      break;
    }

    case 'html': {
      const html = await generateHtmlReport(sessionDir);
      const outputPath = join(sessionDir, 'session-report.html');
      writeFileSync(outputPath, html);
      console.log(chalk.green(`\n  HTML report saved: ${outputPath}`));
      break;
    }

    case 'json': {
      const data = await generateJsonReport(sessionDir);
      const outputPath = join(sessionDir, 'session-report.json');
      writeFileSync(outputPath, JSON.stringify(data, null, 2));
      console.log(chalk.green(`\n  JSON report saved: ${outputPath}`));
      break;
    }

    case 'jira': {
      const csv = await generateJiraExport(sessionDir);
      const outputPath = join(sessionDir, 'jira-export.csv');
      writeFileSync(outputPath, csv);
      console.log(chalk.green(`\n  Jira export saved: ${outputPath}`));
      break;
    }

    default:
      console.error(chalk.red(`Unknown format: "${format}". Choose from: md, html, json, jira`));
      process.exit(1);
  }

  console.log('');
}

function resolveSessionDir(sessionsDir: string, sessionId: string): string | null {
  if (sessionId === 'latest') {
    const dirs = readdirSync(sessionsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();

    if (dirs.length === 0) return null;
    return join(sessionsDir, dirs[dirs.length - 1]);
  }

  // Try exact match first
  const exactPath = join(sessionsDir, sessionId);
  if (existsSync(exactPath)) {
    return exactPath;
  }

  // Try partial match (prefix)
  const dirs = readdirSync(sessionsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.includes(sessionId))
    .map((d) => d.name)
    .sort();

  if (dirs.length > 0) {
    return join(sessionsDir, dirs[dirs.length - 1]);
  }

  return null;
}
