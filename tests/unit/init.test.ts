import { describe, it, expect, afterEach } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  existsSync,
  readFileSync,
  writeFileSync,
  statSync,
  readdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runInit } from '../../src/cli/commands/init.js';
import { getPackageVersion } from '../../src/utils/paths.js';

/** Where init reads sub-agents from: shipped `agents/`, else canonical `.claude/agents/`. */
function agentsSourceDir(): string {
  const shipped = join(REPO_ROOT, 'agents');
  return existsSync(shipped) ? shipped : join(REPO_ROOT, '.claude', 'agents');
}

const REPO_ROOT = resolve(process.cwd());

const tmpDirs: string[] = [];

function makeTmpCwd(): string {
  const dir = mkdtempSync(join(tmpdir(), 'qualiow-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tmpDirs.length) {
    const dir = tmpDirs.pop()!;
    rmSync(dir, { recursive: true, force: true });
  }
});

const silentLog = () => {};

describe('runInit — fresh install', () => {
  it('installs the expected files and skips example/local targets', async () => {
    const cwd = makeTmpCwd();
    await runInit(
      { includeExamples: false, force: false, dryRun: false },
      { cwd, pkgRoot: REPO_ROOT, log: silentLog },
    );

    const expectFile = (rel: string) => expect(existsSync(join(cwd, rel))).toBe(true);

    expectFile('.claude/skills/qa-explore/SKILL.md');
    expectFile('.claude/agents/qa-gather-agent.md');

    // Every *.md agent in the source tree lands in .claude/agents/ — not just
    // qa-gather-agent by name.
    const agentMdFiles = readdirSync(agentsSourceDir()).filter((f) => f.endsWith('.md'));
    expect(agentMdFiles.length).toBeGreaterThan(0);
    for (const f of agentMdFiles) {
      expectFile(`.claude/agents/${f}`);
    }

    expectFile('data/knowledge/manifest.yml');
    expectFile('data/domains/_default.yml');
    expectFile('data/templates/bug-report.md');
    expectFile('data/security/SECURITY-POLICY.md');
    expectFile('data/targets/_default.yml');
    expectFile('qa/.env.example');

    // No domain .md files should be copied (yml only).
    const domainFiles = readdirSync(join(cwd, 'data', 'domains'));
    expect(domainFiles.some((f) => f.endsWith('.md'))).toBe(false);

    // Examples not installed without --include-examples.
    expect(existsSync(join(cwd, 'data', 'targets', 'testers-ai.yml'))).toBe(false);

    // local-* targets never ship, regardless of includeExamples.
    const targetFiles = readdirSync(join(cwd, 'data', 'targets'));
    expect(targetFiles.some((f) => f.startsWith('local-'))).toBe(false);

    // qa/bin/mcli is executable.
    const mcliPath = join(cwd, 'qa', 'bin', 'mcli');
    expect(existsSync(mcliPath)).toBe(true);
    const mode = statSync(mcliPath).mode;
    expect(mode & 0o111).not.toBe(0);

    // The qualiow launcher shim is never copied into a consumer project —
    // it exists only to bootstrap a plugin-only (no dist/) checkout.
    expect(existsSync(join(cwd, 'qa', 'bin', 'qualiow'))).toBe(false);

    // qa/bin/VERSION matches the package version.
    const versionPath = join(cwd, 'qa', 'bin', 'VERSION');
    expect(existsSync(versionPath)).toBe(true);
    expect(readFileSync(versionPath, 'utf-8')).toBe(`${getPackageVersion(REPO_ROOT)}\n`);

    // output/sessions/INDEX.md has the expected table header.
    const indexContent = readFileSync(join(cwd, 'output', 'sessions', 'INDEX.md'), 'utf-8');
    expect(indexContent).toMatch(/^\| Date \| Kind \|/m);

    // .gitignore contains the qa/.env entry.
    const gitignore = readFileSync(join(cwd, '.gitignore'), 'utf-8');
    expect(gitignore).toContain('qa/.env');
  });
});

