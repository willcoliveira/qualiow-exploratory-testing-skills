import { Command } from 'commander';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import chalk from 'chalk';
import { syncKnowledgeManifest } from '../../utils/kb-sync.js';

export function kbCommand(): Command {
  const cmd = new Command('kb').description('Knowledge-base maintenance');

  cmd
    .command('sync')
    .description('Regenerate data/knowledge/manifest.yml entries and stats from the release files')
    .action(() => {
      try {
        const result = runKb('sync', process.cwd());
        console.log(
          result.changed
            ? chalk.green(`  ✓ manifest.yml updated (${result.entryCount} entries)`)
            : chalk.cyan(`  ○ manifest.yml already in sync (${result.entryCount} entries)`),
        );
      } catch (err) {
        console.error(chalk.red('Error:'), err instanceof Error ? err.message : err);
        process.exit(1);
      }
    });

  cmd
    .command('check')
    .description('Exit 1 if manifest.yml is out of sync with the release files')
    .action(() => {
      try {
        const result = runKb('check', process.cwd());
        if (result.changed) {
          console.error(chalk.red('  ✗ manifest.yml is out of sync — run: npx qualiow kb sync'));
          process.exit(1);
        }
        console.log(chalk.green(`  ✓ manifest.yml in sync (${result.entryCount} entries)`));
      } catch (err) {
        console.error(chalk.red('Error:'), err instanceof Error ? err.message : err);
        process.exit(1);
      }
    });

  return cmd;
}

export function runKb(mode: 'sync' | 'check', cwd: string) {
  const dataDir = resolve(cwd, 'data');
  if (!existsSync(resolve(dataDir, 'knowledge', 'manifest.yml'))) {
    throw new Error('data/knowledge/manifest.yml not found. Run `npx qualiow init` first.');
  }
  return syncKnowledgeManifest(dataDir, { check: mode === 'check' });
}
