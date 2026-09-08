import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { validateCommand } from './commands/validate.js';
import { listCommand } from './commands/list.js';
import { reportCommand } from './commands/report.js';
import { exploreCommand } from './commands/explore.js';
import { kbCommand } from './commands/kb.js';
import { getPackageVersion } from '../utils/paths.js';

const program = new Command()
  .name('qualiow')
  .description('qualiow — AI-powered exploratory testing (web, mobile, backend)')
  .version(getPackageVersion());

program.addCommand(initCommand());
program.addCommand(validateCommand());
program.addCommand(listCommand());
program.addCommand(reportCommand());
program.addCommand(exploreCommand());
program.addCommand(kbCommand());

program.parse();
