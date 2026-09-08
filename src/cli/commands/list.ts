import { Command } from 'commander';
import { resolve, join, basename } from 'node:path';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { globSync } from 'glob';
import chalk from 'chalk';
import type { KnowledgeManifest, TargetConfig, DomainConfig } from '../../types/index.js';
import { parseMarkdownTable } from '../../utils/markdown-table.js';
import { INDEX_COLUMNS } from '../../utils/index-files.js';
import { SESSION_DIR_RE } from '../../utils/session-dir.js';

export function listCommand(): Command {
  const cmd = new Command('list')
    .description('List sessions, knowledge, targets, or domains')
    .argument('<type>', 'What to list: sessions, knowledge, targets, domains')
    .action(async (type: string) => {
      try {
        await runList(type, process.cwd());
      } catch (err) {
        console.error(chalk.red('Error:'), err instanceof Error ? err.message : err);
        process.exit(1);
      }
    });
  return cmd;
}

export async function runList(type: string, cwd: string): Promise<void> {
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
      throw new Error(`Unknown type: "${type}". Choose from: sessions, knowledge, targets, domains`);
  }
}

export interface SessionRow {
  date: string;
  kind: string;
  target: string;
  bugs: string;
  duration: string;
  status: string;
  report: string;
}

/** Parses INDEX.md rows, ignoring placeholder rows whose first cell starts with `_`. */
export function readSessionIndex(indexPath: string): SessionRow[] {
  if (!existsSync(indexPath)) return [];
  const table = parseMarkdownTable(readFileSync(indexPath, 'utf-8'));
  if (!table) return [];
  const rows: SessionRow[] = [];
  for (const row of table.rows) {
    const date = row['date'] ?? '';
    if (!date || date.startsWith('_')) continue;
    rows.push({
      date,
      kind: row['kind'] ?? '',
      target: row['target'] ?? '',
      bugs: row['bugs'] ?? '',
      duration: row['duration'] ?? '',
      status: row['status'] ?? '',
      report: row['report'] ?? row['session directory'] ?? '',
    });
  }
  return rows;
}

function listSessions(cwd: string): void {
  const sessionsDir = resolve(cwd, 'output', 'sessions');
  const indexPath = join(sessionsDir, 'INDEX.md');
  if (!existsSync(sessionsDir)) {
    console.log(chalk.yellow('No sessions directory. Run `npx qualiow init` first, then start a session.'));
    return;
  }

  const rows = readSessionIndex(indexPath);
  const indexedDirs = new Set(rows.map((r) => basename(r.report.replace(/\/session-report\.md$/, ''))));
  const unindexed = readdirSync(sessionsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && SESSION_DIR_RE.test(d.name) && !indexedDirs.has(d.name))
    .map((d) => d.name)
    .sort();

  console.log(chalk.cyan.bold('\nSessions:'));
  console.log('');
  if (rows.length === 0 && unindexed.length === 0) {
    console.log(chalk.yellow('  No sessions recorded yet.'));
    console.log(chalk.white('  Start one with: /qa-explore <url>'));
    console.log('');
    return;
  }

  const widths = [16, 8, 22, 5, 9, 12];
  const header = INDEX_COLUMNS.map((c, i) => (i < widths.length ? pad(c, widths[i]) : c)).join(' ');
  console.log(chalk.bold(`  ${header}`));
  console.log(`  ${widths.map((w) => '─'.repeat(w)).join(' ')} ${'─'.repeat(30)}`);
  for (const r of rows) {
    console.log(
      `  ${pad(r.date, 16)} ${pad(r.kind, 8)} ${pad(r.target, 22)} ${pad(r.bugs, 5)} ${pad(r.duration, 9)} ${pad(r.status, 12)} ${r.report}`,
    );
  }
  for (const d of unindexed) {
    console.log(chalk.gray(`  ${pad(d.slice(0, 15), 16)} ${pad('', 8)} ${pad('', 22)} ${pad('', 5)} ${pad('', 9)} ${pad('unindexed', 12)} ${d}`));
  }
  console.log('');
  console.log(chalk.white(`  Total: ${rows.length} session(s)` + (unindexed.length ? chalk.gray(` (+${unindexed.length} unindexed)`) : '')));
  console.log('');
}

