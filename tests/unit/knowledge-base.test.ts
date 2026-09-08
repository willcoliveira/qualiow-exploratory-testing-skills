import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, cpSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parse as parseYaml, stringify as yamlStringify } from 'yaml';
import { validateKnowledgeBase } from '../../src/utils/validate.js';

const REPO_DATA_DIR = resolve(process.cwd(), 'data');

const tmpDirs: string[] = [];

function makeTmpDataCopy(): string {
  const dir = mkdtempSync(join(tmpdir(), 'qualiow-'));
  cpSync(REPO_DATA_DIR, join(dir, 'data'), { recursive: true });
  tmpDirs.push(dir);
  return join(dir, 'data');
}

afterEach(() => {
  while (tmpDirs.length) {
    const dir = tmpDirs.pop()!;
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('validateKnowledgeBase — real repo data', () => {
  it('every check is valid', () => {
    const results = validateKnowledgeBase(REPO_DATA_DIR);
    const failed = results.filter((r) => !r.valid);
    expect(failed).toEqual([]);
  });

  it('the last result is the cross-check', () => {
    const results = validateKnowledgeBase(REPO_DATA_DIR);
    expect(results[results.length - 1].file).toMatch(/\(cross-check\)$/);
  });
});

describe('validateKnowledgeBase — undeclared entry file', () => {
  it('fails naming the release whose entries directory has the extra file', () => {
    const dataDir = makeTmpDataCopy();
    const entriesDir = join(dataDir, 'knowledge', 'releases', 'v0.1.0', 'entries');
    writeFileSync(
      join(entriesDir, 'technique-zzz-undeclared.yml'),
      yamlStringify({
        id: 'technique-zzz-undeclared',
        version: '0.1.0',
        type: 'technique',
        name: 'Undeclared Test Entry',
        description: 'A test entry added to check undeclared-file detection.',
        tags: ['test'],
        domains: ['all'],
        priority: 'low',
        added: '2026-09-08',
        content: { summary: 'Just a test entry.' },
      }),
      'utf-8',
    );

    const results = validateKnowledgeBase(dataDir);
    const releaseResult = results.find((r) =>
      r.file.endsWith(join('releases', 'v0.1.0', 'release.yml')),
    );
    expect(releaseResult).toBeDefined();
    expect(releaseResult!.valid).toBe(false);
    expect(
      releaseResult!.errors!.some(
        (e) => e.path === 'entries' && e.message.includes('technique-zzz-undeclared'),
      ),
    ).toBe(true);
  });
});

describe('validateKnowledgeBase — wrong entry_count', () => {
  it('fails naming entry_count on the release with the bad count', () => {
    const dataDir = makeTmpDataCopy();
    const releasePath = join(dataDir, 'knowledge', 'releases', 'v0.2.0', 'release.yml');
    const release = parseYaml(readFileSync(releasePath, 'utf-8')) as {
      entry_count: number;
      entries: string[];
    };
    const wrongCount = release.entries.length + 1;
    writeFileSync(
      releasePath,
      yamlStringify({ ...release, entry_count: wrongCount }),
      'utf-8',
    );

    const results = validateKnowledgeBase(dataDir);
    const releaseResult = results.find((r) =>
      r.file.endsWith(join('releases', 'v0.2.0', 'release.yml')),
    );
    expect(releaseResult).toBeDefined();
    expect(releaseResult!.valid).toBe(false);
    expect(releaseResult!.errors!.some((e) => e.path === 'entry_count')).toBe(true);
  });
});

describe('validateKnowledgeBase — unknown id in loading_strategy.always', () => {
  it('fails the cross-check naming loading_strategy and the unknown id', () => {
    const dataDir = makeTmpDataCopy();
    const manifestPath = join(dataDir, 'knowledge', 'manifest.yml');
    const manifest = parseYaml(readFileSync(manifestPath, 'utf-8')) as {
      loading_strategy: { always: string[] };
    };
    manifest.loading_strategy.always.push('heuristic-does-not-exist');
    writeFileSync(manifestPath, yamlStringify(manifest), 'utf-8');

    const results = validateKnowledgeBase(dataDir);
    const crossCheck = results[results.length - 1];
    expect(crossCheck.file).toMatch(/\(cross-check\)$/);
    expect(crossCheck.valid).toBe(false);
    expect(
      crossCheck.errors!.some(
        (e) => e.path === 'loading_strategy' && e.message.includes('heuristic-does-not-exist'),
      ),
    ).toBe(true);
  });
});
