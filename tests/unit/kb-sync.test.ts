import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, cpSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseDocument } from 'yaml';
import { syncKnowledgeManifest } from '../../src/utils/kb-sync.js';

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

describe('syncKnowledgeManifest — real repo data', () => {
  it('reports the manifest as already in sync, with 29 entries', () => {
    const result = syncKnowledgeManifest(REPO_DATA_DIR, { check: true });
    expect(result.changed).toBe(false);
    expect(result.entryCount).toBe(29);
  });
});

describe('syncKnowledgeManifest — entries block removed', () => {
  it('detects drift with check, then sync fixes it, then a following check is clean', () => {
    const dataDir = makeTmpDataCopy();
    const manifestPath = join(dataDir, 'knowledge', 'manifest.yml');

    const before = readFileSync(manifestPath, 'utf-8');
    const doc = parseDocument(before);
    doc.delete('entries');
    writeFileSync(manifestPath, doc.toString(), 'utf-8');

    // Sanity: the entries block really is gone now.
    const stripped = readFileSync(manifestPath, 'utf-8');
    expect(stripped).not.toMatch(/^entries:/m);

    const checkResult = syncKnowledgeManifest(dataDir, { check: true });
    expect(checkResult.changed).toBe(true);
    expect(checkResult.entryCount).toBe(29);

    // check must not have written anything.
    expect(readFileSync(manifestPath, 'utf-8')).toBe(stripped);

    const syncResult = syncKnowledgeManifest(dataDir, { check: false });
    expect(syncResult.changed).toBe(true);
    expect(syncResult.entryCount).toBe(29);

    const afterSync = readFileSync(manifestPath, 'utf-8');
    expect(afterSync).toMatch(/^entries:/m);

    const secondCheck = syncKnowledgeManifest(dataDir, { check: true });
    expect(secondCheck.changed).toBe(false);
    expect(secondCheck.entryCount).toBe(29);

    // Comments and loading_strategy content survive the round trip.
    expect(afterSync).toContain('# Qualiow Exploratory Testing Skills — Knowledge Base Manifest');
    expect(afterSync).toContain('# Loading strategy controls which entries are loaded into context.');
    expect(afterSync).toMatch(/loading_strategy:/);
    expect(afterSync).toContain('heuristic-sfdipot');
    expect(afterSync).toContain('by_domain:');
    expect(afterSync).toContain('by_tag:');
  });
});

describe('listReleaseDirs / buildManifestRegistry / computeStats', () => {
  it('are consistent with the manifest stats on real data', async () => {
    const { listReleaseDirs, buildManifestRegistry, computeStats } = await import(
      '../../src/utils/kb-sync.js'
    );
    const knowledgeDir = join(REPO_DATA_DIR, 'knowledge');
    const releases = listReleaseDirs(knowledgeDir);
    expect(releases).toEqual([...releases].sort());
    expect(releases.length).toBeGreaterThan(0);

    const registry = buildManifestRegistry(REPO_DATA_DIR);
    expect(registry.length).toBe(29);

    const stats = computeStats(REPO_DATA_DIR, registry);
    expect(stats.total_entries).toBe(29);
    expect(stats.heuristics + stats.techniques + stats.checklists + stats.references).toBe(29);
  });
});
