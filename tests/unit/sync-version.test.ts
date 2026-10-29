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

const REPO = 'willcoliveira/qualiow-exploratory-testing-skills';
const PRIOR_PIN = {
  source: 'github',
  repo: REPO,
  ref: 'v2.5.0',
  sha: 'd79d03ccf566984972e32de8fe4c4c15f6322422',
};

// The developer's own git config (signing, hooks, default branch) must not leak in.
const GIT_ENV = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
};

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
  setVersions(root, opts.pkg, opts.plugin);
  writeJson(root, '.claude-plugin/marketplace.json', {
    name: 'qualiow',
    plugins: [{ name: 'qualiow', source: PRIOR_PIN, version: opts.marketplace ?? '2.5.0' }],
  });
  return root;
}

function setVersions(root: string, pkg: string, plugin: string): void {
  writeJson(root, 'package.json', {
    name: 'qualiow-exploratory-testing',
    version: pkg,
    repository: { type: 'git', url: `git+https://github.com/${REPO}.git` },
  });
  writeJson(root, '.claude-plugin/plugin.json', { name: 'qualiow', version: plugin });
}

function writeJson(root: string, rel: string, value: unknown): void {
  writeFileSync(join(root, rel), JSON.stringify(value, null, 2) + '\n');
}

type Entry = { version: string; source: unknown };
function readJson(root: string, rel: string): { version: string; plugins?: Entry[] } {
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
    env: GIT_ENV,
    encoding: 'utf-8',
  });
}

function git(root: string, ...args: string[]): string {
  const res = spawnSync('git', args, { cwd: root, env: GIT_ENV, encoding: 'utf-8' });
  if (res.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${res.stderr}`);
  return res.stdout.trim();
}

function commitAll(root: string, message: string): string {
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '--no-verify', '-m', message);
  return git(root, 'rev-parse', 'HEAD');
}

/** A repository whose release commit for `version` is tagged and is origin/main. */
function makeRelease(version: string, opts: { annotated?: boolean } = {}): { root: string; sha: string } {
  const root = makeTree({ pkg: version, plugin: version });
  git(root, 'init', '-q');
  const sha = commitAll(root, `chore(release): ${version}`);
  if (opts.annotated === false) git(root, 'tag', `v${version}`);
  else git(root, 'tag', '-a', `v${version}`, '-m', `v${version}`);
  git(root, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
  return { root, sha };
}

function marketplaceEntry(root: string): Entry {
  return readJson(root, '.claude-plugin/marketplace.json').plugins![0];
}

describe('scripts/sync-version.mjs (no arguments — the npm `version` lifecycle)', () => {
  it("copies package.json's version into plugin.json", () => {
    const root = makeTree({ pkg: '3.0.0', plugin: '2.5.0' });
    const res = run(root);
    expect(res.status).toBe(0);
    expect(readJson(root, '.claude-plugin/plugin.json').version).toBe('3.0.0');
  });

  it('leaves the marketplace entry alone: it moves only with --pin, after the publish', () => {
    const root = makeTree({ pkg: '3.0.0', plugin: '2.5.0', marketplace: '2.5.0' });
    const before = readFileSync(join(root, '.claude-plugin/marketplace.json'), 'utf-8');
    expect(run(root).status).toBe(0);
    expect(readFileSync(join(root, '.claude-plugin/marketplace.json'), 'utf-8')).toBe(before);
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

describe('scripts/sync-version.mjs --pin <vX.Y.Z>', () => {
  it('points the marketplace entry at the tag and its commit, and only there', () => {
    const { root, sha } = makeRelease('3.0.0');
    const res = run(root, ['--pin', 'v3.0.0']);
    expect(res.status, res.stderr).toBe(0);
    expect(sha).toMatch(/^[0-9a-f]{40}$/);
    expect(marketplaceEntry(root)).toMatchObject({
      version: '3.0.0',
      source: { source: 'github', repo: REPO, ref: 'v3.0.0', sha },
    });
  });

  it('is idempotent', () => {
    const { root } = makeRelease('3.0.0');
    expect(run(root, ['--pin', 'v3.0.0']).status).toBe(0);
    const before = snapshot(root);
    const res = run(root, ['--pin', 'v3.0.0']);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('already pinned');
    expect(snapshot(root)).toEqual(before);
  });

  it('refuses a tag that does not exist', () => {
    const { root } = makeRelease('3.0.0');
    const before = snapshot(root);
    const res = run(root, ['--pin', 'v3.0.1']);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('does not exist');
    expect(snapshot(root)).toEqual(before);
  });

  it('refuses a lightweight tag', () => {
    const { root } = makeRelease('3.0.0', { annotated: false });
    const before = snapshot(root);
    const res = run(root, ['--pin', 'v3.0.0']);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('lightweight');
    expect(snapshot(root)).toEqual(before);
  });

  it('refuses a tag whose commit is not on origin/main', () => {
    const { root } = makeRelease('3.0.0');
    setVersions(root, '3.0.1', '3.0.1');
    commitAll(root, 'chore(release): 3.0.1, not merged');
    git(root, 'tag', '-a', 'v3.0.1', '-m', 'v3.0.1');
    const before = snapshot(root);
    const res = run(root, ['--pin', 'v3.0.1']);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('not on origin/main');
    expect(snapshot(root)).toEqual(before);
  });

  it('refuses when there is no origin/main to check against', () => {
    const { root } = makeRelease('3.0.0');
    git(root, 'update-ref', '-d', 'refs/remotes/origin/main');
    const before = snapshot(root);
    const res = run(root, ['--pin', 'v3.0.0']);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('git fetch origin');
    expect(snapshot(root)).toEqual(before);
  });

  it('refuses a tag whose plugin.json names another version', () => {
    const { root } = makeRelease('3.0.0');
    git(root, 'tag', '-a', 'v3.0.1', '-m', 'v3.0.1');
    const before = snapshot(root);
    const res = run(root, ['--pin', 'v3.0.1']);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('plugin.json says "3.0.0"');
    expect(snapshot(root)).toEqual(before);
  });

  it('refuses anything but a vX.Y.Z tag with a usage error', () => {
    const { root } = makeRelease('3.0.0');
    for (const args of [['--pin'], ['--pin', '3.0.0'], ['--pin', 'v3.0'], ['--pin', 'v3.0.0-rc.1']]) {
      expect(run(root, args).status, args.join(' ')).toBe(2);
    }
  });
});
