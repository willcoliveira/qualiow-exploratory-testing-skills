import { Command } from 'commander';
import { resolve, join } from 'node:path';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import chalk from 'chalk';
import { parse as parseYaml } from 'yaml';
import type { z } from 'zod';
import { syncKnowledgeManifest } from '../../utils/kb-sync.js';
import { resolveDataDir } from '../../utils/paths.js';
import { KnowledgeManifestSchema } from '../../schemas/knowledge-manifest.schema.js';
import { KnowledgeEntrySchema } from '../../schemas/knowledge-entry.schema.js';

/** Default per-entry line cap for `kb digest`. */
const DEFAULT_MAX_LINES = 12;
/** Soft wrap column for prose lines. */
const WRAP_COLUMN = 100;
/** How many `when_to_use` items an entry block carries. */
const WHEN_TO_USE_ITEMS = 3;

export function kbCommand(): Command {
  const cmd = new Command('kb').description('Knowledge-base maintenance');

  cmd
    .command('sync')
    .description('Regenerate data/knowledge/manifest.yml entries and stats from the release files')
    .action(() => {
      try {
        const result = runKb('sync', process.cwd());
        console.log(
          result.changed
            ? chalk.green(`  ✓ manifest.yml updated (${result.entryCount} entries)`)
            : chalk.cyan(`  ○ manifest.yml already in sync (${result.entryCount} entries)`),
        );
      } catch (err) {
        console.error(chalk.red('Error:'), err instanceof Error ? err.message : err);
        process.exit(1);
      }
    });

  cmd
    .command('check')
    .description('Exit 1 if manifest.yml is out of sync with the release files')
    .action(() => {
      try {
        const result = runKb('check', process.cwd());
        if (result.changed) {
          console.error(chalk.red('  ✗ manifest.yml is out of sync — run: npx qualiow kb sync'));
          process.exit(1);
        }
        console.log(chalk.green(`  ✓ manifest.yml in sync (${result.entryCount} entries)`));
      } catch (err) {
        console.error(chalk.red('Error:'), err instanceof Error ? err.message : err);
        process.exit(1);
      }
    });

  cmd
    .command('digest')
    .description('Print a bounded plain-text digest of the entries a session should load')
    .option('--domain <id>', 'Add the entries listed under loading_strategy.by_domain')
    .option('--tag <tag...>', 'Add the entries listed under loading_strategy.by_tag (repeatable)')
    .option('--for <skill>', 'Add the entries listed under loading_strategy.by_skill (explore, backend, mobile)')
    .option('--entry <id>', 'Print the full YAML of one entry instead of the digest')
    .option('--data <dir>', 'Read the knowledge base from this data directory')
    .option('--max-lines <n>', 'Per-entry line cap', (v: string) => parseInt(v, 10), DEFAULT_MAX_LINES)
    .action((options: KbDigestOptions) => {
      try {
        console.log(runKbDigest(options, process.cwd()));
      } catch (err) {
        console.error(chalk.red('Error:'), err instanceof Error ? err.message : err);
        process.exit(1);
      }
    });

  return cmd;
}

export function runKb(mode: 'sync' | 'check', cwd: string) {
  const dataDir = resolve(cwd, 'data');
  if (!existsSync(resolve(dataDir, 'knowledge', 'manifest.yml'))) {
    throw new Error('data/knowledge/manifest.yml not found. Run `npx qualiow init` first.');
  }
  return syncKnowledgeManifest(dataDir, { check: mode === 'check' });
}

// ─── kb digest ───────────────────────────────────────────────────────

export interface KbDigestOptions {
  domain?: string;
  tag?: string[];
  /** `--for <skill>`; commander stores it under the flag's own name. */
  for?: string;
  entry?: string;
  data?: string;
  maxLines?: number;
}

type KnowledgeManifest = z.infer<typeof KnowledgeManifestSchema>;
type ManifestEntry = KnowledgeManifest['entries'][number];

/**
 * Builds the digest a session loads instead of reading the manifest and the
 * release files whole. Returns the text; the action prints it.
 */
