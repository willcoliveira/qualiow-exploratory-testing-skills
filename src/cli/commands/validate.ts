import { Command } from 'commander';
import { resolve, relative, join } from 'node:path';
import { existsSync } from 'node:fs';
import { globSync } from 'glob';
import chalk from 'chalk';
import {
  validateTargetConfig,
  validateDomainConfig,
  validateKnowledgeEntry,
  validateKnowledgeBase,
} from '../../utils/validate.js';
import type { ValidationResult } from '../../types/index.js';

export interface ValidateOptions {
  targets?: boolean;
  knowledge?: boolean;
  domains?: boolean;
  kb?: boolean;
  all?: boolean;
}

export function validateCommand(): Command {
  const cmd = new Command('validate')
    .description('Validate configuration files (targets, domains, knowledge entries, knowledge base)')
    .option('--targets', 'Validate target configurations (data/targets/*.yml and qa/target.yml)')
    .option('--knowledge', 'Validate knowledge entries')
    .option('--domains', 'Validate domain configurations')
    .option('--kb', 'Cross-check the knowledge base (manifest, releases, changelog)')
    .option('--all', 'Validate everything (default)')
    .action(async (options: ValidateOptions) => {
      try {
        const failed = runValidate(options, process.cwd());
        if (failed > 0) process.exit(1);
      } catch (err) {
        console.error(chalk.red('Error during validation:'), err instanceof Error ? err.message : err);
        process.exit(1);
      }
    });
  return cmd;
}

/** Runs the selected validations, prints results, returns the failure count. */
export function runValidate(options: ValidateOptions, cwd: string): number {
  const dataDir = resolve(cwd, 'data');
  const runAll =
    options.all || (!options.targets && !options.knowledge && !options.domains && !options.kb);

  if (!existsSync(dataDir)) {
    throw new Error('data/ directory not found. Run `npx qualiow init` first.');
  }

  const results: ValidationResult[] = [];

  const section = (title: string, files: string[], fn: (f: string) => ValidationResult) => {
    console.log(chalk.cyan.bold(`\n${title} (${files.length} files):`));
    for (const file of files) {
      const result = fn(file);
      results.push(result);
      printResult(result, cwd);
    }
  };

  if (runAll || options.targets) {
    const files = globSync(resolve(dataDir, 'targets', '*.yml')).sort();
    const projectLocal = join(cwd, 'qa', 'target.yml');
    if (existsSync(projectLocal)) files.unshift(projectLocal);
    section('Targets', files, validateTargetConfig);
  }

  if (runAll || options.domains) {
    section('Domains', globSync(resolve(dataDir, 'domains', '*.yml')).sort(), validateDomainConfig);
  }

  if (runAll || options.knowledge) {
    section(
      'Knowledge entries',
      globSync(resolve(dataDir, 'knowledge', 'releases', '**', 'entries', '*.yml')).sort(),
      validateKnowledgeEntry,
    );
  }

  if (runAll || options.kb) {
    if (existsSync(join(dataDir, 'knowledge', 'manifest.yml'))) {
      console.log(chalk.cyan.bold('\nKnowledge base:'));
      for (const result of validateKnowledgeBase(dataDir)) {
        results.push(result);
        printResult(result, cwd);
      }
    } else {
      console.log(chalk.yellow('\n  No knowledge/manifest.yml found'));
    }
  }

  const total = results.length;
  const passed = results.filter((r) => r.valid).length;
  const failed = total - passed;

  console.log('');
  console.log(chalk.bold('Summary:'));
  console.log(
    `  ${total} checks, ${chalk.green(`${passed} passed`)}, ${failed > 0 ? chalk.red(`${failed} failed`) : chalk.green('0 failed')}`,
  );
  console.log('');
  return failed;
}

function printResult(result: ValidationResult, cwd: string): void {
  const relPath = relative(cwd, result.file);
  if (result.valid) {
    console.log(`  ${chalk.green('PASS')}  ${relPath}`);
  } else {
    console.log(`  ${chalk.red('FAIL')}  ${relPath}`);
    for (const err of result.errors ?? []) {
      const pathStr = err.path ? `[${err.path}] ` : '';
      console.log(`        ${chalk.red('→')} ${pathStr}${err.message}`);
    }
  }
}
