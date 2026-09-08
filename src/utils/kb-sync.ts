/**
 * Knowledge-base manifest synchronisation.
 *
 * Rebuilds the manifest `entries:` registry and `stats:` from the release
 * directories on disk, so the manifest can never drift from the files. Other
 * manifest nodes (version, active_releases, loading_strategy) and the file's
 * comments are preserved.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, relative, basename } from 'node:path';
import { parse as parseYaml, parseDocument } from 'yaml';
import { globSync } from 'glob';

export interface RegistryEntry {
  id: string;
  file: string;
  type: string;
  priority: string;
  tags: string[];
  domains: string[];
}

export interface ManifestStats {
  total_entries: number;
  heuristics: number;
  techniques: number;
  checklists: number;
  references: number;
  domain_profiles: number;
  custom_entries: number;
}

const TYPE_TO_STAT: Record<string, keyof ManifestStats> = {
  heuristic: 'heuristics',
  technique: 'techniques',
  checklist: 'checklists',
  reference: 'references',
};

/** Sorted list of release dir names (v0.1.0 < v0.2.0 …). */
export function listReleaseDirs(knowledgeDir: string): string[] {
  const releasesDir = join(knowledgeDir, 'releases');
  if (!existsSync(releasesDir)) return [];
  return readdirSync(releasesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^v\d+\.\d+\.\d+$/.test(d.name))
    .map((d) => d.name)
    .sort(compareVersions);
}

function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('.').map(Number);
  const pb = b.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

/** Builds the registry array from the entry files, release order then id. */
export function buildManifestRegistry(dataDir: string): RegistryEntry[] {
  const knowledgeDir = join(dataDir, 'knowledge');
  const registry: RegistryEntry[] = [];
  for (const rel of listReleaseDirs(knowledgeDir)) {
    const files = globSync(join(knowledgeDir, 'releases', rel, 'entries', '*.yml')).sort();
    for (const file of files) {
      const entry = parseYaml(readFileSync(file, 'utf-8')) as {
        id: string;
        type: string;
        priority: string;
        tags: string[];
        domains: string[];
      };
      registry.push({
        id: entry.id,
        file: relative(knowledgeDir, file).split('\\').join('/'),
        type: entry.type,
        priority: entry.priority,
        tags: entry.tags,
        domains: entry.domains,
      });
    }
  }
  return registry;
}

/** Computes stats from the registry, the domain files and the custom dir. */
export function computeStats(
  dataDir: string,
  registry: RegistryEntry[],
): ManifestStats {
  const stats: ManifestStats = {
    total_entries: registry.length,
    heuristics: 0,
    techniques: 0,
    checklists: 0,
    references: 0,
    domain_profiles: 0,
    custom_entries: 0,
  };
  for (const e of registry) {
    const key = TYPE_TO_STAT[e.type];
    if (key) (stats[key] as number)++;
  }
  const domainsDir = join(dataDir, 'domains');
  if (existsSync(domainsDir)) {
    stats.domain_profiles = readdirSync(domainsDir).filter((f) =>
      f.endsWith('.yml'),
    ).length;
  }
  const customDir = join(dataDir, 'knowledge', 'custom');
  if (existsSync(customDir)) {
    stats.custom_entries = readdirSync(customDir).filter((f) =>
      f.endsWith('.yml'),
    ).length;
  }
  return stats;
}

export interface SyncResult {
  changed: boolean;
  stats: ManifestStats;
  entryCount: number;
}

/**
 * Rewrites (or, with `check`, only compares) the manifest's `entries` and
 * `stats` from disk. Returns whether the on-disk manifest was already in sync.
 */
export function syncKnowledgeManifest(
  dataDir: string,
  opts: { check?: boolean } = {},
): SyncResult {
  const manifestPath = join(dataDir, 'knowledge', 'manifest.yml');
  const raw = readFileSync(manifestPath, 'utf-8');
  const doc = parseDocument(raw);

  const registry = buildManifestRegistry(dataDir);
  const stats = computeStats(dataDir, registry);

  const current = parseYaml(raw) as {
    entries?: unknown;
    stats?: unknown;
    last_updated?: unknown;
  };
  const inSync =
    JSON.stringify(current.entries) === JSON.stringify(registry) &&
    JSON.stringify(current.stats) === JSON.stringify(stats);

  if (!opts.check && !inSync) {
    doc.set('stats', stats);
    doc.set('entries', registry);
    doc.set('last_updated', new Date().toISOString().slice(0, 10));
    writeFileSync(manifestPath, doc.toString(), 'utf-8');
  }

  return { changed: !inSync, stats, entryCount: registry.length };
}

export function entryIdFromFile(file: string): string {
  return basename(file, '.yml');
}
