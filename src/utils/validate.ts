import { readFileSync, existsSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { ZodError, type ZodType } from 'zod';
import { TargetConfigSchema } from '../schemas/target.schema.js';
import { KnowledgeEntrySchema } from '../schemas/knowledge-entry.schema.js';
import { DomainConfigSchema } from '../schemas/domain-config.schema.js';
import { KnowledgeManifestSchema } from '../schemas/knowledge-manifest.schema.js';
import { KnowledgeReleaseSchema } from '../schemas/knowledge-release.schema.js';
import { KnowledgeChangelogSchema } from '../schemas/knowledge-changelog.schema.js';
import type { ValidationError, ValidationResult } from '../types/index.js';
import {
  buildManifestRegistry,
  computeStats,
  listReleaseDirs,
} from './kb-sync.js';
import { globSync } from 'glob';

function validateYamlFile(filePath: string, schema: ZodType): ValidationResult {
  const absPath = resolve(filePath);
  try {
    const raw = readFileSync(absPath, 'utf-8');
    const data = parseYaml(raw);
    schema.parse(data);
    return { file: absPath, valid: true };
  } catch (err) {
    if (err instanceof ZodError) {
      return {
        file: absPath,
        valid: false,
        errors: err.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      };
    }
    return {
      file: absPath,
      valid: false,
      errors: [
        {
          path: '',
          message: err instanceof Error ? err.message : 'Unknown parsing error',
        },
      ],
    };
  }
}

/** A schema check plus an id === filename-stem check for targets/domains. */
function validateWithId(filePath: string, schema: ZodType): ValidationResult {
  const result = validateYamlFile(filePath, schema);
  if (!result.valid) return result;
  try {
    const data = parseYaml(readFileSync(filePath, 'utf-8')) as { id?: string };
    const stem = basename(filePath, '.yml');
    if (data.id !== stem) {
      return {
        file: resolve(filePath),
        valid: false,
        errors: [
          {
            path: 'id',
            message: `id "${data.id}" must equal the file name "${stem}"`,
          },
        ],
      };
    }
  } catch {
    /* schema pass already covered parse errors */
  }
  return result;
}

export function validateTargetConfig(filePath: string): ValidationResult {
  return validateWithId(filePath, TargetConfigSchema);
}

export function validateKnowledgeEntry(filePath: string): ValidationResult {
  return validateYamlFile(filePath, KnowledgeEntrySchema);
}

export function validateDomainConfig(filePath: string): ValidationResult {
  return validateWithId(filePath, DomainConfigSchema);
}

/**
 * Cross-checks the whole knowledge base: manifest, releases, changelog, and the
 * consistency between the registry, the entry files and the computed stats.
 */
export function validateKnowledgeBase(dataDir: string): ValidationResult[] {
  const results: ValidationResult[] = [];
  const knowledgeDir = resolve(dataDir, 'knowledge');
  const manifestPath = join(knowledgeDir, 'manifest.yml');
  const changelogPath = join(knowledgeDir, 'changelog.yml');

  results.push(validateYamlFile(manifestPath, KnowledgeManifestSchema));
  results.push(validateYamlFile(changelogPath, KnowledgeChangelogSchema));

  const releaseDirs = listReleaseDirs(knowledgeDir);
  for (const rel of releaseDirs) {
    const releasePath = join(knowledgeDir, 'releases', rel, 'release.yml');
    const schemaResult = validateYamlFile(releasePath, KnowledgeReleaseSchema);
    const errors: ValidationError[] = schemaResult.errors ?? [];
    if (schemaResult.valid || errors.length === 0) {
      try {
        const release = parseYaml(readFileSync(releasePath, 'utf-8')) as {
          version: string;
          entries: string[];
        };
        if (`v${release.version}` !== rel) {
          errors.push({
            path: 'version',
            message: `version "${release.version}" does not match directory "${rel}"`,
          });
        }
        const entryDir = join(knowledgeDir, 'releases', rel, 'entries');
        const filesOnDisk = existsSync(entryDir)
          ? globSync(join(entryDir, '*.yml')).map((f) => basename(f, '.yml'))
          : [];
        for (const id of release.entries) {
          if (!filesOnDisk.includes(id)) {
            errors.push({ path: 'entries', message: `declared entry "${id}" has no file` });
          }
        }
        for (const id of filesOnDisk) {
          if (!release.entries.includes(id)) {
            errors.push({ path: 'entries', message: `entry file "${id}" is not declared` });
          }
        }
      } catch {
        /* schema failure already recorded */
      }
    }
    results.push(
      errors.length
        ? { file: resolve(releasePath), valid: false, errors }
        : { file: resolve(releasePath), valid: true },
    );
  }

  // Registry ↔ files ↔ stats ↔ loading_strategy ↔ changelog cross-check.
  const crossErrors: ValidationError[] = [];
  try {
    const manifest = parseYaml(readFileSync(manifestPath, 'utf-8')) as {
      stats: Record<string, number>;
      active_releases: string[];
      loading_strategy: {
        always: string[];
        by_domain: Record<string, string[]>;
        by_tag: Record<string, string[]>;
      };
      entries: { id: string; file: string; type: string; domains: string[] }[];
    };
    const registry = buildManifestRegistry(dataDir);
    const stats = computeStats(dataDir, registry);
    const registryIds = new Set(registry.map((e) => e.id));

    if (JSON.stringify(manifest.entries) !== JSON.stringify(registry)) {
      crossErrors.push({
        path: 'entries',
        message: 'registry is out of sync with the entry files (run `qualiow kb sync`)',
      });
    }
    if (JSON.stringify(manifest.stats) !== JSON.stringify(stats)) {
      crossErrors.push({
        path: 'stats',
        message: `stats out of sync (expected total_entries ${stats.total_entries})`,
      });
    }
    const activeExpected = [...listReleaseDirs(knowledgeDir)].sort();
    if (JSON.stringify([...manifest.active_releases].sort()) !== JSON.stringify(activeExpected)) {
      crossErrors.push({ path: 'active_releases', message: 'does not match the release directories' });
    }
    const ls = manifest.loading_strategy;
    const allRefs = [
      ...ls.always,
      ...Object.values(ls.by_domain).flat(),
      ...Object.values(ls.by_tag).flat(),
    ];
    for (const id of allRefs) {
      if (!registryIds.has(id)) {
        crossErrors.push({ path: 'loading_strategy', message: `references unknown entry "${id}"` });
      }
    }

    const changelog = parseYaml(readFileSync(changelogPath, 'utf-8')) as {
      releases: { entries_added: { id: string }[] }[];
    };
    for (const r of changelog.releases) {
      for (const e of r.entries_added) {
        if (!registryIds.has(e.id)) {
          crossErrors.push({ path: 'changelog', message: `entry "${e.id}" is not in the registry` });
        }
      }
    }
  } catch (err) {
    crossErrors.push({
      path: '',
      message: err instanceof Error ? err.message : 'cross-check failed',
    });
  }
  results.push(
    crossErrors.length
      ? { file: join(knowledgeDir, '(cross-check)'), valid: false, errors: crossErrors }
      : { file: join(knowledgeDir, '(cross-check)'), valid: true },
  );

  return results;
}

/**
 * Validates every config file under `dataDir` (targets, domains, knowledge
 * entries and the knowledge-base cross-check). Also validates a project-local
 * `qa/target.yml` when `cwd` is given and the file exists.
 */
export function validateAllConfigs(
  dataDir: string,
  opts: { cwd?: string } = {},
): ValidationResult[] {
  const results: ValidationResult[] = [];
  const absDir = resolve(dataDir);

  for (const file of globSync(join(absDir, 'targets', '*.yml'))) {
    results.push(validateTargetConfig(file));
  }
  if (opts.cwd) {
    const projectTarget = join(opts.cwd, 'qa', 'target.yml');
    if (existsSync(projectTarget)) {
      results.push(validateYamlFile(projectTarget, TargetConfigSchema));
    }
  }
  for (const file of globSync(join(absDir, 'domains', '*.yml'))) {
    results.push(validateDomainConfig(file));
  }
  for (const file of globSync(
    join(absDir, 'knowledge', 'releases', '**', 'entries', '*.yml'),
  )) {
    results.push(validateKnowledgeEntry(file));
  }
  if (existsSync(join(absDir, 'knowledge', 'manifest.yml'))) {
    results.push(...validateKnowledgeBase(absDir));
  }

  return results;
}
