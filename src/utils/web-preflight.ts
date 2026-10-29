/**
 * Web pre-flight for `qualiow explore` — the web counterpart of `doctor-mobile.sh`.
 *
 * Fast, read-only, network-free checks of what a `/qa-explore` session needs before it
 * starts: a `playwright-cli` the skills' commands reach, a browser for it to open, the
 * guard hooks registered, and the permission rules that keep every browser command from
 * prompting. Nothing here spawns a process — `playwright-cli` itself checks for updates
 * over the network when it starts. Every finding is a warning: the session can still
 * run, and the check may simply not see a setup it does not know.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { QUALIOW_HOOK_ENTRIES, QUALIOW_PERMISSION_ALLOW } from './settings-merge.js';

export interface PreflightCheck {
  /** `playwright-cli`, `browser`, `hooks` or `permissions`. */
  name: string;
  ok: boolean;
  message: string;
}

export interface WebPreflightContext {
  cwd: string;
  env: NodeJS.ProcessEnv;
  platform: NodeJS.Platform;
  home: string;
}

const GUARD_SCRIPTS = ['read-guard.mjs', 'write-guard.mjs', 'bash-guard.mjs'];

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function findOnPath(name: string, ctx: WebPreflightContext): string | undefined {
  // npm installs a `.cmd` shim on Windows, never a bare file.
  const names = ctx.platform === 'win32' ? [`${name}.cmd`, `${name}.exe`, `${name}.ps1`, name] : [name];
  for (const dir of (ctx.env.PATH ?? ctx.env.Path ?? '').split(delimiter)) {
    if (!dir) continue;
    for (const n of names) {
      const candidate = join(dir, n);
      if (isFile(candidate)) return candidate;
    }
  }
  return undefined;
}

function checkPlaywrightCli(ctx: WebPreflightContext): PreflightCheck {
  const found =
    findOnPath('playwright-cli', ctx) ??
    [join(ctx.cwd, 'node_modules', '.bin', 'playwright-cli'), join(ctx.cwd, 'node_modules', '.bin', 'playwright-cli.cmd')].find(
      isFile,
    );
  if (found) return { name: 'playwright-cli', ok: true, message: `playwright-cli: ${found}` };
  return {
    name: 'playwright-cli',
    ok: false,
    message:
      'playwright-cli is not on PATH or in node_modules/.bin — commands would fall back to `npx playwright-cli`, ' +
      'which downloads it on first use. Install it: npm install -g @playwright/cli',
  };
}

/** Where Google Chrome stable is installed — the channel playwright-cli opens by default. */
function chromeCandidates(ctx: WebPreflightContext): string[] {
  switch (ctx.platform) {
    case 'darwin':
      return ['/Applications', join(ctx.home, 'Applications')].map((d) =>
        join(d, 'Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome'),
      );
    case 'win32':
      return [ctx.env.LOCALAPPDATA, ctx.env.PROGRAMFILES, ctx.env['PROGRAMFILES(X86)']]
        .filter((d): d is string => Boolean(d))
        .map((d) => join(d, 'Google', 'Chrome', 'Application', 'chrome.exe'));
    default:
      return ['/opt/google/chrome/chrome'];
  }
}

/** Playwright's own browser cache: `PLAYWRIGHT_BROWSERS_PATH`, else the per-OS default. */
function playwrightCacheDir(ctx: WebPreflightContext): string | undefined {
  const explicit = ctx.env.PLAYWRIGHT_BROWSERS_PATH;
  // `0` keeps browsers inside node_modules/playwright-core — not cheaply located.
  if (explicit) return explicit === '0' ? undefined : explicit;
  if (ctx.platform === 'darwin') return join(ctx.home, 'Library', 'Caches', 'ms-playwright');
  if (ctx.platform === 'win32') return ctx.env.LOCALAPPDATA ? join(ctx.env.LOCALAPPDATA, 'ms-playwright') : undefined;
  return join(ctx.env.XDG_CACHE_HOME || join(ctx.home, '.cache'), 'ms-playwright');
}

function checkBrowser(ctx: WebPreflightContext): PreflightCheck {
  const chrome = chromeCandidates(ctx).find(isFile);
  if (chrome) return { name: 'browser', ok: true, message: `browser: Google Chrome (${chrome})` };
  const cache = playwrightCacheDir(ctx);
  let managed: string | undefined;
  try {
    managed = cache ? readdirSync(cache).find((n) => /^(chromium|chromium_headless_shell|chrome)[-_]/.test(n)) : undefined;
  } catch {
    managed = undefined;
  }
  if (cache && managed) return { name: 'browser', ok: true, message: `browser: Playwright ${managed} (${cache})` };
  return {
    name: 'browser',
    ok: false,
    message:
      'no Google Chrome (the browser playwright-cli opens by default) and no Playwright-managed Chromium found — ' +
      'install Chrome, or run: playwright-cli install-browser',
  };
}

function readJson(path: string): Record<string, unknown> | 'unreadable' | undefined {
  if (!existsSync(path)) return undefined;
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf-8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : 'unreadable';
  } catch {
    return 'unreadable';
  }
}