describe('runInit — second run is a no-op', () => {
  it('reports every copy as unchanged and does not touch .gitignore', async () => {
    const cwd = makeTmpCwd();
    const opts = { includeExamples: false, force: false, dryRun: false };
    const ctx = { cwd, pkgRoot: REPO_ROOT, log: silentLog };

    await runInit(opts, ctx);
    const gitignoreBefore = readFileSync(join(cwd, '.gitignore'), 'utf-8');

    const second = await runInit(opts, ctx);

    expect(second.copies.every((c) => c.status === 'unchanged')).toBe(true);
    expect(second.gitignoreUpdated).toBe(false);
    expect(second.createdDirs).toEqual([]);
    expect(second.createdFiles).toEqual([]);

    const gitignoreAfter = readFileSync(join(cwd, '.gitignore'), 'utf-8');
    expect(gitignoreAfter).toBe(gitignoreBefore);
  });
});

describe('runInit — modified file handling', () => {
  it('skips a modified file without --force, and overwrites it with --force', async () => {
    const cwd = makeTmpCwd();
    const ctx = { cwd, pkgRoot: REPO_ROOT, log: silentLog };

    await runInit({ includeExamples: false, force: false, dryRun: false }, ctx);

    const skillPath = join(cwd, '.claude', 'skills', 'qa-explore', 'SKILL.md');
    const original = readFileSync(skillPath, 'utf-8');
    writeFileSync(skillPath, original + '\n\n<!-- locally modified -->\n');

    const withoutForce = await runInit(
      { includeExamples: false, force: false, dryRun: false },
      ctx,
    );
    const skippedRecord = withoutForce.copies.find((c) => c.dest === skillPath);
    expect(skippedRecord?.status).toBe('skipped');
    // File is left untouched.
    expect(readFileSync(skillPath, 'utf-8')).toContain('locally modified');

    const withForce = await runInit(
      { includeExamples: false, force: true, dryRun: false },
      ctx,
    );
    const overwrittenRecord = withForce.copies.find((c) => c.dest === skillPath);
    expect(overwrittenRecord?.status).toBe('overwritten');
    expect(readFileSync(skillPath, 'utf-8')).not.toContain('locally modified');
    expect(readFileSync(skillPath, 'utf-8')).toBe(original);
  });
});

describe('runInit — dry run', () => {
  it('writes nothing to disk', async () => {
    const cwd = makeTmpCwd();
    const result = await runInit(
      { includeExamples: false, force: false, dryRun: true },
      { cwd, pkgRoot: REPO_ROOT, log: silentLog },
    );

    expect(result.copies.length).toBeGreaterThan(0);
    expect(existsSync(join(cwd, '.claude'))).toBe(false);
    expect(existsSync(join(cwd, 'data'))).toBe(false);
    expect(existsSync(join(cwd, 'qa'))).toBe(false);
    expect(existsSync(join(cwd, 'output'))).toBe(false);
    expect(existsSync(join(cwd, '.gitignore'))).toBe(false);
  });
});

describe('runInit — includeExamples', () => {
  it('installs the example and testers-ai target configs', async () => {
    const cwd = makeTmpCwd();
    await runInit(
      { includeExamples: true, force: false, dryRun: false },
      { cwd, pkgRoot: REPO_ROOT, log: silentLog },
    );

    expect(existsSync(join(cwd, 'data', 'targets', '_example-api-only.yml'))).toBe(true);
    expect(existsSync(join(cwd, 'data', 'targets', 'testers-ai.yml'))).toBe(true);

    // Still never local-*.
    const targetFiles = readdirSync(join(cwd, 'data', 'targets'));
    expect(targetFiles.some((f) => f.startsWith('local-'))).toBe(false);
  });
});

