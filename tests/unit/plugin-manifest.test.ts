import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const REPO_ROOT = resolve(process.cwd());

describe('.claude-plugin/plugin.json', () => {
  const plugin = JSON.parse(
    readFileSync(join(REPO_ROOT, '.claude-plugin', 'plugin.json'), 'utf-8'),
  ) as { name: string; version: string; hooks?: unknown };
  const pkg = JSON.parse(
    readFileSync(join(REPO_ROOT, 'package.json'), 'utf-8'),
  ) as { version: string };

  it('has name "qualiow"', () => {
    expect(plugin.name).toBe('qualiow');
  });

  it('has a version matching package.json', () => {
    expect(plugin.version).toBe(pkg.version);
  });

  it('has no hooks key (hooks ship via hooks/hooks.json, not the manifest)', () => {
    expect(plugin.hooks).toBeUndefined();
  });

  it('ships the four sub-agents under .claude/agents/', () => {
    const canonicalDir = join(REPO_ROOT, '.claude', 'agents');
    for (const agent of [
      'qa-gather-agent',
      'qa-reporting-agent',
      'qa-diff-indexer-agent',
      'qa-page-mapper-agent',
    ]) {
      expect(
        existsSync(join(canonicalDir, `${agent}.md`)),
        `missing .claude/agents/${agent}.md`,
      ).toBe(true);
    }
  });

  it('every *.md in .claude/agents/ has a byte-identical twin in agents/ (or agents/ is absent)', () => {
    const canonicalDir = join(REPO_ROOT, '.claude', 'agents');
    const mirrorDir = join(REPO_ROOT, 'agents');
    const canonicalMdFiles = readdirSync(canonicalDir).filter((f) => f.endsWith('.md'));

    expect(canonicalMdFiles.length).toBeGreaterThan(0);

    if (!existsSync(mirrorDir)) return;

    for (const f of canonicalMdFiles) {
      const canonical = readFileSync(join(canonicalDir, f));
      const mirrorPath = join(mirrorDir, f);
      expect(existsSync(mirrorPath)).toBe(true);
      expect(readFileSync(mirrorPath).equals(canonical)).toBe(true);
    }
  });
});

describe('.claude-plugin/marketplace.json', () => {
  const marketplacePath = join(REPO_ROOT, '.claude-plugin', 'marketplace.json');
  const pkg = JSON.parse(
    readFileSync(join(REPO_ROOT, 'package.json'), 'utf-8'),
  ) as { version: string };

  it('exists', () => {
    expect(existsSync(marketplacePath)).toBe(true);
  });

  const marketplace = JSON.parse(readFileSync(marketplacePath, 'utf-8')) as {
    name: string;
    plugins: Array<{ name: string; source: string; version: string }>;
  };

  it('has name "qualiow"', () => {
    expect(marketplace.name).toBe('qualiow');
  });

  it('has plugins[0].name "qualiow"', () => {
    expect(marketplace.plugins[0].name).toBe('qualiow');
  });

  it('has plugins[0].source "./"', () => {
    expect(marketplace.plugins[0].source).toBe('./');
  });

  it('has plugins[0].version matching package.json', () => {
    expect(marketplace.plugins[0].version).toBe(pkg.version);
  });
});

describe('bin/qualiow', () => {
  it('exists and is executable', () => {
    const shimPath = join(REPO_ROOT, 'bin', 'qualiow');
    expect(existsSync(shimPath)).toBe(true);
    const mode = statSync(shimPath).mode;
    expect(mode & 0o111).not.toBe(0);
  });
});