interface SettingsFile {
  label: string;
  settings: Record<string, unknown>;
}

/** The project's settings files, then the user's — those that exist and parse. */
function settingsFiles(ctx: WebPreflightContext, unreadable: string[]): SettingsFile[] {
  const files: SettingsFile[] = [];
  for (const [label, path] of [
    ['.claude/settings.json', join(ctx.cwd, '.claude', 'settings.json')],
    ['.claude/settings.local.json', join(ctx.cwd, '.claude', 'settings.local.json')],
    ['~/.claude/settings.json', join(ctx.home, '.claude', 'settings.json')],
  ] as const) {
    const parsed = readJson(path);
    if (parsed === 'unreadable') unreadable.push(label);
    else if (parsed) files.push({ label, settings: parsed });
  }
  return files;
}

function registeredHookCommands(settings: Record<string, unknown>): Set<string> {
  const commands = new Set<string>();
  const hooks = settings.hooks as { PreToolUse?: unknown } | undefined;
  const entries = hooks && Array.isArray(hooks.PreToolUse) ? hooks.PreToolUse : [];
  for (const entry of entries as { hooks?: unknown }[]) {
    if (!entry || !Array.isArray(entry.hooks)) continue;
    for (const h of entry.hooks as { command?: unknown }[]) {
      if (h && typeof h.command === 'string') commands.add(h.command);
    }
  }
  return commands;
}

function qualiowPluginEnabled(files: SettingsFile[]): boolean {
  return files.some(({ settings }) => {
    const enabled = settings.enabledPlugins;
    if (!enabled || typeof enabled !== 'object') return false;
    return Object.entries(enabled as Record<string, unknown>).some(([id, on]) => on === true && /^qualiow@/.test(id));
  });
}

function checkHooks(ctx: WebPreflightContext, files: SettingsFile[]): PreflightCheck {
  if ((ctx.env.QUALIOW_HOOKS ?? '').toLowerCase() === 'off') {
    return { name: 'hooks', ok: false, message: 'the guard hooks are switched off (QUALIOW_HOOKS=off)' };
  }
  const pluginRoot = ctx.env.CLAUDE_PLUGIN_ROOT;
  if (pluginRoot && isFile(join(pluginRoot, 'hooks', 'hooks.json'))) {
    return { name: 'hooks', ok: true, message: `hooks: plugin (${join(pluginRoot, 'hooks', 'hooks.json')})` };
  }
  if (qualiowPluginEnabled(files)) {
    return { name: 'hooks', ok: true, message: 'hooks: the qualiow plugin is enabled — it ships them' };
  }

  const missingScripts = GUARD_SCRIPTS.filter((f) => !isFile(join(ctx.cwd, 'qa', 'hooks', f)));
  const registered = new Set(files.flatMap((f) => [...registeredHookCommands(f.settings)]));
  const unregistered = QUALIOW_HOOK_ENTRIES.filter((e) => !registered.has(e.command)).map(
    (e) => /([\w-]+\.mjs)/.exec(e.command)?.[1] ?? e.command,
  );
  if (missingScripts.length === 0 && unregistered.length === 0) {
    return { name: 'hooks', ok: true, message: 'hooks: qa/hooks/ registered in .claude/settings.json' };
  }
  const gaps = [
    ...(missingScripts.length ? [`qa/hooks/ is missing ${missingScripts.join(', ')}`] : []),
    ...(unregistered.length ? [`.claude/settings.json does not register ${unregistered.join(', ')}`] : []),
  ];
  return {
    name: 'hooks',
    ok: false,
    message: `the guard hooks are not set up (${gaps.join('; ')}) — run: qualiow init --hooks, or install the qualiow plugin`,
  };
}

function checkPermissions(files: SettingsFile[]): PreflightCheck {
  const allowed = new Set<string>();
  for (const { settings } of files) {
    const permissions = settings.permissions as { allow?: unknown } | undefined;
    if (permissions && Array.isArray(permissions.allow)) {
      for (const rule of permissions.allow) if (typeof rule === 'string') allowed.add(rule);
    }
  }
  const missing = QUALIOW_PERMISSION_ALLOW.filter((r) => !allowed.has(r));
  if (missing.length === 0) return { name: 'permissions', ok: true, message: 'permissions: allow rules present' };
  return {
    name: 'permissions',
    ok: false,
    message: `permissions.allow lacks ${missing.join(', ')} — each such command will prompt; qualiow init --hooks adds them`,
  };
}

export function runWebPreflight(ctx: WebPreflightContext): PreflightCheck[] {
  const unreadable: string[] = [];
  const files = settingsFiles(ctx, unreadable);
  const checks = [checkPlaywrightCli(ctx), checkBrowser(ctx), checkHooks(ctx, files), checkPermissions(files)];
  for (const label of unreadable) {
    checks.push({ name: 'settings', ok: false, message: `${label} is not valid JSON — Claude Code will not read it either` });
  }
  return checks;
}
