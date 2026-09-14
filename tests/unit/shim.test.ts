import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, copyFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const REPO_ROOT = resolve(process.cwd());
const SHIM = join(REPO_ROOT, 'bin', 'qualiow');

const tmpDirs: string[] = [];
afterEach(() => {
  while (tmpDirs.length) rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});

/**
 * A stand-in for a copy of this repository: the launcher, a package.json with the
 * package's own name, and the plugin manifest the launcher reads its pin from.
 * `built` adds the two things the launcher requires before it will exec the local
 * CLI, so the test never reaches the network.
 */
function makeRoot(opts: { built: boolean }): string {
  const root = mkdtempSync(join(tmpdir(), 'qualiow-shim-'));
  tmpDirs.push(root);
  mkdirSync(join(root, 'bin'), { recursive: true });
  mkdirSync(join(root, '.claude-plugin'), { recursive: true });
  copyFileSync(SHIM, join(root, 'bin', 'qualiow'));
  chmodSync(join(root, 'bin', 'qualiow'), 0o755);
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({ name: 'qualiow-exploratory-testing', version: '9.9.9' }) + '\n',
  );
  writeFileSync(
    join(root, '.claude-plugin', 'plugin.json'),
    JSON.stringify({ name: 'qualiow', version: '9.9.9' }) + '\n',
  );
  if (opts.built) {
    mkdirSync(join(root, 'dist', 'cli'), { recursive: true });
    mkdirSync(join(root, 'node_modules'), { recursive: true });
    writeFileSync(
      join(root, 'dist', 'cli', 'index.js'),
      "console.log('local-build:' + process.argv.slice(2).join(','));\n",
    );
  }
  return root;
}

function run(root: string, cwd: string, args: string[] = ['--version']) {
  return spawnSync(join(root, 'bin', 'qualiow'), args, { cwd, encoding: 'utf-8' });
}

describe('bin/qualiow', () => {
  it('runs the local build when dist/ and node_modules are both present', () => {
    const root = makeRoot({ built: true });
    const res = run(root, root, ['list', 'sessions']);
    expect(res.status).toBe(0);
    expect(res.stdout.trim()).toBe('local-build:list,sessions');
  });

  it('explains itself instead of failing through npx in an unbuilt tree', () => {
    const root = makeRoot({ built: false });
    const res = run(root, root);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('no CLI build');
    expect(res.stderr).toContain('npm install && npm run build');
    // The point of the guard: npx is never reached, so there is no network call
    // and no misleading "command not found" from a shell.
    expect(res.stderr).not.toContain('command not found');
    expect(res.stdout).toBe('');
  });

  it('guards a nested directory of that tree too', () => {
    const root = makeRoot({ built: false });
    const nested = join(root, 'data', 'knowledge');
    mkdirSync(nested, { recursive: true });
    const res = run(root, nested);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('no CLI build');
  });
});
