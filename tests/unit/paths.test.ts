import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { getPackageRoot, resolveDataDir } from '../../src/utils/paths.js';

const tmpDirs: string[] = [];
const ENV_KEY = 'CLAUDE_PLUGIN_ROOT';
const originalPluginRoot = process.env[ENV_KEY];

function makeTmpDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'qualiow-paths-'));
  tmpDirs.push(dir);
  return dir;
}

/** A directory that looks like a qualiow project: data/knowledge/manifest.yml. */
function makeProjectDataDir(): string {
  const dir = makeTmpDir();
  mkdirSync(join(dir, 'data', 'knowledge'), { recursive: true });
  writeFileSync(join(dir, 'data', 'knowledge', 'manifest.yml'), 'version: "0.0.0"\n');
  return dir;
}

afterEach(() => {
  if (originalPluginRoot === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = originalPluginRoot;
  while (tmpDirs.length) {
    rmSync(tmpDirs.pop()!, { recursive: true, force: true });
  }
});

describe('resolveDataDir', () => {
  it('falls back to the package data when the cwd carries no knowledge base', () => {
    delete process.env[ENV_KEY];
    const cwd = makeTmpDir();
    expect(resolveDataDir(cwd)).toBe(resolve(getPackageRoot(), 'data'));
  });

  it('ignores a cwd data/ directory that has no knowledge manifest', () => {
    delete process.env[ENV_KEY];
    const cwd = makeTmpDir();
    mkdirSync(join(cwd, 'data'), { recursive: true });
    expect(resolveDataDir(cwd)).toBe(resolve(getPackageRoot(), 'data'));
  });

  it('prefers the cwd when data/knowledge/manifest.yml exists there', () => {
    delete process.env[ENV_KEY];
    const cwd = makeProjectDataDir();
    expect(resolveDataDir(cwd)).toBe(resolve(cwd, 'data'));
  });

  it('uses CLAUDE_PLUGIN_ROOT/data over the package data', () => {
    const pluginRoot = makeTmpDir();
    mkdirSync(join(pluginRoot, 'data'), { recursive: true });
    process.env[ENV_KEY] = pluginRoot;
    const cwd = makeTmpDir();
    expect(resolveDataDir(cwd)).toBe(resolve(pluginRoot, 'data'));
  });

  it('ignores CLAUDE_PLUGIN_ROOT when it has no data/ directory', () => {
    const pluginRoot = makeTmpDir();
    process.env[ENV_KEY] = pluginRoot;
    const cwd = makeTmpDir();
    expect(resolveDataDir(cwd)).toBe(resolve(getPackageRoot(), 'data'));
  });

  it('lets a project knowledge base win over CLAUDE_PLUGIN_ROOT', () => {
    const pluginRoot = makeTmpDir();
    mkdirSync(join(pluginRoot, 'data'), { recursive: true });
    process.env[ENV_KEY] = pluginRoot;
    const cwd = makeProjectDataDir();
    expect(resolveDataDir(cwd)).toBe(resolve(cwd, 'data'));
  });

  it('an explicit directory wins over the project, the plugin root and the package', () => {
    const pluginRoot = makeTmpDir();
    mkdirSync(join(pluginRoot, 'data'), { recursive: true });
    process.env[ENV_KEY] = pluginRoot;
    const cwd = makeProjectDataDir();
    const explicit = makeTmpDir();
    expect(resolveDataDir(cwd, explicit)).toBe(resolve(explicit));
  });

  it('resolves a relative explicit directory against the cwd', () => {
    delete process.env[ENV_KEY];
    const cwd = makeTmpDir();
    mkdirSync(join(cwd, 'elsewhere'), { recursive: true });
    expect(resolveDataDir(cwd, 'elsewhere')).toBe(resolve(cwd, 'elsewhere'));
  });

  it('honours an explicit pkgRoot argument', () => {
    delete process.env[ENV_KEY];
    const cwd = makeTmpDir();
    const pkgRoot = makeTmpDir();
    expect(resolveDataDir(cwd, undefined, pkgRoot)).toBe(resolve(pkgRoot, 'data'));
  });
});
