import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const REPO_ROOT = resolve(process.cwd());
const CLI_ENTRY = join(REPO_ROOT, 'dist', 'cli', 'index.js');
const distExists = existsSync(CLI_ENTRY);
const skillsMirrorExists = existsSync(join(REPO_ROOT, 'skills'));

describe.skipIf(!distExists)('dist/ build output', () => {
  it('dist/cli/index.js starts with a node shebang', () => {
    const firstLine = readFileSync(CLI_ENTRY, 'utf-8').split('\n')[0];
    expect(firstLine).toBe('#!/usr/bin/env node');
  });

  it('dist/index.d.ts exists', () => {
    expect(existsSync(join(REPO_ROOT, 'dist', 'index.d.ts'))).toBe(true);
  });

  it('ships no source maps', () => {
    const findMaps = (dir: string): string[] => {
      const out: string[] = [];
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) out.push(...findMaps(full));
        else if (entry.endsWith('.map')) out.push(full);
      }
      return out;
    };
    expect(findMaps(join(REPO_ROOT, 'dist'))).toEqual([]);
  });
});

describe.skipIf(!distExists || !skillsMirrorExists)('scripts/check-pack.mjs', () => {
  it('exits 0', () => {
    expect(() =>
      execFileSync('node', [join(REPO_ROOT, 'scripts', 'check-pack.mjs')], {
        cwd: REPO_ROOT,
        timeout: 60_000,
        stdio: 'pipe',
      }),
    ).not.toThrow();
  });
});