export function runKbDigest(options: KbDigestOptions, cwd: string): string {
  const dataDir = resolveDataDir(cwd, options.data);
  const knowledgeDir = join(dataDir, 'knowledge');
  const manifestPath = join(knowledgeDir, 'manifest.yml');
  if (!existsSync(manifestPath)) {
    throw new Error(
      `No knowledge manifest at ${manifestPath}. Pass --data <dir>, or run \`npx qualiow init\` first.`,
    );
  }

  const manifest = KnowledgeManifestSchema.parse(
    parseYaml(readFileSync(manifestPath, 'utf-8')),
  );
  const byId = new Map<string, ManifestEntry>(manifest.entries.map((e) => [e.id, e]));
  const maxLines = Math.max(1, options.maxLines ?? DEFAULT_MAX_LINES);

  if (options.entry) {
    return readWholeEntry(knowledgeDir, byId, options.entry);
  }

  const ls = manifest.loading_strategy;
  const selected: string[] = [];
  const add = (ids: string[] | undefined): number => {
    let added = 0;
    for (const id of ids ?? []) {
      if (selected.includes(id)) continue;
      selected.push(id);
      added++;
    }
    return added;
  };

  add(ls.always);
  const domainAdded = options.domain ? add(ls.by_domain[options.domain]) : 0;

  const tags = options.tag ?? [];
  let tagAdded = 0;
  for (const tag of tags) tagAdded += add(ls.by_tag[tag]);

  let skillAdded = 0;
  if (options.for) {
    const bySkill = ls.by_skill;
    if (!bySkill) {
      throw new Error(
        'This manifest has no loading_strategy.by_skill, so --for has nothing to select.',
      );
    }
    if (!Object.prototype.hasOwnProperty.call(bySkill, options.for)) {
      throw new Error(
        `Unknown skill "${options.for}". Known: ${Object.keys(bySkill).sort().join(', ')}.`,
      );
    }
    skillAdded = add(bySkill[options.for]);
  }

  const unknown = selected.filter((id) => !byId.has(id));
  if (unknown.length) {
    throw new Error(
      `loading_strategy references ${unknown.length} unknown entry id(s): ${unknown.join(', ')}. ` +
        'Run `qualiow kb sync` and `qualiow validate --kb`.',
    );
  }

  const header = [
    `# Knowledge digest v${manifest.version}`,
    `${selected.length} entries`,
    `always ${ls.always.length}`,
  ];
  if (options.domain) header.push(`domain ${options.domain} +${domainAdded}`);
  if (tags.length) header.push(`tags ${tags.join(', ')} +${tagAdded}`);
  if (options.for) header.push(`skill ${options.for} +${skillAdded}`);

  const lines: string[] = [header.join(' · ')];
  for (const id of selected) {
    const meta = byId.get(id)!;
    lines.push(...entryBlock(join(knowledgeDir, meta.file), meta, maxLines));
  }

  lines.push(...customSection(knowledgeDir, maxLines));
  lines.push(...learnedPatternsSection(cwd, knowledgeDir));

  return lines.join('\n');
}

/** `--entry <id>`: the entry file verbatim, registry entries and custom alike. */
function readWholeEntry(
  knowledgeDir: string,
  byId: Map<string, ManifestEntry>,
  id: string,
): string {
  const meta = byId.get(id);
  const path = meta
    ? join(knowledgeDir, meta.file)
    : join(knowledgeDir, 'custom', `${id}.yml`);
  if (!existsSync(path)) {
    throw new Error(
      `Unknown entry "${id}". Run \`qualiow list knowledge\` to see the available ids.`,
    );
  }
  return readFileSync(path, 'utf-8').trimEnd();
}

interface EntryHeading {
  id: string;
  type: string;
  priority: string;
  tags: string[];
}

/** One entry rendered as at most `maxLines` lines. */
function entryBlock(file: string, meta: EntryHeading, maxLines: number, custom = false): string[] {
  if (!existsSync(file)) {
    throw new Error(`Entry "${meta.id}" is registered but its file is missing: ${file}`);
  }
  const entry = KnowledgeEntrySchema.parse(parseYaml(readFileSync(file, 'utf-8')));
  const content = entry.content as Record<string, unknown>;

  const marker = custom ? ' [custom]' : '';
  const out: string[] = [
    `- ${meta.id} [${meta.type}/${meta.priority}]${marker} tags: ${meta.tags.join(', ')}`,
  ];
  out.push(...wrap(collapse(entry.content.summary)));

  for (const [key, items] of namedArrays(content)) {
    const rendered = items
      .map((item) => {
        const lead = subItemLead(item);
        return lead ? `${item.name} — ${lead}` : item.name;
      })
      .join('; ');
    out.push(...wrap(`${humanise(key)}: ${rendered}`));
  }

  const whenToUse = content['when_to_use'];
  if (Array.isArray(whenToUse) && whenToUse.length) {
    const items = whenToUse
      .slice(0, WHEN_TO_USE_ITEMS)
      .filter((v): v is string => typeof v === 'string')
      .map(collapse);
    if (items.length) out.push(...wrap(`when to use: ${items.join('; ')}`));
  }

  return capLines(out, maxLines);
}

