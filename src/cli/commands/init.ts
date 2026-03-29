import { Command } from 'commander';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
} from 'node:fs';
import { cp } from 'node:fs/promises';
import chalk from 'chalk';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Resolve the package root — where skills/ and data/ live.
 * tsup bundles the CLI to dist/cli/index.js, so __dirname = dist/cli/.
 * In development: project root (2 levels up from dist/cli/).
 * When installed: node_modules/@qualiow/exploratory-testing/
 */
function resolvePackageRoot(): string {
  // Walk up from __dirname looking for the package root (has data/ and package.json)
  let current = __dirname;
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(current, 'data')) && existsSync(join(current, 'package.json'))) {
      return current;
    }
    current = dirname(current);
  }
  // Fallback: assume 2 levels up from dist/cli/
  return resolve(__dirname, '..', '..');
}

const GITIGNORE_ENTRIES = [
  '',
  '# Qualiow',
  '.auth/',
  '.env',
  'output/sessions/*/',
  '.playwright-cli/',
  '*.trace.zip',
  '*.webm',
  'dist/',
];

const INDEX_MD_HEADER = `# Exploratory Testing Sessions

| Date | Target | Duration | Bugs | Session Directory |
|------|--------|----------|------|-------------------|
`;

const ALL_BUGS_MD_HEADER = `# All Bugs — Exploratory Testing

> Aggregated bug list across all sessions.

| ID | Title | Severity | Session | Component |
|----|-------|----------|---------|-----------|
`;

const ENV_EXAMPLE = `# Qualiow — Environment Variables
# Copy this file to .env and fill in values.

# Target auth tokens (if needed)
# AUTH_TOKEN=

# Playwright options
# HEADLESS=false
`;

export function initCommand(): Command {
  const cmd = new Command('init')
    .description('Initialize qualiow in the current project')
    .option('--include-examples', 'Include example target configurations', false)
    .option('--force', 'Overwrite existing files', false)
    .action(async (options) => {
      try {
        await runInit(options);
      } catch (err) {
        console.error(chalk.red('Error during init:'), err instanceof Error ? err.message : err);
        process.exit(1);
      }
    });
  return cmd;
}

