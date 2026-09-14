import { Command } from 'commander';
import { resolve, join, basename } from 'node:path';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { globSync } from 'glob';
import chalk from 'chalk';
import type { TargetConfig, DomainConfig } from '../../types/index.js';
import { parseMarkdownTable } from '../../utils/markdown-table.js';
import { INDEX_COLUMNS } from '../../utils/index-files.js';
import { describeSessionDir, type DiscoveredSessionDir } from '../../utils/session-dir.js';
import { resolveDataDir } from '../../utils/paths.js';
import { KnowledgeManifestSchema } from '../../schemas/knowledge-manifest.schema.js';
import { KnowledgeChangelogSchema } from '../../schemas/knowledge-changelog.schema.js';

type ParsedManifest = ReturnType<typeof KnowledgeManifestSchema.parse>;

export interface ListOptions {
  /** Knowledge only: keep entries carrying this domain (or `all`). */
  domain?: string;
  /** Knowledge only: keep entries carrying this tag. */
  tag?: string;
  /** Knowledge only: keep entries of this type. */
  type?: string;
  /** Knowledge only: print one entry's YAML file instead of the listing. */
  entry?: string;
  /** Knowledge only: print the release changelog instead of the listing. */
  changelog?: boolean;
  /** Knowledge only: print stats, releases and loading-strategy counts. */
  stats?: boolean;
  /** Knowledge only: read the knowledge base from this data directory. */
  data?: string;
}

export function listCommand(): Command {
  const cmd = new Command('list')
    .description('List sessions, knowledge, targets, or domains')
    .argument('<type>', 'What to list: sessions, knowledge, targets, domains')
    .option('--domain <id>', 'knowledge: only entries for this domain')
    .option('--tag <tag>', 'knowledge: only entries carrying this tag')
    .option('--type <type>', 'knowledge: only entries of this type (heuristic, technique, …)')
    .option('--entry <id>', 'knowledge: print this entry\'s YAML file instead of the listing')
    .option('--changelog', 'knowledge: print the release changelog')
    .option('--stats', 'knowledge: print stats, active releases and loading-strategy counts')
    .option('--data <dir>', 'knowledge: read the knowledge base from this data directory')
    .action(async (type: string, options: ListOptions) => {
      try {
        await runList(type, process.cwd(), options);
      } catch (err) {
        console.error(chalk.red('Error:'), err instanceof Error ? err.message : err);
        process.exit(1);
      }
    });
  return cmd;
}

export async function runList(
  type: string,
  cwd: string,
  options: ListOptions = {},
  log: (line: string) => void = (line) => console.log(line),
): Promise<void> {
  switch (type) {
    case 'sessions':
      listSessions(cwd, log);
      break;
    case 'knowledge':
      listKnowledge(cwd, options, log);
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

/**
 * The session directory an INDEX.md report cell points at. Handles both a bare
 * path and the `[label](path)` link form an earlier version wrote.
 */
function reportDirName(report: string): string {
  const link = /\]\(([^)]+)\)/.exec(report);
  const path = (link ? link[1] : report).trim();
  return basename(path.replace(/\/session-report\.md$/, ''));
}

function listSessions(cwd: string, log: (line: string) => void): void {
  const sessionsDir = resolve(cwd, 'output', 'sessions');
  const indexPath = join(sessionsDir, 'INDEX.md');
  if (!existsSync(sessionsDir)) {
    log(chalk.yellow('No sessions directory. Run `npx qualiow init` first, then start a session.'));
    return;
  }

  const rows = readSessionIndex(indexPath);
  const indexedDirs = new Set(rows.map((r) => reportDirName(r.report)));
  // Legacy directory names are listed too: omitting them hides output that is
  // still on disk in a project upgraded from an earlier version.
  const unindexed = readdirSync(sessionsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => describeSessionDir(d.name))
    .filter((d): d is DiscoveredSessionDir => d !== null && !indexedDirs.has(d.name))
    .sort((a, b) => a.name.localeCompare(b.name));

  log(chalk.cyan.bold('\nSessions:'));
  log('');
  if (rows.length === 0 && unindexed.length === 0) {
    log(chalk.yellow('  No sessions recorded yet.'));
    log(chalk.white('  Start one with: /qa-explore <url>'));
    log('');
    return;
  }

  const widths = [16, 8, 22, 5, 9, 18];
  const header = INDEX_COLUMNS.map((c, i) => (i < widths.length ? pad(c, widths[i]) : c)).join(' ');
  log(chalk.bold(`  ${header}`));
  log(`  ${widths.map((w) => '─'.repeat(w)).join(' ')} ${'─'.repeat(30)}`);
  for (const r of rows) {
    log(
      `  ${pad(r.date, 16)} ${pad(r.kind, 8)} ${pad(r.target, 22)} ${pad(r.bugs, 5)} ${pad(r.duration, 9)} ${pad(r.status, 18)} ${r.report}`,
    );
  }
  for (const d of unindexed) {
    const status = d.legacy ? 'unindexed (legacy)' : 'unindexed';
    log(chalk.gray(`  ${pad(d.name.slice(0, 15), 16)} ${pad('', 8)} ${pad('', 22)} ${pad('', 5)} ${pad('', 9)} ${pad(status, 18)} ${d.name}`));
  }
  log('');
  log(chalk.white(`  Total: ${rows.length} session(s)` + (unindexed.length ? chalk.gray(` (+${unindexed.length} unindexed)`) : '')));
  log('');
}

