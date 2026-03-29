#!/usr/bin/env node

import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { validateCommand } from './commands/validate.js';
import { listCommand } from './commands/list.js';
import { reportCommand } from './commands/report.js';
import { exploreCommand } from './commands/explore.js';
import { gatherCommand } from './commands/gather.js';

const program = new Command()
  .name('qualiow')
  .description('qualiow — AI-powered exploratory testing')
  .version('1.0.0');

program.addCommand(initCommand());
program.addCommand(validateCommand());
program.addCommand(listCommand());
program.addCommand(reportCommand());
program.addCommand(exploreCommand());
program.addCommand(gatherCommand());

program.parse();
