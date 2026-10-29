import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runExplore } from '../../src/cli/commands/explore.js';
import { mergeQualiowHookSettings, QUALIOW_PERMISSION_ALLOW } from '../../src/utils/settings-merge.js';

const tmpDirs: string[] = [];
function makeTmpCwd(): string {
  const dir = mkdtempSync(join(tmpdir(), 'qualiow-explore-'));
  tmpDirs.push(dir);
  return dir;
}
afterEach(() => {
  while (tmpDirs.length) rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});
const silentLog = (): void => {};

describe('runExplore — an existing session directory', () => {
  it('refuses a second run in the same minute instead of overwriting the charter', async () => {
    const cwd = makeTmpCwd();
    const now = new Date(2026, 8, 8, 18, 13);
    const first = await runExplore('https://example.com', { timeBox: '45m', dryRun: false }, { cwd, now, log: silentLog });
    const charter = join(first.sessionDir, 'charter.md');
    writeFileSync(charter, `${readFileSync(charter, 'utf-8')}\nfilled in by phase 2\n`);

    await expect(
      runExplore('https://example.com', { timeBox: '45m', dryRun: false }, { cwd, now, log: silentLog }),
    ).rejects.toThrow(/already exists/);
    expect(readFileSync(charter, 'utf-8')).toContain('filled in by phase 2');
  });

  it('a dry run over an existing directory still writes nothing and does not throw', async () => {
    const cwd = makeTmpCwd();
    const now = new Date(2026, 8, 8, 18, 13);
    const first = await runExplore('https://example.com', { timeBox: '45m', dryRun: false }, { cwd, now, log: silentLog });
    const dry = await runExplore('https://example.com', { timeBox: '45m', dryRun: true }, { cwd, now, log: silentLog });
    expect(dry.sessionDir).toBe(first.sessionDir);
    expect(existsSync(join(first.sessionDir, 'charter.md'))).toBe(true);
  });
});

describe('runExplore — charter date', () => {
  it.skipIf(process.platform === 'win32')('is the local date the directory name carries, not the UTC one', async () => {
    const previous = process.env.TZ;
    // UTC+14: 01:00 local on the 8th is still the 7th in UTC.
    process.env.TZ = 'Pacific/Kiritimati';
    try {
      const cwd = makeTmpCwd();
      const now = new Date(2026, 8, 8, 1, 0);
      const { sessionDir } = await runExplore('https://example.com', { timeBox: '45m', dryRun: false }, { cwd, now, log: silentLog });
      const name = sessionDir.split(/[\\/]/).pop()!;
      expect(name.startsWith('2026-09-08-0100-')).toBe(true);
      const charter = readFileSync(join(sessionDir, 'charter.md'), 'utf-8');
      expect(charter).toContain('**Date:** 2026-09-08');
    } finally {
      if (previous === undefined) delete process.env.TZ;
      else process.env.TZ = previous;
    }
  });
});

describe('runExplore — web pre-flight', () => {
  /** A machine with nothing installed: an empty PATH, an empty home, Windows env vars pointing nowhere. */
  function bare() {
    const cwd = makeTmpCwd();
    const home = makeTmpCwd();
    const env = { PATH: join(home, 'bin'), LOCALAPPDATA: join(home, 'AppData', 'Local') };
    return { cwd, home, env, platform: 'win32' as const };
  }

  function touch(path: string, content = ''): void {
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, content);
  }

  /** What `qualiow init --hooks` leaves in a project. */
  function initHooks(cwd: string): void {
    for (const f of ['read-guard.mjs', 'write-guard.mjs', 'bash-guard.mjs']) touch(join(cwd, 'qa', 'hooks', f));
    touch(join(cwd, '.claude', 'settings.json'), JSON.stringify(mergeQualiowHookSettings({}).settings, null, 2));
  }

  it('warns about each missing piece on a bare machine, and still creates the session', async () => {
    const ctx = bare();
    const lines: string[] = [];
    const result = await runExplore('https://example.com', { timeBox: '45m', dryRun: false }, { ...ctx, log: (l) => void lines.push(l) });
    expect(existsSync(result.sessionDir)).toBe(true);
    expect(result.preflight.map((c) => [c.name, c.ok])).toEqual([
      ['playwright-cli', false],
      ['browser', false],
      ['hooks', false],
      ['permissions', false],
    ]);
    const text = lines.join('\n');
    expect(text).toContain('npm install -g @playwright/cli');
    expect(text).toContain('playwright-cli install-browser');
    expect(text).toContain('qualiow init --hooks');
    for (const rule of QUALIOW_PERMISSION_ALLOW) expect(text).toContain(rule);
  });

  it('passes on a set-up project: playwright-cli on PATH, a Playwright Chromium, init --hooks', async () => {
    const ctx = bare();
    touch(join(ctx.home, 'bin', 'playwright-cli.cmd'));
    mkdirSync(join(ctx.env.LOCALAPPDATA, 'ms-playwright', 'chromium-1200'), { recursive: true });
    initHooks(ctx.cwd);
    const result = await runExplore('https://example.com', { timeBox: '45m', dryRun: true }, { ...ctx, log: silentLog });
    expect(result.preflight.filter((c) => !c.ok)).toEqual([]);
  });

  it('finds the playwright-cli the project installed, and Google Chrome', async () => {
    const ctx = bare();
    touch(join(ctx.cwd, 'node_modules', '.bin', 'playwright-cli'));
    touch(join(ctx.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'));
    const result = await runExplore('https://example.com', { timeBox: '45m', dryRun: true }, { ...ctx, log: silentLog });
    expect(result.preflight.find((c) => c.name === 'playwright-cli')?.ok).toBe(true);
    expect(result.preflight.find((c) => c.name === 'browser')?.message).toContain('Google Chrome');
  });

  it('a plugin install counts as hooks registered; allow rules may sit in settings.local.json', async () => {
    const ctx = bare();
    const plugin = makeTmpCwd();
    touch(join(plugin, 'hooks', 'hooks.json'), '{}');
    touch(join(ctx.cwd, '.claude', 'settings.local.json'), JSON.stringify({ permissions: { allow: QUALIOW_PERMISSION_ALLOW } }));
    const result = await runExplore(
      'https://example.com',
      { timeBox: '45m', dryRun: true },
      { ...ctx, env: { ...ctx.env, CLAUDE_PLUGIN_ROOT: plugin }, log: silentLog },
    );
    expect(result.preflight.find((c) => c.name === 'hooks')?.ok).toBe(true);
    expect(result.preflight.find((c) => c.name === 'permissions')?.ok).toBe(true);
  });

  it('names a guard that is not registered, and QUALIOW_HOOKS=off', async () => {
    const ctx = bare();
    initHooks(ctx.cwd);
    rmSync(join(ctx.cwd, 'qa', 'hooks', 'bash-guard.mjs'));
    const partial = await runExplore('https://example.com', { timeBox: '45m', dryRun: true }, { ...ctx, log: silentLog });
    expect(partial.preflight.find((c) => c.name === 'hooks')?.message).toContain('bash-guard.mjs');

    const off = await runExplore(
      'https://example.com',
      { timeBox: '45m', dryRun: true },
      { ...ctx, env: { ...ctx.env, QUALIOW_HOOKS: 'off' }, log: silentLog },
    );
    expect(off.preflight.find((c) => c.name === 'hooks')).toEqual({
      name: 'hooks',
      ok: false,
      message: 'the guard hooks are switched off (QUALIOW_HOOKS=off)',
    });
  });
});
