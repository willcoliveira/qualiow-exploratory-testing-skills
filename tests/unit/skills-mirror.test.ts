import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const REPO_ROOT = resolve(process.cwd());

function listFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  const walk = (d: string) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.push(relative(dir, full).split('\\').join('/'));
    }
  };
  walk(dir);
  return out.sort();
}

/**
 * Byte-compares two directory trees and returns a list of human-readable
 * difference descriptions: missing-from-either-side files, and files present
 * on both sides with different content.
 */
function diffTrees(aDir: string, bDir: string, aLabel: string, bLabel: string): string[] {
  const aFiles = new Set(listFiles(aDir));
  const bFiles = new Set(listFiles(bDir));
  const diffs: string[] = [];

  for (const rel of aFiles) {
    if (!bFiles.has(rel)) {
      diffs.push(`present in ${aLabel} but missing from ${bLabel}: ${rel}`);
    }
  }
  for (const rel of bFiles) {
    if (!aFiles.has(rel)) {
      diffs.push(`present in ${bLabel} but missing from ${aLabel}: ${rel}`);
    }
  }
  for (const rel of aFiles) {
    if (bFiles.has(rel)) {
      const aContent = readFileSync(join(aDir, rel));
      const bContent = readFileSync(join(bDir, rel));
      if (!aContent.equals(bContent)) {
        diffs.push(`content differs between ${aLabel} and ${bLabel}: ${rel}`);
      }
    }
  }

  return diffs.sort();
}

describe('skills mirror: .claude/skills vs skills/', () => {
  it('is byte-identical in both directions', () => {
    const diffs = diffTrees(
      join(REPO_ROOT, '.claude', 'skills'),
      join(REPO_ROOT, 'skills'),
      '.claude/skills',
      'skills',
    );
    expect(diffs, `Differences:\n${diffs.join('\n')}`).toEqual([]);
  });
});

describe('agents mirror: .claude/agents vs agents/', () => {
  it('is byte-identical in both directions', () => {
    const diffs = diffTrees(
      join(REPO_ROOT, '.claude', 'agents'),
      join(REPO_ROOT, 'agents'),
      '.claude/agents',
      'agents',
    );
    expect(diffs, `Differences:\n${diffs.join('\n')}`).toEqual([]);
  });
});
