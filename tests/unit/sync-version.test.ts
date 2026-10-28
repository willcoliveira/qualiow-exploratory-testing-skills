import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, copyFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const REPO_ROOT = resolve(process.cwd());
const SCRIPT = join(REPO_ROOT, 'scripts', 'sync-version.mjs');

const tmpDirs: string[] = [];
afterEach(() => {
  while (tmpDirs.length) rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});

/**
 * A stand-in for this repository: the script (it resolves the root from its own
 * location), package.json and the two manifests it reads and writes.
 */
function makeTree(opts: { pkg: string; plugin: string; marketplace?: string }): string {
  const root = mkdtempSync(join(tmpdir(), 'qualiow-sync-version-'));
  tmpDirs.push(root);
  mkdirSync(join(root, 'scripts'), { recursive: true });
  mkdirSync(join(root, '.claude-plugin'), { recursive: true });
  copyFileSync(SCRIPT, join(root, 'scripts', 'sync-version.mjs'));
  writeJson(root, 'package.json', { name: 'qualiow-exploratory-testing', version: opts.pkg });
  writeJson(root, '.claude-plugin/plugin.json', { name: 'qualiow', version: opts.plugin });
  writeJson(root, '.claude-plugin/marketplace.json', {
    name: 'qualiow',
    plugins: [{ name: 'qualiow', source: './', version: opts.marketplace ?? opts.plugin }],
  });
  return root;
}

function writeJson(root: string, rel: string, value: unknown): void {
  writeFileSync(join(root, rel), JSON.stringify(value, null, 2) + '\n');
}

function readJson(root: string, rel: string): { version: string; plugins?: Array<{ version: string }> } {
  return JSON.parse(readFileSync(join(root, rel), 'utf-8'));
}

function snapshot(root: string): string[] {
  return ['package.json', '.claude-plugin/plugin.json', '.claude-plugin/marketplace.json'].map((f) =>
    readFileSync(join(root, f), 'utf-8'),
  );
}

function run(root: string, args: string[] = []) {
  return spawnSync(process.execPath, [join(root, 'scripts', 'sync-version.mjs'), ...args], {
    cwd: root,
    encoding: 'utf-8',
  });
}

describe('scripts/sync-version.mjs (no arguments — the npm `version` lifecycle)', () => {
  it("copies package.json's version into plugin.json", () => {
    const root = makeTree({ pkg: '3.0.0', plugin: '2.5.0' });
    const res = run(root);
    expect(res.status).toBe(0);
    expect(readJson(root, '.claude-plugin/plugin.json').version).toBe('3.0.0');
  });

  it('copies it into the marketplace entry too', () => {
    const root = makeTree({ pkg: '3.0.0', plugin: '2.5.0' });
    expect(run(root).status).toBe(0);
    expect(readJson(root, '.claude-plugin/marketplace.json').plugins?.[0].version).toBe('3.0.0');
  });
});

describe('scripts/sync-version.mjs --check <version>', () => {
  it('exits 0 and writes nothing when package.json and plugin.json both equal the version', () => {
    const root = makeTree({ pkg: '3.0.0', plugin: '3.0.0' });
    const before = snapshot(root);
    const res = run(root, ['--check', '3.0.0']);
    expect(res.status).toBe(0);
    expect(snapshot(root)).toEqual(before);
  });

  it('accepts the tag form vX.Y.Z', () => {
    const root = makeTree({ pkg: '3.0.0', plugin: '3.0.0' });
    expect(run(root, ['--check', 'v3.0.0']).status).toBe(0);
  });

  it('fails, names plugin.json and writes nothing when plugin.json differs', () => {
    const root = makeTree({ pkg: '3.0.0', plugin: '2.5.0' });
    const before = snapshot(root);
    const res = run(root, ['--check', '3.0.0']);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('.claude-plugin/plugin.json');
    expect(res.stderr).toContain('2.5.0');
    expect(snapshot(root)).toEqual(before);
  });

  it('fails and names package.json when package.json differs', () => {
    const root = makeTree({ pkg: '2.5.0', plugin: '3.0.0' });
    const res = run(root, ['--check', '3.0.0']);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('package.json');
    expect(res.stderr).not.toContain('plugin.json is');
  });

  it('fails when both manifests agree with each other but not with the version', () => {
    const root = makeTree({ pkg: '2.5.0', plugin: '2.5.0' });
    const res = run(root, ['--check', '3.0.0']);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('expected 3.0.0');
  });

  it('refuses a missing or malformed version with a usage error', () => {
    const root = makeTree({ pkg: '3.0.0', plugin: '3.0.0' });
    for (const args of [['--check'], ['--check', '3.0'], ['--check', 'latest'], ['--check', '3.0.0', 'extra']]) {
      const res = run(root, args);
      expect(res.status, args.join(' ')).toBe(2);
      expect(res.stderr, args.join(' ')).toMatch(/usage|version/i);
    }
  });

  it('refuses an unknown flag instead of silently syncing', () => {
    const root = makeTree({ pkg: '3.0.0', plugin: '2.5.0' });
    const before = snapshot(root);
    const res = run(root, ['--chek', '3.0.0']);
    expect(res.status).toBe(2);
    expect(snapshot(root)).toEqual(before);
  });
});