/** `<data>/knowledge/custom/*.yml`, rendered like registry entries. */
function customSection(knowledgeDir: string, maxLines: number): string[] {
  const customDir = join(knowledgeDir, 'custom');
  if (!existsSync(customDir)) return [];
  const files = readdirSync(customDir)
    .filter((f) => f.endsWith('.yml'))
    .sort();
  if (!files.length) return [];

  const lines = ['', '## Custom entries'];
  for (const file of files) {
    const path = join(customDir, file);
    const parsed = parseYaml(readFileSync(path, 'utf-8')) as {
      id?: string;
      type?: string;
      priority?: string;
      tags?: string[];
    };
    lines.push(
      ...entryBlock(
        path,
        {
          id: parsed.id ?? file.replace(/\.yml$/, ''),
          type: parsed.type ?? 'custom',
          priority: parsed.priority ?? 'medium',
          tags: parsed.tags ?? [],
        },
        maxLines,
        true,
      ),
    );
  }
  return lines;
}

/**
 * The bold lead-ins of `learned-patterns.md`, grouped by heading. Only the
 * lead-ins: the model greps the file when one of them looks relevant.
 */
function learnedPatternsSection(cwd: string, knowledgeDir: string): string[] {
  const candidates = [
    resolve(cwd, 'data', 'knowledge', 'learned-patterns.md'),
    join(knowledgeDir, 'learned-patterns.md'),
  ];
  const path = candidates.find((p) => existsSync(p));
  if (!path) return [];

  const sections = learnedPatternLeadIns(readFileSync(path, 'utf-8'));
  if (!sections.length) return [];

  const lines = ['', '## Learned patterns', 'Grep the file for the full entry.'];
  for (const section of sections) {
    lines.push(...wrap(`${section.heading}: ${section.items.join('; ')}`));
  }
  return lines;
}

interface LeadInSection {
  heading: string;
  items: string[];
}

/** Bullet lead-ins (`- **…**`), grouped under the heading they sit below. */
export function learnedPatternLeadIns(markdown: string): LeadInSection[] {
  const sections: LeadInSection[] = [];
  let current: LeadInSection | null = null;
  let bullet: string | null = null;

  const flush = () => {
    if (bullet !== null && current) {
      // Non-greedy from the start of the bullet: the lead-in wins over any
      // bold used later in the same item.
      const match = /^\*\*([\s\S]+?)\*\*/.exec(bullet);
      if (match) current.items.push(collapse(match[1]));
    }
    bullet = null;
  };

  for (const raw of markdown.split('\n')) {
    const heading = /^#{2,}\s+(.+)$/.exec(raw);
    if (heading) {
      flush();
      current = { heading: heading[1].trim(), items: [] };
      sections.push(current);
      continue;
    }
    const start = /^[-*]\s+(.*)$/.exec(raw);
    if (start) {
      flush();
      bullet = start[1];
      continue;
    }
    if (bullet !== null) {
      // A blank line ends the item; an indented line continues it.
      if (raw.trim() === '') flush();
      else bullet += ` ${raw.trim()}`;
    }
  }
  flush();

  return sections.filter((s) => s.items.length > 0);
}

// ─── rendering helpers ───────────────────────────────────────────────

interface NamedItem {
  name: string;
  [key: string]: unknown;
}

/** Arrays under `content` whose items carry a `name` — dimensions, tours, … */
function namedArrays(content: Record<string, unknown>): [string, NamedItem[]][] {
  const found: [string, NamedItem[]][] = [];
  for (const [key, value] of Object.entries(content)) {
    if (key === 'summary' || key === 'when_to_use') continue;
    if (!Array.isArray(value) || value.length === 0) continue;
    const items = value.filter(
      (v): v is NamedItem =>
        typeof v === 'object' && v !== null && typeof (v as NamedItem).name === 'string',
    );
    if (items.length === value.length) found.push([key, items]);
  }
  return found;
}

/** The first question, else the description, of a named sub-item. */
function subItemLead(item: NamedItem): string {
  const questions = item['questions'];
  if (Array.isArray(questions) && typeof questions[0] === 'string') {
    return truncate(collapse(questions[0]));
  }
  const description = item['description'];
  if (typeof description === 'string') return truncate(collapse(description));
  return '';
}

function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Shortens at the last word boundary before `limit`. */
function truncate(text: string, limit = WRAP_COLUMN): string {
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > limit / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

function humanise(key: string): string {
  const spaced = key.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Hard-wraps a field onto indented lines, continuations indented further. */
function wrap(text: string, width = WRAP_COLUMN, indent = '  ', hanging = '    '): string[] {
  const words = collapse(text).split(' ').filter(Boolean);
  if (!words.length) return [];
  const out: string[] = [];
  let line = indent + words[0];
  for (const word of words.slice(1)) {
    if (line.length + 1 + word.length > width) {
      out.push(line);
      line = hanging + word;
    } else {
      line += ` ${word}`;
    }
  }
  out.push(line);
  return out;
}

/** Applies the per-entry cap, marking the last kept line when it truncates. */
function capLines(lines: string[], maxLines: number): string[] {
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  kept[kept.length - 1] = `${kept[kept.length - 1]} …`;
  return kept;
}
