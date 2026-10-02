import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { TargetConfigSchema, VerificationConfigSchema } from '../../src/schemas/target.schema.js';
import { runReport } from '../../src/cli/commands/report.js';

const base = {
  id: 'example',
  name: 'Example',
  base_url: 'https://example.com',
  domain: 'ecommerce',
  auth: { strategy: 'none' as const },
  browser: { headless: true, viewport: { width: 1280, height: 720 } },
  scope: { max_depth: 2 },
};

type Parsed = { verification?: { mode: string } };

describe('VerificationConfigSchema', () => {
  it('leaves a target without the block untouched (the judge runs by default)', () => {
    const parsed = TargetConfigSchema.parse(base) as Parsed;
    expect(parsed.verification).toBeUndefined();
  });

  it('defaults an empty block to judge', () => {
    expect(VerificationConfigSchema.parse({})).toEqual({ mode: 'judge' });
    const parsed = TargetConfigSchema.parse({ ...base, verification: {} }) as Parsed;
    expect(parsed.verification?.mode).toBe('judge');
  });

  it('accepts mode off on a web target', () => {
    const parsed = TargetConfigSchema.parse({ ...base, verification: { mode: 'off' } }) as Parsed;
    expect(parsed.verification?.mode).toBe('off');
  });

  it('rejects an unknown mode', () => {
    const result = TargetConfigSchema.safeParse({ ...base, verification: { mode: 'sometimes' } });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain('mode');
  });

  it('rejects an unknown key inside the block', () => {
    const result = TargetConfigSchema.safeParse({
      ...base,
      verification: { mode: 'judge', budget_min: 30 },
    });
    expect(result.success).toBe(false);
  });

  it('is not accepted on a mobile target', () => {
    const mobile = {
      id: 'm',
      name: 'M',
      platform: 'ios' as const,
      domain: 'ecommerce',
      device: { name: 'qa-iphone' },
      app: { bundle_id: 'com.apple.mobilesafari' },
      web: { base_url: 'https://example.com' },
      auth: { strategy: 'none' as const },
      verification: { mode: 'off' },
    };
    expect(TargetConfigSchema.safeParse(mobile).success).toBe(false);
  });
});

// ── qualiow report on a judged session ─────────────────────────────────────

const VERIFIED_SESSION_NAME = '2026-09-20-1500-explore-verified-example';
const VERIFIED_SESSION_DIR = resolve(
  process.cwd(),
  'tests',
  'fixtures',
  'verified-session',
  VERIFIED_SESSION_NAME,
);

const tmpDirs: string[] = [];
afterEach(() => {
  while (tmpDirs.length) rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});

describe('qualiow report — verified session', () => {
  it('reports the three shipped bugs and never the refuted BUG-104', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'qualiow-verified-'));
    tmpDirs.push(cwd);
    cpSync(VERIFIED_SESSION_DIR, join(cwd, 'output', 'sessions', VERIFIED_SESSION_NAME), {
      recursive: true,
    });
    const result = await runReport(
      { session: 'latest', format: 'json', stdout: false },
      { cwd, log: () => {} },
    );
    const parsed = JSON.parse(result.content) as { bugs: { id: string }[] };
    expect(parsed.bugs.map((b) => b.id).sort()).toEqual(['BUG-101', 'BUG-102', 'BUG-103']);
    expect(result.content).not.toContain('BUG-104');
  });
});
