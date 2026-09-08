import { Command } from 'commander';
import { resolve, join, relative } from 'node:path';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import chalk from 'chalk';
import { validateTargetConfig } from '../../utils/validate.js';
import { resolveTargetPath } from '../../utils/paths.js';
import { sessionDirName, slugify } from '../../utils/session-dir.js';
import { CONFIDENTIALITY_HEADER_MD } from '../../utils/confidentiality.js';

export interface ExploreOptions {
  target?: string;
  context?: string;
  timeBox: string;
  dryRun: boolean;
}

export function exploreCommand(): Command {
  const cmd = new Command('explore')
    .description(
      'Pre-flight for an exploratory session: validates inputs and creates the session directory. ' +
        'The session itself runs in Claude Code via /qa-explore.',
    )
    .argument('[url]', 'Target URL to explore')
    .option('-t, --target <name>', 'Target configuration name (data/targets/<name>.yml)')
    .option('-c, --context <file>', 'Context file path')
    .option('--time-box <duration>', 'Time box, e.g. 45m (max 45m)', '45m')
    .option('--dry-run', 'Validate inputs and show what would happen', false)
    .action(async (url: string | undefined, options: ExploreOptions) => {
      try {
        await runExplore(url, options, { cwd: process.cwd() });
      } catch (err) {
        console.error(chalk.red('Error:'), err instanceof Error ? err.message : err);
        process.exit(1);
      }
    });
  return cmd;
}

export function parseTimeBox(value: string): number {
  const m = /^(\d+)m$/.exec(value.trim());
  if (!m) throw new Error(`Invalid --time-box "${value}": use minutes like 30m or 45m`);
  const minutes = parseInt(m[1], 10);
  if (minutes < 1 || minutes > 45) {
    throw new Error(`--time-box must be between 1m and 45m (got ${value})`);
  }
  return minutes;
}

export async function runExplore(
  url: string | undefined,
  options: ExploreOptions,
  ctx: { cwd: string; now?: Date; log?: (line: string) => void },
): Promise<{ sessionDir: string }> {
  const cwd = ctx.cwd;
  const now = ctx.now ?? new Date();
  const log = ctx.log ?? ((line: string) => console.log(line));

  if (url) {
    try {
      new URL(url);
    } catch {
      throw new Error(`Invalid URL: "${url}". Provide a full URL such as https://example.com`);
    }
  }

  const minutes = parseTimeBox(options.timeBox);

  // Target: explicit name, else qa/target.yml, else _default.yml.
  const targetPath = resolveTargetPath(cwd, options.target);
  let targetLabel = options.target ?? 'adhoc';
  if (options.target || existsSync(targetPath)) {
    if (!existsSync(targetPath)) {
      throw new Error(
        `Target config not found: ${relative(cwd, targetPath)}\n  Available targets: npx qualiow list targets`,
      );
    }
    const result = validateTargetConfig(targetPath);
    if (!result.valid) {
      const details = (result.errors ?? [])
        .map((e) => `  → ${e.path ? `[${e.path}] ` : ''}${e.message}`)
        .join('\n');
      throw new Error(`Target config ${relative(cwd, targetPath)} is invalid:\n${details}`);
    }
    if (!options.target) targetLabel = url ? slugify(url) : 'adhoc';
    log(chalk.green(`  ✓ Target config valid: ${relative(cwd, targetPath)}`));
  } else if (url) {
    targetLabel = slugify(url);
  }

  if (options.context) {
    const contextPath = resolve(cwd, options.context);
    if (!existsSync(contextPath)) {
      throw new Error(`Context file not found: ${contextPath}`);
    }
    log(chalk.green(`  ✓ Context file found: ${options.context}`));
  }

  const sessionName = sessionDirName('explore', targetLabel, now);
  const sessionDir = resolve(cwd, 'output', 'sessions', sessionName);

  if (options.dryRun) {
    log('');
    log(chalk.cyan.bold('Dry run — no files created'));
    log(chalk.white(`  Session directory: ${relative(cwd, sessionDir)}`));
    log(chalk.white(`  URL:       ${url ?? '(none — /qa-explore will ask)'}`));
    log(chalk.white(`  Target:    ${options.target ?? relative(cwd, targetPath)}`));
    log(chalk.white(`  Context:   ${options.context ?? '(none)'}`));
    log(chalk.white(`  Time box:  ${minutes} min`));
    return { sessionDir };
  }

  for (const sub of ['', 'screenshots', 'bugs', 'videos']) {
    mkdirSync(join(sessionDir, sub), { recursive: true });
  }

  const date = now.toISOString().slice(0, 10);
  writeFileSync(
    join(sessionDir, 'charter.md'),
    `${CONFIDENTIALITY_HEADER_MD}

# Exploratory Testing Charter

**Session:** ${sessionName}
**Date:** ${date}
**Target:** ${options.target ?? targetLabel}
**URL:** ${url ?? 'TBD'}
**Time Box:** ${minutes} min

## Mission

> Filled in by /qa-explore phase 2.

## Areas of Focus

-

## Risks & Concerns

-
`,
  );
  writeFileSync(
    join(sessionDir, 'session-log.md'),
    `${CONFIDENTIALITY_HEADER_MD}

# Session Log — ${sessionName}

[${now.toISOString()}] [PRE-FLIGHT] Session directory created by \`qualiow explore\`
`,
  );

  log('');
  log(chalk.green.bold('Session skeleton created (pre-flight only — no browser was launched).'));
  log(chalk.white(`  Directory: ${relative(cwd, sessionDir)}`));
  log('');
  log(chalk.cyan('  Run the session in Claude Code:'));
  const args = [url ?? '<url>', options.target ? `--target ${options.target}` : '', options.context ? `--context ${options.context}` : '']
    .filter(Boolean)
    .join(' ');
  log(chalk.white(`    /qa-explore ${args} --session output/sessions/${sessionName}`));
  log('');

  return { sessionDir };
}
