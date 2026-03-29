import { Command } from 'commander';
import { resolve, join } from 'node:path';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import chalk from 'chalk';
import { validateTargetConfig } from '../../utils/validate.js';

export function exploreCommand(): Command {
  const cmd = new Command('explore')
    .description('Run an exploratory testing session')
    .argument('[url]', 'Target URL to explore')
    .option('-t, --target <name>', 'Target configuration name')
    .option('-c, --context <file>', 'Context file path')
    .option('--time-box <duration>', 'Time box duration (e.g., 30m, 1h)', '30m')
    .option('--dry-run', 'Validate inputs and show what would happen', false)
    .action(async (url, options) => {
      try {
        await runExplore(url, options);
      } catch (err) {
        console.error(chalk.red('Error:'), err instanceof Error ? err.message : err);
        process.exit(1);
      }
    });
  return cmd;
}

async function runExplore(
  url: string | undefined,
  options: {
    target?: string;
    context?: string;
    timeBox: string;
    dryRun: boolean;
  },
): Promise<void> {
  const cwd = process.cwd();

  // 1. Validate URL format if provided
  if (url) {
    try {
      new URL(url);
    } catch {
      console.error(chalk.red(`Invalid URL: "${url}". Please provide a valid URL (e.g., https://example.com).`));
      process.exit(1);
    }
  }

  // 2. Validate target config if provided
  let targetName = 'adhoc';
  if (options.target) {
    const targetPath = resolve(cwd, 'data', 'targets', `${options.target}.yml`);
    if (!existsSync(targetPath)) {
      console.error(
        chalk.red(`Target config not found: ${targetPath}`),
      );
      console.error(chalk.white('  Available targets: npx qualiow list targets'));
      process.exit(1);
    }
    const result = validateTargetConfig(targetPath);
    if (!result.valid) {
      console.error(chalk.red(`Target config "${options.target}" is invalid:`));
      for (const err of result.errors ?? []) {
        console.error(chalk.red(`  → ${err.path ? `[${err.path}] ` : ''}${err.message}`));
      }
      process.exit(1);
    }
    targetName = options.target;
    console.log(chalk.green(`  ✓ Target config "${options.target}" is valid`));
  }

  // 3. Validate context file if provided
  if (options.context) {
    const contextPath = resolve(cwd, options.context);
    if (!existsSync(contextPath)) {
      console.error(chalk.red(`Context file not found: ${contextPath}`));
      process.exit(1);
    }
    console.log(chalk.green(`  ✓ Context file found: ${options.context}`));
  }

  // 4. Create session directory
  const now = new Date();
  const timestamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    '-',
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
  ].join('');
  const sessionName = `${timestamp}-${targetName}`;
  const sessionDir = resolve(cwd, 'output', 'sessions', sessionName);

  if (options.dryRun) {
    console.log('');
    console.log(chalk.cyan.bold('Dry run — no files created'));
    console.log('');
    console.log(chalk.white('  Session would be created at:'));
    console.log(chalk.white(`    ${sessionDir}`));
    console.log('');
    console.log(chalk.white('  Configuration:'));
    console.log(chalk.white(`    URL:       ${url ?? '(none — will be prompted)'}`));
    console.log(chalk.white(`    Target:    ${options.target ?? '(ad-hoc)'}`));
    console.log(chalk.white(`    Context:   ${options.context ?? '(none)'}`));
    console.log(chalk.white(`    Time box:  ${options.timeBox}`));
    console.log('');
    console.log(chalk.green('  ✓ All inputs valid'));
    return;
  }

  // Create directories
  mkdirSync(sessionDir, { recursive: true });
  mkdirSync(join(sessionDir, 'screenshots'), { recursive: true });
  mkdirSync(join(sessionDir, 'bugs'), { recursive: true });

  // Create charter.md
  const charterContent = `# Exploratory Testing Charter

**Session:** ${sessionName}
**Date:** ${now.toISOString().split('T')[0]}
**Target:** ${options.target ?? 'Ad-hoc'}
**URL:** ${url ?? 'TBD'}
**Time Box:** ${options.timeBox}

## Mission

> Describe the testing mission here.

## Areas of Focus

-

## Risks & Concerns

-

## Notes

-
`;
  writeFileSync(join(sessionDir, 'charter.md'), charterContent);

  // Create session-log.md
  const sessionLogContent = `# Session Log — ${sessionName}

| Time | Action | Observation | Bug? |
|------|--------|-------------|------|
`;
  writeFileSync(join(sessionDir, 'session-log.md'), sessionLogContent);

  console.log('');
  console.log(chalk.green.bold('Session created!'));
  console.log('');
  console.log(chalk.white(`  Directory: ${sessionDir}`));
  console.log('');

  // Check if claude CLI is available
  let claudeAvailable = false;
  try {
    execSync('which claude', { stdio: 'pipe' });
    claudeAvailable = true;
  } catch {
    // claude CLI not found
  }

  if (claudeAvailable) {
    console.log(chalk.cyan('  Claude Code detected! To start exploring:'));
    console.log('');
    console.log(chalk.white(`    /qa-explore ${url ?? '<url>'}`));
  } else {
    console.log(chalk.cyan('  Next steps:'));
    console.log(chalk.white('    1. Install Claude Code (https://docs.anthropic.com/en/docs/claude-code)'));
    console.log(chalk.white(`    2. Run: /qa-explore ${url ?? '<url>'}`));
  }

  console.log('');
  console.log(chalk.gray(`  Session directory: ${sessionDir}`));
  console.log('');
}