async function runInit(options: { includeExamples: boolean; force: boolean }): Promise<void> {
  const cwd = process.cwd();
  const pkgRoot = resolvePackageRoot();

  // 1. Check if skills already exist
  const skillsDest = join(cwd, '.claude', 'skills');
  const existingSkills = existsSync(skillsDest)
    ? readdirSync(skillsDest).filter((f) => f.startsWith('qa-'))
    : [];

  if (existingSkills.length > 0 && !options.force) {
    console.warn(
      chalk.yellow(
        `Warning: ${existingSkills.length} skill(s) already exist in .claude/skills/ (${existingSkills.join(', ')}). Use --force to overwrite.`,
      ),
    );
  }

  // 2. Copy skills/ -> .claude/skills/
  const skillsSrc = join(pkgRoot, '.claude', 'skills');
  if (existsSync(skillsSrc)) {
    const srcReal = resolve(skillsSrc);
    const destReal = resolve(skillsDest);

    if (srcReal !== destReal) {
      if (existingSkills.length === 0 || options.force) {
        mkdirSync(skillsDest, { recursive: true });
        await cp(skillsSrc, skillsDest, { recursive: true, force: options.force });
        console.log(chalk.green('  ✓ Skills installed to .claude/skills/'));
      } else {
        console.log(chalk.cyan('  ○ Skills skipped (already exist, use --force to overwrite)'));
      }
    } else {
      console.log(chalk.cyan('  ○ Skills directory is the same as source — skipped'));
    }
  } else {
    console.log(chalk.yellow('  ⚠ No skills/ directory found in package root'));
  }

  // 3. Copy data/ -> data/
  const dataSrc = join(pkgRoot, 'data');
  const dataDest = join(cwd, 'data');
  if (existsSync(dataSrc)) {
    const srcReal = resolve(dataSrc);
    const destReal = resolve(dataDest);

    if (srcReal !== destReal) {
      mkdirSync(dataDest, { recursive: true });

      // Copy knowledge/
      const knowledgeSrc = join(dataSrc, 'knowledge');
      if (existsSync(knowledgeSrc)) {
        await cp(knowledgeSrc, join(dataDest, 'knowledge'), { recursive: true, force: options.force });
        console.log(chalk.green('  ✓ Knowledge base installed to data/knowledge/'));
      }

      // Copy domains/
      const domainsSrc = join(dataSrc, 'domains');
      if (existsSync(domainsSrc)) {
        await cp(domainsSrc, join(dataDest, 'domains'), { recursive: true, force: options.force });
        console.log(chalk.green('  ✓ Domain configs installed to data/domains/'));
      }

      // Copy templates/
      const templatesSrc = join(dataSrc, 'templates');
      if (existsSync(templatesSrc)) {
        await cp(templatesSrc, join(dataDest, 'templates'), { recursive: true, force: options.force });
        console.log(chalk.green('  ✓ Templates installed to data/templates/'));
      }

      // Copy security/
      const securitySrc = join(dataSrc, 'security');
      if (existsSync(securitySrc)) {
        await cp(securitySrc, join(dataDest, 'security'), { recursive: true, force: options.force });
        console.log(chalk.green('  ✓ Security policies installed to data/security/'));
      }

      // Copy targets — only _default.yml unless --include-examples
      const targetsSrc = join(dataSrc, 'targets');
      const targetsDest = join(dataDest, 'targets');
      if (existsSync(targetsSrc)) {
        mkdirSync(targetsDest, { recursive: true });
        const defaultFile = join(targetsSrc, '_default.yml');
        if (existsSync(defaultFile)) {
          const content = readFileSync(defaultFile, 'utf-8');
          writeFileSync(join(targetsDest, '_default.yml'), content);
        }
        if (options.includeExamples) {
          const targetFiles = readdirSync(targetsSrc).filter(
            (f) => f.endsWith('.yml') && f !== '_default.yml',
          );
          for (const file of targetFiles) {
            const content = readFileSync(join(targetsSrc, file), 'utf-8');
            writeFileSync(join(targetsDest, file), content);
          }
          console.log(chalk.green('  ✓ Target configs installed to data/targets/ (with examples)'));
        } else {
          console.log(chalk.green('  ✓ Default target config installed to data/targets/'));
        }
      }
    } else {
      console.log(chalk.cyan('  ○ Data directory is the same as source — skipped'));
    }
  }

  // 4. Create output directories
  const outputDirs = [
    join(cwd, 'output', 'sessions'),
    join(cwd, 'output', 'bugs'),
    join(cwd, 'output', 'context'),
    join(cwd, '.auth'),
  ];
  for (const dir of outputDirs) {
    mkdirSync(dir, { recursive: true });
  }
  console.log(chalk.green('  ✓ Output directories created'));

  // 5. Create INDEX.md
  const indexPath = join(cwd, 'output', 'sessions', 'INDEX.md');
  if (!existsSync(indexPath)) {
    writeFileSync(indexPath, INDEX_MD_HEADER);
    console.log(chalk.green('  ✓ Created output/sessions/INDEX.md'));
  }

  // 6. Create all-bugs.md
  const allBugsPath = join(cwd, 'output', 'bugs', 'all-bugs.md');
  if (!existsSync(allBugsPath)) {
    writeFileSync(allBugsPath, ALL_BUGS_MD_HEADER);
    console.log(chalk.green('  ✓ Created output/bugs/all-bugs.md'));
  }

  // 7. Create .env.example
  const envExamplePath = join(cwd, '.env.example');
  if (!existsSync(envExamplePath)) {
    writeFileSync(envExamplePath, ENV_EXAMPLE);
    console.log(chalk.green('  ✓ Created .env.example'));
  }

  // 8. Append to .gitignore
  const gitignorePath = join(cwd, '.gitignore');
  let gitignoreContent = '';
  if (existsSync(gitignorePath)) {
    gitignoreContent = readFileSync(gitignorePath, 'utf-8');
  }
  const linesToAdd: string[] = [];
  for (const entry of GITIGNORE_ENTRIES) {
    if (entry === '' || entry.startsWith('#')) {
      // Always add section header/blank lines if not already present
      if (!gitignoreContent.includes('# Qualiow') && entry === '# Qualiow') {
        linesToAdd.push(entry);
      } else if (entry === '' && linesToAdd.length === 0) {
        linesToAdd.push(entry);
      }
      continue;
    }
    if (!gitignoreContent.includes(entry)) {
      linesToAdd.push(entry);
    }
  }
  if (linesToAdd.length > 0) {
    const appendStr =
      (gitignoreContent.endsWith('\n') || gitignoreContent === '' ? '' : '\n') +
      linesToAdd.join('\n') +
      '\n';
    writeFileSync(gitignorePath, gitignoreContent + appendStr);
    console.log(chalk.green('  ✓ Updated .gitignore'));
  }

  // 9. Print getting-started message
  console.log('');
  console.log(chalk.cyan.bold('Qualiow initialized successfully!'));
  console.log('');
  console.log(chalk.white('Next steps:'));
  console.log(chalk.white('  1. Install Playwright CLI: npm install @playwright/cli'));
  console.log(chalk.white('  2. Run your first session: /qa-explore https://your-app.com'));
  console.log(chalk.white('  3. Or use the CLI: npx qualiow explore https://your-app.com'));
  console.log('');
}
