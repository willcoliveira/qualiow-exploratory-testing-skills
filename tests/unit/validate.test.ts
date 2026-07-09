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

describe('validateTargetConfig (mobile targets)', () => {
  it('should pass for a valid mobile WEB-mode target (browser + web.base_url)', () => {
    const config = {
      id: 'sim-ios-safari',
      name: 'Mobile Web on iOS Simulator Safari',
      platform: 'ios',
      domain: '_default',
      device: { name: 'qa-iphone' },
      app: { bundle_id: 'com.apple.mobilesafari' },
      web: {
        base_url: 'https://staging.m.example.com',
        start_url: 'https://staging.m.example.com/login',
      },
      auth: { strategy: 'interactive-sso', identity_provider: 'Entra' },
      scope: { start_screen: 'login' },
    };

    const filePath = writeTmpYaml('mobile-web-target.yml', config);
    const result = validateTargetConfig(filePath);

    expect(result.valid).toBe(true);
  });

  it('should pass for a valid mobile NATIVE-mode target (installable app)', () => {
    const config = {
      id: 'native-app',
      name: 'Native App on Android Emulator',
      platform: 'android',
      domain: '_default',
      device: { avd: 'qa_pixel_api35', serial: 'emulator-5554' },
      app: {
        package: 'com.example.myapp',
        apk_paths: ['/path/to/app.apk'],
      },
      auth: { strategy: 'in-app', static_otp: '000000' },
      source_repo: {
        path: '/path/to/source',
        build_commands: { android_release: 'make android' },
      },
    };

    const filePath = writeTmpYaml('mobile-native-target.yml', config);
    const result = validateTargetConfig(filePath);

    expect(result.valid).toBe(true);
  });

  it('should fail a mobile target with an invalid platform', () => {
    const config = {
      id: 'bad-platform',
      name: 'Bad Platform',
      platform: 'windows-phone',
      domain: '_default',
      device: { name: 'x' },
      app: { bundle_id: 'com.example' },
      auth: { strategy: 'none' },
    };

    const filePath = writeTmpYaml('mobile-bad-platform.yml', config);
    const result = validateTargetConfig(filePath);

    expect(result.valid).toBe(false);
    expect(result.errors!.some((e) => e.path === 'platform')).toBe(true);
  });

  it('should fail a mobile target missing device and app', () => {
    const config = {
      id: 'missing-bits',
      name: 'Missing Device And App',
      platform: 'ios',
      domain: '_default',
      auth: { strategy: 'none' },
    };

    const filePath = writeTmpYaml('mobile-missing-bits.yml', config);
    const result = validateTargetConfig(filePath);

    expect(result.valid).toBe(false);
    expect(result.errors!.some((e) => e.path === 'device')).toBe(true);
    expect(result.errors!.some((e) => e.path === 'app')).toBe(true);
  });

  it('should still fail web targets on web-only requirements (no platform key)', () => {
    const config = {
      id: 'web-target',
      name: 'Web Without Browser',
      base_url: 'https://example.com',
      domain: 'ecommerce',
      auth: { strategy: 'none' },
      scope: { max_depth: 3 },
    };

    const filePath = writeTmpYaml('web-no-browser.yml', config);
    const result = validateTargetConfig(filePath);

    expect(result.valid).toBe(false);
    expect(result.errors!.some((e) => e.path === 'browser')).toBe(true);
  });
});