function listKnowledge(cwd: string): void {
  const knowledgeDir = resolve(cwd, 'data', 'knowledge');
  const manifestPath = join(knowledgeDir, 'manifest.yml');
  if (!existsSync(manifestPath)) {
    console.log(chalk.yellow('No knowledge base found. Run `npx qualiow init` first.'));
    return;
  }

  const manifest = parseYaml(readFileSync(manifestPath, 'utf-8')) as KnowledgeManifest;
  const filesOnDisk = globSync(join(knowledgeDir, 'releases', '*', 'entries', '*.yml')).length;

  console.log(chalk.cyan.bold('\nKnowledge Base:'));
  console.log(chalk.white(`  Version: ${manifest.version} | Entries: ${manifest.entries.length}`));
  if (filesOnDisk !== manifest.entries.length || manifest.stats.total_entries !== filesOnDisk) {
    console.log(
      chalk.yellow(
        `  ⚠ Registry (${manifest.entries.length}) / stats (${manifest.stats.total_entries}) disagree with ${filesOnDisk} entry files — run: npx qualiow kb sync`,
      ),
    );
  }
  console.log('');

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
        entry.priority === 'high' ? chalk.red : entry.priority === 'medium' ? chalk.yellow : chalk.white;
      const tags = entry.tags.map((t) => chalk.gray(t)).join(', ');
      console.log(`    ${priorityColor(`[${entry.priority}]`)} ${entry.id}  ${chalk.gray('tags:')} ${tags}`);
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

  const files = readdirSync(targetsDir).filter((f) => f.endsWith('.yml')).sort();
  const projectLocal = resolve(cwd, 'qa', 'target.yml');
  if (files.length === 0 && !existsSync(projectLocal)) {
    console.log(chalk.yellow('No target configurations found.'));
    return;
  }

  console.log(chalk.cyan.bold('\nTargets:'));
  console.log('');
  const header = `  ${pad('File', 34)} ${pad('Name', 32)} ${pad('Domain', 11)} ${pad('Auth', 16)} Base URL`;
  console.log(chalk.bold(header));
  console.log(`  ${'─'.repeat(34)} ${'─'.repeat(32)} ${'─'.repeat(11)} ${'─'.repeat(16)} ${'─'.repeat(30)}`);

  const printTarget = (label: string, path: string) => {
    try {
      const target = parseYaml(readFileSync(path, 'utf-8')) as TargetConfig & { web?: { base_url?: string } };
      const url = target.base_url || target.web?.base_url || chalk.gray('(none)');
      console.log(
        `  ${pad(label, 34)} ${pad(target.name, 32)} ${pad(target.domain, 11)} ${pad(target.auth?.strategy ?? '', 16)} ${url}`,
      );
    } catch {
      console.log(`  ${chalk.red('ERROR')}  Could not parse ${label}`);
    }
  };

  if (existsSync(projectLocal)) printTarget('qa/target.yml', projectLocal);
  for (const file of files) printTarget(`data/targets/${file}`, join(targetsDir, file));

  console.log('');
  console.log(chalk.white(`  Total: ${files.length + (existsSync(projectLocal) ? 1 : 0)} target(s)`));
  console.log('');
}

function listDomains(cwd: string): void {
  const domainsDir = resolve(cwd, 'data', 'domains');
  if (!existsSync(domainsDir)) {
    console.log(chalk.yellow('No domain configs found. Run `npx qualiow init` first.'));
    return;
  }

  const files = readdirSync(domainsDir).filter((f) => f.endsWith('.yml')).sort();
  if (files.length === 0) {
    console.log(chalk.yellow('No domain configurations found.'));
    return;
  }

  console.log(chalk.cyan.bold('\nDomains:'));
  console.log('');
  const header = `  ${pad('File', 18)} ${pad('Name', 32)} ${pad('Checklist', 10)} ${pad('Journeys', 9)} ${pad('Patterns', 9)}`;
  console.log(chalk.bold(header));
  console.log(`  ${'─'.repeat(18)} ${'─'.repeat(32)} ${'─'.repeat(10)} ${'─'.repeat(9)} ${'─'.repeat(9)}`);

  for (const file of files) {
    try {
      const domain = parseYaml(readFileSync(join(domainsDir, file), 'utf-8')) as DomainConfig;
      const patterns = Object.values(domain.must_test_patterns ?? {}).reduce((n, arr) => n + arr.length, 0);
      console.log(
        `  ${pad(file, 18)} ${pad(domain.name, 32)} ${pad(String(domain.completeness_checklist?.length ?? 0), 10)} ${pad(String(domain.journeys?.length ?? 0), 9)} ${pad(String(patterns), 9)}`,
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
  if (str.length >= len) return str.slice(0, len);
  return str + ' '.repeat(len - str.length);
}
