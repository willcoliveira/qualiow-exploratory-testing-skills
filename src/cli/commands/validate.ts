import { Command } from 'commander';
import { resolve, relative } from 'node:path';
import { existsSync } from 'node:fs';
import { globSync } from 'glob';
import chalk from 'chalk';
import {
  validateTargetConfig,
  validateDomainConfig,
  validateKnowledgeEntry,
} from '../../utils/validate.js';
import type { ValidationResult } from '../../types/index.js';

export function validateCommand(): Command {
  const cmd = new Command('validate')
    .description('Validate all configuration files')
    .option('--targets', 'Validate target configurations only')
    .option('--knowledge', 'Validate knowledge entries only')
    .option('--domains', 'Validate domain configurations only')
    .option('--all', 'Validate all configurations (default)')
    .action(async (options) => {
      try {
        runValidate(options);
      } catch (err) {
        console.error(chalk.red('Error during validation:'), err instanceof Error ? err.message : err);
        process.exit(1);
      }
    });
  return cmd;
}

function runValidate(options: {
  targets?: boolean;
  knowledge?: boolean;
  domains?: boolean;
  all?: boolean;
}): void {
  const cwd = process.cwd();
  const dataDir = resolve(cwd, 'data');

  // Default to --all if no flags specified
  const runAll = options.all || (!options.targets && !options.knowledge && !options.domains);

  if (!existsSync(dataDir)) {
    console.error(chalk.red('Error: data/ directory not found. Run `npx qualiow init` first.'));
    process.exit(1);
  }

  const results: ValidationResult[] = [];

  // Validate targets
  if (runAll || options.targets) {
    const targetDir = resolve(dataDir, 'targets');
    if (existsSync(targetDir)) {
      const files = globSync(resolve(targetDir, '*.yml'));
      console.log(chalk.cyan.bold(`\nTargets (${files.length} files):`));
      for (const file of files) {
        const result = validateTargetConfig(file);
        results.push(result);
        printResult(result, cwd);
      }
    } else {
      console.log(chalk.yellow('\n  No targets/ directory found'));
    }
  }

  // Validate knowledge entries
  if (runAll || options.knowledge) {
    const knowledgeDir = resolve(dataDir, 'knowledge');
    if (existsSync(knowledgeDir)) {
      const files = globSync(resolve(knowledgeDir, 'releases', '**', 'entries', '*.yml'));
      console.log(chalk.cyan.bold(`\nKnowledge entries (${files.length} files):`));
      for (const file of files) {
        const result = validateKnowledgeEntry(file);
        results.push(result);
        printResult(result, cwd);
      }
    } else {
      console.log(chalk.yellow('\n  No knowledge/ directory found'));
    }
  }

  // Validate domain configs
  if (runAll || options.domains) {
    const domainsDir = resolve(dataDir, 'domains');
    if (existsSync(domainsDir)) {
      const files = globSync(resolve(domainsDir, '*.yml'));
      console.log(chalk.cyan.bold(`\nDomains (${files.length} files):`));
      for (const file of files) {
        const result = validateDomainConfig(file);
        results.push(result);
        printResult(result, cwd);
      }
    } else {
      console.log(chalk.yellow('\n  No domains/ directory found'));
    }
  }

  // Summary
  const total = results.length;
  const passed = results.filter((r) => r.valid).length;
  const failed = total - passed;

  console.log('');
  console.log(chalk.bold('Summary:'));
  console.log(
    `  ${total} files validated, ${chalk.green(`${passed} passed`)}, ${failed > 0 ? chalk.red(`${failed} failed`) : chalk.green(`${failed} failed`)}`,
  );
  console.log('');

  if (failed > 0) {
    process.exit(1);
  }
}

function printResult(result: ValidationResult, cwd: string): void {
  const relPath = relative(cwd, result.file);
  if (result.valid) {
    console.log(`  ${chalk.green('PASS')}  ${relPath}`);
  } else {
    console.log(`  ${chalk.red('FAIL')}  ${relPath}`);
    if (result.errors) {
      for (const err of result.errors) {
        const pathStr = err.path ? `[${err.path}] ` : '';
        console.log(`        ${chalk.red('→')} ${pathStr}${err.message}`);
      }
    }
  }
}
