import { Command } from 'commander';
import { resolve, join } from 'node:path';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import chalk from 'chalk';
import type {
  KnowledgeManifest,
  TargetConfig,
  DomainConfig,
} from '../../types/index.js';

export function listCommand(): Command {
  const cmd = new Command('list')
    .description('List sessions, knowledge, targets, or domains')
    .argument('<type>', 'What to list: sessions, knowledge, targets, domains')
    .action(async (type: string) => {
      try {
        await runList(type);
      } catch (err) {
        console.error(chalk.red('Error:'), err instanceof Error ? err.message : err);
        process.exit(1);
      }
    });
  return cmd;
}

async function runList(type: string): Promise<void> {
  const cwd = process.cwd();

  switch (type) {
    case 'sessions':
      listSessions(cwd);
      break;
    case 'knowledge':
      listKnowledge(cwd);
      break;
    case 'targets':
      listTargets(cwd);
      break;
    case 'domains':
      listDomains(cwd);
      break;
    default:
      console.error(chalk.red(`Unknown type: "${type}". Choose from: sessions, knowledge, targets, domains`));
      process.exit(1);
  }
}

function listSessions(cwd: string): void {
  const indexPath = resolve(cwd, 'output', 'sessions', 'INDEX.md');
  if (!existsSync(indexPath)) {
    console.log(chalk.yellow('No sessions found. Run `npx qualiow init` first, then start a session.'));
    return;
  }

  const content = readFileSync(indexPath, 'utf-8');
  const lines = content.split('\n');

  // Find table rows (lines that start with | and are not the header separator)
  const tableRows = lines.filter(
    (line) =>
      line.startsWith('|') &&
      !line.startsWith('|---') &&
      !line.startsWith('| Date') &&
      line.trim() !== '',
  );

  if (tableRows.length === 0) {
    console.log(chalk.cyan('\nSessions:'));
    console.log(chalk.yellow('  No sessions recorded yet.'));
    console.log(chalk.white('  Start one with: npx qualiow explore <url>'));
    return;
  }

  console.log(chalk.cyan.bold('\nSessions:'));
  console.log('');

  // Print as a formatted table
  const header = `  ${pad('Date', 12)} ${pad('Target', 20)} ${pad('Duration', 10)} ${pad('Bugs', 6)} Session Directory`;
  console.log(chalk.bold(header));
  console.log(`  ${'─'.repeat(12)} ${'─'.repeat(20)} ${'─'.repeat(10)} ${'─'.repeat(6)} ${'─'.repeat(30)}`);

  for (const row of tableRows) {
    const cells = row
      .split('|')
      .map((c) => c.trim())
      .filter((c) => c !== '');
    if (cells.length >= 5) {
      console.log(
        `  ${pad(cells[0], 12)} ${pad(cells[1], 20)} ${pad(cells[2], 10)} ${pad(cells[3], 6)} ${cells[4]}`,
      );
    }
  }

  console.log('');
  console.log(chalk.white(`  Total: ${tableRows.length} session(s)`));
  console.log('');
}

function listKnowledge(cwd: string): void {
  const manifestPath = resolve(cwd, 'data', 'knowledge', 'manifest.yml');
  if (!existsSync(manifestPath)) {
    console.log(chalk.yellow('No knowledge base found. Run `npx qualiow init` first.'));
    return;
  }

  const raw = readFileSync(manifestPath, 'utf-8');
  const manifest = parseYaml(raw) as KnowledgeManifest;

  console.log(chalk.cyan.bold('\nKnowledge Base:'));
  console.log(chalk.white(`  Version: ${manifest.version} | Entries: ${manifest.stats.total_entries}`));
  console.log('');

  // Group entries by type
  const grouped = new Map<string, typeof manifest.entries>();
  for (const entry of manifest.entries) {
    const list = grouped.get(entry.type) ?? [];
    list.push(entry);
    grouped.set(entry.type, list);
  }

  for (const [type, entries] of grouped) {
    console.log(chalk.cyan(`  ${type.charAt(0).toUpperCase() + type.slice(1)}s (${entries.length}):`));
    for (const entry of entries) {
      const priorityColor =
        entry.priority === 'high'
          ? chalk.red
          : entry.priority === 'medium'
            ? chalk.yellow
            : chalk.white;
      const tags = entry.tags.map((t) => chalk.gray(t)).join(', ');
      console.log(
        `    ${priorityColor(`[${entry.priority}]`)} ${entry.id}  ${chalk.gray('tags:')} ${tags}`,
      );
    }
    console.log('');
  }
}

