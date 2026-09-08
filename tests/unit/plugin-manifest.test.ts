import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const REPO_ROOT = resolve(process.cwd());

describe('.claude-plugin/plugin.json', () => {
  const plugin = JSON.parse(
    readFileSync(join(REPO_ROOT, '.claude-plugin', 'plugin.json'), 'utf-8'),
  ) as { name: string; version: string };
  const pkg = JSON.parse(
    readFileSync(join(REPO_ROOT, 'package.json'), 'utf-8'),
  ) as { version: string };

  it('has name "qualiow"', () => {
    expect(plugin.name).toBe('qualiow');
  });

  it('has a version matching package.json', () => {
    expect(plugin.version).toBe(pkg.version);
  });

  it('has the qa-gather-agent under agents/ or .claude/agents/', () => {
    const candidates = [
      join(REPO_ROOT, 'agents', 'qa-gather-agent.md'),
      join(REPO_ROOT, '.claude', 'agents', 'qa-gather-agent.md'),
    ];
    expect(candidates.some((p) => existsSync(p))).toBe(true);
  });
});
