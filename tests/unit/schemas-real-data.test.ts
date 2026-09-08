import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, basename, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { globSync } from 'glob';
import { TargetConfigSchema } from '../../src/schemas/target.schema.js';
import { DomainConfigSchema } from '../../src/schemas/domain-config.schema.js';
import { KnowledgeEntrySchema } from '../../src/schemas/knowledge-entry.schema.js';

const REPO_ROOT = resolve(process.cwd());
const DATA_DIR = join(REPO_ROOT, 'data');

function readYaml(filePath: string): unknown {
  return parseYaml(readFileSync(filePath, 'utf-8'));
}

describe('every shipped target config parses through TargetConfigSchema', () => {
  const files = readdirSync(join(DATA_DIR, 'targets'))
    .filter((f) => f.endsWith('.yml') && !f.startsWith('local-'))
    .sort();

  it('finds at least one target file to check', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    it(`${file} is valid and id === file stem`, () => {
      const filePath = join(DATA_DIR, 'targets', file);
      const data = readYaml(filePath) as { id?: string };
      expect(() => TargetConfigSchema.parse(data)).not.toThrow();
      expect(data.id).toBe(basename(file, '.yml'));
    });
  }
});

describe('every shipped domain config parses through DomainConfigSchema', () => {
  const files = readdirSync(join(DATA_DIR, 'domains'))
    .filter((f) => f.endsWith('.yml'))
    .sort();

  it('finds at least one domain file to check', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    it(`${file} is valid`, () => {
      const filePath = join(DATA_DIR, 'domains', file);
      const data = readYaml(filePath);
      expect(() => DomainConfigSchema.parse(data)).not.toThrow();
    });
  }
});

describe('every shipped knowledge entry parses through KnowledgeEntrySchema', () => {
  const files = globSync(
    join(DATA_DIR, 'knowledge', 'releases', '*', 'entries', '*.yml'),
  ).sort();

  it('finds at least one knowledge entry file to check', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    const rel = file.slice(DATA_DIR.length + 1);
    it(`${rel} is valid`, () => {
      const data = readYaml(file);
      expect(() => KnowledgeEntrySchema.parse(data)).not.toThrow();
    });
  }
});

describe('TargetConfigSchema — strict unknown-key rejection', () => {
  const base = {
    id: 'x',
    name: 'X',
    base_url: 'https://example.com',
    domain: 'ecommerce',
    auth: { strategy: 'none' as const },
    browser: { headless: true, viewport: { width: 1280, height: 720 } },
    scope: { max_depth: 3 },
  };

  it('fails on an unknown nested key (auth.bogus) with a path that includes "auth"', () => {
    const bad = { ...base, auth: { strategy: 'none', bogus: 'nope' } };
    const result = TargetConfigSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths.some((p) => p.includes('auth'))).toBe(true);
    }
  });

  it('fails on an unknown top-level key', () => {
    const bad = { ...base, bogus_top_level: true };
    const result = TargetConfigSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });
});

describe('TargetConfigSchema — mobile branch discrimination', () => {
  it('parses a mobile target (platform present) and the output carries platform', () => {
    const mobile = {
      id: 'sim-target',
      name: 'Sim Target',
      platform: 'ios' as const,
      domain: '_default',
      device: { name: 'qa-iphone' },
      app: { bundle_id: 'com.apple.mobilesafari' },
      web: { base_url: 'https://staging.example.com' },
      auth: { strategy: 'interactive-sso' as const },
    };
    const parsed = TargetConfigSchema.parse(mobile) as { platform?: string };
    expect(parsed.platform).toBe('ios');
  });

  it('parses a web target (no platform) and the output has no platform field', () => {
    const parsed = TargetConfigSchema.parse(base_web()) as { platform?: string };
    expect(parsed.platform).toBeUndefined();
  });

  function base_web() {
    return {
      id: 'web-target',
      name: 'Web Target',
      base_url: 'https://example.com',
      domain: 'ecommerce',
      auth: { strategy: 'none' as const },
      browser: { headless: true, viewport: { width: 1280, height: 720 } },
      scope: { max_depth: 3 },
    };
  }
});
