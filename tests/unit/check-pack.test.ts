import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

interface CheckPack {
  isSensitive: (p: string) => boolean;
  findProblems: (files: Set<string>, tracked: Set<string> | null, modified: Set<string> | null) => string[];
}

// Loaded by path so the plain-JS release script needs no ambient type declaration.
const load = async (): Promise<CheckPack> =>
  (await import(pathToFileURL(resolve('scripts/check-pack.mjs')).href)) as CheckPack;

describe('check-pack sensitive paths', () => {
  it.each([
    '.env',
    '.env.local',
    'qa/.env',
    'data/targets/.env.production',
    '.auth/state.json',
    'x/.auth/profile/Cookies',
    '.npmrc',
    'docs/.npmrc',
    'qa/storage-state.json',
    'tmp/my_storageState.json',
  ])('flags %s', async (p) => {
    expect((await load()).isSensitive(p)).toBe(true);
  });

  it.each(['.env.example', 'qa/.env.example', 'data/targets/parabank.yml', 'bin/qualiow'])(
    'allows %s',
    async (p) => {
      expect((await load()).isSensitive(p)).toBe(false);
    },
  );
});

describe('check-pack tracked-file assertion', () => {
  it('refuses a shipped file that git does not track, or that has uncommitted edits', async () => {
    const { findProblems } = await load();
    const files = new Set(['dist/x.js', 'data/targets/_client.yml', 'skills/a/SKILL.md', 'bin/qualiow']);
    const tracked = new Set(['skills/a/SKILL.md', 'bin/qualiow']);
    const modified = new Set(['skills/a/SKILL.md']);
    const problems = findProblems(files, tracked, modified).filter((p) => !p.startsWith('missing:'));
    expect(problems).toContain('shipped but not tracked: data/targets/_client.yml');
    expect(problems).toContain('shipped with uncommitted changes: skills/a/SKILL.md');
    expect(problems.some((p) => p.includes('dist/x.js'))).toBe(false);
    expect(problems.some((p) => p.includes('bin/qualiow'))).toBe(false);
  });
});
