import { Command } from 'commander';
import { resolve, join } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import chalk from 'chalk';

export function gatherCommand(): Command {
  const cmd = new Command('gather')
    .description('Gather and analyze requirements for testing context')
    .argument('<source>', 'Source file path or URL to gather context from')
    .option('-o, --output <file>', 'Output file path')
    .option('-d, --domain <name>', 'Domain configuration name')
    .action(async (source, options) => {
      try {
        await runGather(source, options);
      } catch (err) {
        console.error(chalk.red('Error:'), err instanceof Error ? err.message : err);
        process.exit(1);
      }
    });
  return cmd;
}

async function runGather(
  source: string,
  options: {
    output?: string;
    domain?: string;
  },
): Promise<void> {
  const cwd = process.cwd();

  // 1. Validate source — is it a file path or URL?
  const isUrl = isValidUrl(source);
  const isFile = !isUrl && existsSync(resolve(cwd, source));

  if (!isUrl && !isFile) {
    console.error(chalk.red(`Source not found: "${source}"`));
    console.error(chalk.white('  Provide a valid file path or URL.'));
    process.exit(1);
  }

  if (isUrl) {
    console.log(chalk.green(`  ✓ Source is a URL: ${source}`));
  } else {
    console.log(chalk.green(`  ✓ Source file found: ${resolve(cwd, source)}`));
  }

  // 2. Validate domain config if provided
  if (options.domain) {
    const domainPath = resolve(cwd, 'data', 'domains', `${options.domain}.yml`);
    if (!existsSync(domainPath)) {
      console.error(chalk.red(`Domain config not found: ${domainPath}`));
      console.error(chalk.white('  Available domains: npx qualiow list domains'));
      process.exit(1);
    }
    console.log(chalk.green(`  ✓ Domain config "${options.domain}" found`));
  }

  // 3. Ensure output directory exists
  const outputDir = resolve(cwd, 'output', 'context');
  mkdirSync(outputDir, { recursive: true });

  if (options.output) {
    console.log(chalk.green(`  ✓ Output will be saved to: ${resolve(cwd, options.output)}`));
  } else {
    console.log(chalk.green(`  ✓ Output directory ready: ${outputDir}`));
  }

  // 4. Check for Claude Code
  let claudeAvailable = false;
  try {
    execSync('which claude', { stdio: 'pipe' });
    claudeAvailable = true;
  } catch {
    // claude CLI not found
  }

  console.log('');
  console.log(chalk.cyan.bold('Ready to gather context!'));
  console.log('');

  if (claudeAvailable) {
    console.log(chalk.cyan('  Claude Code detected! To gather context:'));
    console.log('');
    console.log(chalk.white(`    /qa-gather ${source}`));
  } else {
    console.log(chalk.cyan('  Next steps:'));
    console.log(chalk.white('    1. Install Claude Code (https://docs.anthropic.com/en/docs/claude-code)'));
    console.log(chalk.white(`    2. Run: /qa-gather ${source}`));
  }

  console.log('');
  console.log(chalk.gray('  The /qa-gather skill will:'));
  console.log(chalk.gray('    - Analyze the source for testable requirements'));
  console.log(chalk.gray('    - Generate testing context and risk assessment'));
  console.log(chalk.gray('    - Save output to output/context/'));
  console.log('');
}

function isValidUrl(str: string): boolean {
  try {
    const url = new URL(str);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
