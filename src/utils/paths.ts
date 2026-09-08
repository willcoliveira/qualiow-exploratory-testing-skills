/**
 * Path resolution shared by the CLI commands.
 *
 * The package root is where `data/` and `package.json` live — the git checkout
 * in development, or `node_modules/qualiow-exploratory-testing/` when installed.
 */

import { fileURLToPath } from 'node:url';
import { dirname, resolve, join, basename } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));

/** Walk up from the built file looking for a dir with data/ and package.json. */
export function getPackageRoot(): string {
  let current = HERE;
  for (let i = 0; i < 10; i++) {
    if (
      existsSync(join(current, 'data')) &&
      existsSync(join(current, 'package.json'))
    ) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  // Fallback: two levels up from dist/cli/ or dist/utils/.
  return resolve(HERE, '..', '..');
}

/** The `version` field of the package's own package.json (or "0.0.0"). */
export function getPackageVersion(pkgRoot: string = getPackageRoot()): string {
  try {
    const pkg = JSON.parse(
      readFileSync(join(pkgRoot, 'package.json'), 'utf-8'),
    ) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/** Where `init` copies skills from: the published `skills/` tree, or the
 *  canonical `.claude/skills/` in a git checkout. */
export function resolveSkillsSource(pkgRoot: string): string | null {
  const shipped = join(pkgRoot, 'skills');
  if (existsSync(shipped)) return shipped;
  const canonical = join(pkgRoot, '.claude', 'skills');
  if (existsSync(canonical)) return canonical;
  return null;
}

/**
 * Resolve a target config path. With a name: `data/targets/<name>.yml` under
 * cwd, else under the package root. Without a name: a project-local
 * `qa/target.yml`, else `data/targets/_default.yml`. Returns the first path
 * that exists, or the most-specific candidate when none exist (so callers can
 * report a useful "not found").
 */
export function resolveTargetPath(
  cwd: string,
  name: string | undefined,
  pkgRoot: string = getPackageRoot(),
): string {
  if (name) {
    const candidates = [
      resolve(cwd, 'data', 'targets', `${name}.yml`),
      resolve(pkgRoot, 'data', 'targets', `${name}.yml`),
    ];
    return candidates.find((p) => existsSync(p)) ?? candidates[0];
  }
  const projectLocal = resolve(cwd, 'qa', 'target.yml');
  if (existsSync(projectLocal)) return projectLocal;
  const cwdDefault = resolve(cwd, 'data', 'targets', '_default.yml');
  if (existsSync(cwdDefault)) return cwdDefault;
  return resolve(pkgRoot, 'data', 'targets', '_default.yml');
}

/** Resolve a domain config, trying `<id>.yml` then `_<id>.yml`. */
export function resolveDomainPath(dataDir: string, id: string): string {
  const direct = join(dataDir, 'domains', `${id}.yml`);
  if (existsSync(direct)) return direct;
  const underscored = join(dataDir, 'domains', `_${id}.yml`);
  if (existsSync(underscored)) return underscored;
  return direct;
}

/** The id a target/domain file should carry: its filename without extension. */
export function idFromFilename(filePath: string): string {
  return basename(filePath, '.yml');
}