function listKnowledge(cwd: string, options: ListOptions, log: (line: string) => void): void {
  const dataDir = resolveDataDir(cwd, options.data);
  const knowledgeDir = join(dataDir, 'knowledge');
  const manifestPath = join(knowledgeDir, 'manifest.yml');
  if (!existsSync(manifestPath)) {
    log(chalk.yellow(`No knowledge base at ${manifestPath}. Run \`npx qualiow init\` first.`));
    return;
  }

  const manifest = KnowledgeManifestSchema.parse(
    parseYaml(readFileSync(manifestPath, 'utf-8')),
  );

  if (options.entry) {
    log(readEntryFile(knowledgeDir, manifest.entries, options.entry));
    return;
  }

  if (options.changelog) {
    printKnowledgeChangelog(knowledgeDir, log);
    return;
  }

  if (options.stats) {
    printKnowledgeStats(manifest, log);
    return;
  }

  const filesOnDisk = globSync(join(knowledgeDir, 'releases', '*', 'entries', '*.yml')).length;

  log(chalk.cyan.bold('\nKnowledge Base:'));
  log(chalk.white(`  Version: ${manifest.version} | Entries: ${manifest.entries.length}`));
  if (filesOnDisk !== manifest.entries.length || manifest.stats.total_entries !== filesOnDisk) {
    log(
      chalk.yellow(
        `  ⚠ Registry (${manifest.entries.length}) / stats (${manifest.stats.total_entries}) disagree with ${filesOnDisk} entry files — run: npx qualiow kb sync`,
      ),
    );
  }

  const filters: string[] = [];
  if (options.domain) filters.push(`domain ${options.domain}`);
  if (options.tag) filters.push(`tag ${options.tag}`);
  if (options.type) filters.push(`type ${options.type}`);

  // `domains: [all]` marks an entry that applies to every domain.
  const entries = manifest.entries.filter(
    (e) =>
      (!options.domain || e.domains.includes(options.domain) || e.domains.includes('all')) &&
      (!options.tag || e.tags.includes(options.tag)) &&
      (!options.type || e.type === options.type),
  );

  if (filters.length) {
    log(chalk.white(`  Filter: ${filters.join(', ')} → ${entries.length} entries`));
  }
  log('');

  if (entries.length === 0) {
    log(chalk.yellow('  No entries match that filter.'));
    log('');
    return;
  }

  const grouped = new Map<string, typeof entries>();
  for (const entry of entries) {
    const list = grouped.get(entry.type) ?? [];
    list.push(entry);
    grouped.set(entry.type, list);
  }

  for (const [type, group] of grouped) {
    log(chalk.cyan(`  ${type.charAt(0).toUpperCase() + type.slice(1)}s (${group.length}):`));
    for (const entry of group) {
      const priorityColor =
        entry.priority === 'high' ? chalk.red : entry.priority === 'medium' ? chalk.yellow : chalk.white;
      const tags = entry.tags.map((t) => chalk.gray(t)).join(', ');
      log(`    ${priorityColor(`[${entry.priority}]`)} ${entry.id}  ${chalk.gray('tags:')} ${tags}`);
    }
    log('');
  }
}

/** `--entry <id>`: the raw YAML, the route for entries too long to Read. */
function readEntryFile(
  knowledgeDir: string,
  entries: { id: string; file: string }[],
  id: string,
): string {
  const meta = entries.find((e) => e.id === id);
  const path = meta ? join(knowledgeDir, meta.file) : join(knowledgeDir, 'custom', `${id}.yml`);
  if (!existsSync(path)) {
    throw new Error(`Unknown entry "${id}". Run \`qualiow list knowledge\` to see the available ids.`);
  }
  return readFileSync(path, 'utf-8').trimEnd();
}

function printKnowledgeChangelog(knowledgeDir: string, log: (line: string) => void): void {
  const changelogPath = join(knowledgeDir, 'changelog.yml');
  if (!existsSync(changelogPath)) {
    log(chalk.yellow(`No changelog at ${changelogPath}.`));
    return;
  }
  const changelog = KnowledgeChangelogSchema.parse(
    parseYaml(readFileSync(changelogPath, 'utf-8')),
  );

  log(chalk.cyan.bold('\nKnowledge Base Changelog:'));
  log('');
  for (const release of changelog.releases) {
    log(`  ${chalk.bold(`v${release.version}`)} ${chalk.gray(`· ${release.date}`)}`);
    log(`    ${release.summary}`);
    const added = release.entries_added.map((e) => e.id);
    if (added.length) log(`    ${chalk.gray('added:')} ${added.join(', ')}`);
    if (release.entries_modified.length) {
      log(`    ${chalk.gray('modified:')} ${release.entries_modified.join(', ')}`);
    }
    if (release.entries_removed.length) {
      log(`    ${chalk.gray('removed:')} ${release.entries_removed.join(', ')}`);
    }
    log('');
  }
}

function printKnowledgeStats(manifest: ParsedManifest, log: (line: string) => void): void {
  log(chalk.cyan.bold('\nKnowledge Base Stats:'));
  log(chalk.white(`  Version: ${manifest.version}`));
  log('');
  for (const [key, value] of Object.entries(manifest.stats)) {
    log(`  ${pad(key.replace(/_/g, ' '), 18)} ${value}`);
  }
  log('');
  log(chalk.cyan(`  Active releases (${manifest.active_releases.length}):`));
  log(`    ${manifest.active_releases.join(', ')}`);
  log('');

  const ls = manifest.loading_strategy;
  log(chalk.cyan('  Loading strategy:'));
  log(`    ${pad('always', 12)} ${ls.always.length} entries`);
  for (const [bucket, map] of [
    ['by_domain', ls.by_domain],
    ['by_tag', ls.by_tag],
    ['by_skill', ls.by_skill ?? {}],
  ] as const) {
    const keys = Object.keys(map);
    const total = Object.values(map).reduce((n, ids) => n + ids.length, 0);
    log(`    ${pad(bucket, 12)} ${keys.length} keys, ${total} references`);
  }
  log('');
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
