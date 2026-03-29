import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { stringify as yamlStringify } from 'yaml';
import { validateTargetConfig } from '../../src/utils/validate.js';

const TMP_DIR = join(
  process.cwd(),
  'tests',
  'fixtures',
  '.tmp-validate-tests',
);

function writeTmpYaml(filename: string, data: unknown): string {
  const filePath = join(TMP_DIR, filename);
  writeFileSync(filePath, yamlStringify(data), 'utf-8');
  return filePath;
}

beforeAll(() => {
  mkdirSync(TMP_DIR, { recursive: true });
});

afterAll(() => {
  rmSync(TMP_DIR, { recursive: true, force: true });
});

describe('validateTargetConfig', () => {
  it('should pass for a valid target config', () => {
    const config = {
      id: 'test-target',
      name: 'Test Target',
      base_url: 'https://example.com',
      domain: 'ecommerce',
      auth: { strategy: 'none' },
      browser: { headless: true, viewport: { width: 1280, height: 720 } },
      scope: { max_depth: 3, start_pages: ['/'] },
    };

    const filePath = writeTmpYaml('valid-target.yml', config);
    const result = validateTargetConfig(filePath);

    expect(result.valid).toBe(true);
    expect(result.errors).toBeUndefined();
  });

  it('should pass for a valid target config with safety block', () => {
    const config = {
      id: 'safe-target',
      name: 'Safe Target',
      base_url: 'https://example.com',
      domain: 'fintech',
      auth: { strategy: 'none' },
      browser: { headless: false, viewport: { width: 1024, height: 768 } },
      scope: { max_depth: 2 },
      safety: { read_only: true, no_form_submit: true },
      notes: 'Production environment',
    };

    const filePath = writeTmpYaml('safe-target.yml', config);
    const result = validateTargetConfig(filePath);

    expect(result.valid).toBe(true);
  });

  it('should fail when required field "id" is missing', () => {
    const config = {
      name: 'No ID Target',
      base_url: 'https://example.com',
      domain: 'saas',
      auth: { strategy: 'none' },
      browser: { headless: true, viewport: { width: 1280, height: 720 } },
      scope: { max_depth: 3 },
    };

    const filePath = writeTmpYaml('missing-id.yml', config);
    const result = validateTargetConfig(filePath);

    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors!.some((e) => e.path === 'id')).toBe(true);
  });

  it('should fail when base_url is not a valid URL', () => {
    const config = {
      id: 'bad-url',
      name: 'Bad URL Target',
      base_url: 'not-a-url',
      domain: 'ecommerce',
      auth: { strategy: 'none' },
      browser: { headless: true, viewport: { width: 1280, height: 720 } },
      scope: { max_depth: 3 },
    };

    const filePath = writeTmpYaml('bad-url.yml', config);
    const result = validateTargetConfig(filePath);

    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors!.some((e) => e.path === 'base_url')).toBe(true);
  });

  it('should fail when auth strategy is invalid', () => {
    const config = {
      id: 'bad-auth',
      name: 'Bad Auth Target',
      base_url: 'https://example.com',
      domain: 'saas',
      auth: { strategy: 'oauth2' },
      browser: { headless: true, viewport: { width: 1280, height: 720 } },
      scope: { max_depth: 3 },
    };

    const filePath = writeTmpYaml('bad-auth.yml', config);
    const result = validateTargetConfig(filePath);

    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
    expect(
      result.errors!.some((e) => e.path.includes('auth')),
    ).toBe(true);
  });

  it('should fail when browser viewport is missing', () => {
    const config = {
      id: 'no-viewport',
      name: 'No Viewport',
      base_url: 'https://example.com',
      domain: 'ecommerce',
      auth: { strategy: 'none' },
      browser: { headless: true },
      scope: { max_depth: 3 },
    };

    const filePath = writeTmpYaml('no-viewport.yml', config);
    const result = validateTargetConfig(filePath);

    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
  });

  it('should handle non-existent file gracefully', () => {
    const result = validateTargetConfig(
      join(TMP_DIR, 'does-not-exist.yml'),
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors!.length).toBeGreaterThan(0);
  });
});