describe('runInit — --hooks', () => {
  const QUALIOW_ALLOW = ['Bash(playwright-cli:*)', 'Bash(npx playwright-cli:*)', 'Bash(qualiow:*)'];

  it('installs the guard scripts and wires settings.json idempotently', async () => {
    const cwd = makeTmpCwd();
    const ctx = { cwd, pkgRoot: REPO_ROOT, log: silentLog };
    const opts = { includeExamples: false, force: false, dryRun: false, hooks: true };
    await runInit(opts, ctx);

    for (const f of ['read-guard.mjs', 'write-guard.mjs', 'secret-patterns.mjs']) {
      expect(existsSync(join(cwd, 'qa', 'hooks', f))).toBe(true);
    }
    expect(existsSync(join(cwd, 'qa', 'hooks', 'secret-patterns.d.mts'))).toBe(false);

    const settingsPath = join(cwd, '.claude', 'settings.json');
    const first = readFileSync(settingsPath, 'utf-8');
    const parsed = JSON.parse(first) as {
      hooks: { PreToolUse: { matcher: string; hooks: { command: string }[] }[] };
      permissions: { allow: string[] };
    };
    expect(parsed.hooks.PreToolUse.map((e) => e.matcher)).toEqual(['Read', 'Write|Edit|MultiEdit']);
    expect(parsed.hooks.PreToolUse[0].hooks[0].command).toContain('qa/hooks/read-guard.mjs');
    expect(parsed.hooks.PreToolUse[1].hooks[0].command).toContain('qa/hooks/write-guard.mjs');
    expect(parsed.permissions.allow).toEqual(expect.arrayContaining(QUALIOW_ALLOW));
    expect(first.endsWith('\n')).toBe(true);

    await runInit(opts, ctx);
    expect(readFileSync(settingsPath, 'utf-8')).toBe(first);
  });

  it('preserves existing user hooks, allow rules and other keys', async () => {
    const cwd = makeTmpCwd();
    const settingsPath = join(cwd, '.claude', 'settings.json');
    mkdirSync(join(cwd, '.claude'), { recursive: true });
    const userHook = { matcher: 'Bash', hooks: [{ type: 'command', command: 'echo user-hook' }] };
    writeFileSync(
      settingsPath,
      JSON.stringify(
        {
          env: { QUALIOW_READ_MAX_LINES: '500' },
          hooks: { PreToolUse: [userHook] },
          permissions: { allow: ['Bash(ls:*)', 'Bash(qualiow:*)'] },
        },
        null,
        2,
      ) + '\n',
    );
    await runInit(
      { includeExamples: false, force: false, dryRun: false, hooks: true },
      { cwd, pkgRoot: REPO_ROOT, log: silentLog },
    );
    const parsed = JSON.parse(readFileSync(settingsPath, 'utf-8')) as {
      env: Record<string, string>;
      hooks: { PreToolUse: { matcher: string; hooks: { command: string }[] }[] };
      permissions: { allow: string[] };
    };
    expect(parsed.env).toEqual({ QUALIOW_READ_MAX_LINES: '500' });
    expect(parsed.hooks.PreToolUse).toHaveLength(3);
    expect(parsed.hooks.PreToolUse[0]).toEqual(userHook);
    expect(parsed.permissions.allow).toEqual(['Bash(ls:*)', 'Bash(qualiow:*)', 'Bash(playwright-cli:*)', 'Bash(npx playwright-cli:*)']);
  });

  it('does nothing hook-related without --hooks, and writes nothing on --dry-run', async () => {
    const plain = makeTmpCwd();
    await runInit({ includeExamples: false, force: false, dryRun: false }, { cwd: plain, pkgRoot: REPO_ROOT, log: silentLog });
    expect(existsSync(join(plain, 'qa', 'hooks'))).toBe(false);
    expect(existsSync(join(plain, '.claude', 'settings.json'))).toBe(false);

    const dry = makeTmpCwd();
    await runInit({ includeExamples: false, force: false, dryRun: true, hooks: true }, { cwd: dry, pkgRoot: REPO_ROOT, log: silentLog });
    expect(existsSync(join(dry, 'qa', 'hooks'))).toBe(false);
    expect(existsSync(join(dry, '.claude', 'settings.json'))).toBe(false);
  });
});