function listTargets(cwd: string): void {
  const targetsDir = resolve(cwd, 'data', 'targets');
  if (!existsSync(targetsDir)) {
    console.log(chalk.yellow('No targets found. Run `npx qualiow init` first.'));
    return;
  }

  const files = readdirSync(targetsDir).filter((f) => f.endsWith('.yml'));
  if (files.length === 0) {
    console.log(chalk.yellow('No target configurations found.'));
    return;
  }

  console.log(chalk.cyan.bold('\nTargets:'));
  console.log('');

  const header = `  ${pad('ID', 22)} ${pad('Name', 35)} ${pad('Domain', 12)} ${pad('Auth', 16)} Base URL`;
  console.log(chalk.bold(header));
  console.log(`  ${'─'.repeat(22)} ${'─'.repeat(35)} ${'─'.repeat(12)} ${'─'.repeat(16)} ${'─'.repeat(30)}`);

  for (const file of files) {
    try {
      const raw = readFileSync(join(targetsDir, file), 'utf-8');
      const target = parseYaml(raw) as TargetConfig;
      console.log(
        `  ${pad(target.id, 22)} ${pad(target.name, 35)} ${pad(target.domain, 12)} ${pad(target.auth.strategy, 16)} ${target.base_url || chalk.gray('(none)')}`,
      );
    } catch {
      console.log(`  ${chalk.red('ERROR')}  Could not parse ${file}`);
    }
  }

  console.log('');
  console.log(chalk.white(`  Total: ${files.length} target(s)`));
  console.log('');
}

function listDomains(cwd: string): void {
  const domainsDir = resolve(cwd, 'data', 'domains');
  if (!existsSync(domainsDir)) {
    console.log(chalk.yellow('No domain configs found. Run `npx qualiow init` first.'));
    return;
  }

  const files = readdirSync(domainsDir).filter((f) => f.endsWith('.yml'));
  if (files.length === 0) {
    console.log(chalk.yellow('No domain configurations found.'));
    return;
  }

  console.log(chalk.cyan.bold('\nDomains:'));
  console.log('');

  const header = `  ${pad('ID', 16)} ${pad('Name', 28)} ${pad('Checklist', 12)} ${pad('Journeys', 10)}`;
  console.log(chalk.bold(header));
  console.log(`  ${'─'.repeat(16)} ${'─'.repeat(28)} ${'─'.repeat(12)} ${'─'.repeat(10)}`);

  for (const file of files) {
    try {
      const raw = readFileSync(join(domainsDir, file), 'utf-8');
      const domain = parseYaml(raw) as DomainConfig;
      const checklistCount = domain.completeness_checklist?.length ?? 0;
      const journeyCount = domain.journeys?.length ?? 0;
      console.log(
        `  ${pad(domain.id, 16)} ${pad(domain.name, 28)} ${pad(String(checklistCount), 12)} ${pad(String(journeyCount), 10)}`,
      );
    } catch {
      console.log(`  ${chalk.red('ERROR')}  Could not parse ${file}`);
    }
  }

  console.log('');
  console.log(chalk.white(`  Total: ${files.length} domain(s)`));
  console.log('');
}

function pad(str: string, len: number): string {
  if (str.length >= len) {
    return str.slice(0, len);
  }
  return str + ' '.repeat(len - str.length);
}
