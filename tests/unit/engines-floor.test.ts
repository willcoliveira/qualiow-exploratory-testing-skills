import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

type Ver = [number, number, number];

function parseVer(s: string): Ver {
  const [a = '0', b = '0', c = '0'] = s.replace(/^[v=]/, '').split('.');
  return [parseInt(a, 10) || 0, parseInt(b, 10) || 0, parseInt(c, 10) || 0];
}

function cmp(a: Ver, b: Ver): number {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return (a[i] as number) - (b[i] as number);
  return 0;
}

/**
 * Does every Node version >= floor satisfy the engines clause?
 * Handles `a || b` alternatives and `>=`/`>` comparators. A bare major ("18") or an
 * upper bound only matches part of the open-ended range above the floor, so it never counts.
 */
function floorSatisfies(floor: Ver, range: string): boolean {
  return range.split('||').some((alt) => {
    const text = alt.trim();
    if (text === '' || text === '*') return true;
    return text.replace(/(>=|>)\s+/g, '$1').split(/\s+/).every((tok) => {
      const m = /^(>=|>)(\d+(?:\.\d+){0,2})$/.exec(tok);
      if (!m) return false;
      const v = parseVer(m[2] as string);
      return m[1] === '>=' ? cmp(floor, v) >= 0 : cmp(floor, v) > 0;
    });
  });
}

describe('engines.node floor', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf-8'));
  const lock = JSON.parse(readFileSync('package-lock.json', 'utf-8'));
  const floor = parseVer(String(pkg.engines.node).replace(/^>=/, ''));

  it('is at least 22.12.0', () => {
    expect(cmp(floor, [22, 12, 0])).toBeGreaterThanOrEqual(0);
  });

  it('satisfies engines.node of every runtime (non-dev) package in the lockfile', () => {
    const bad: string[] = [];
    for (const [path, entry] of Object.entries<{
      dev?: boolean;
      devOptional?: boolean;
      engines?: { node?: string };
    }>(lock.packages)) {
      if (!path || entry.dev || entry.devOptional || !entry.engines?.node) continue;
      if (!floorSatisfies(floor, entry.engines.node)) bad.push(`${path}: ${entry.engines.node}`);
    }
    expect(bad).toEqual([]);
  });
});
