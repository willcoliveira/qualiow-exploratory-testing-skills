import { Command } from 'commander';
import { resolve, join, relative, dirname } from 'node:path';
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  statSync,
  copyFileSync,
  chmodSync,
} from 'node:fs';
import chalk from 'chalk';
import {
  getPackageRoot,
  getPackageVersion,
  resolveSkillsSource,
} from '../../utils/paths.js';
import { INDEX_MD_HEADER, ALL_BUGS_MD_HEADER } from '../../utils/index-files.js';
import { mergeGitignore } from '../../utils/gitignore.js';
import { mergeQualiowHookSettings } from '../../utils/settings-merge.js';

export interface InitOptions {
  includeExamples: boolean;
  force: boolean;
  dryRun: boolean;
  hooks?: boolean;
}

export type CopyStatus = 'installed' | 'unchanged' | 'overwritten' | 'skipped';

export interface CopyRecord {
  dest: string;
  status: CopyStatus;
}

export interface InitResult {
  copies: CopyRecord[];
  createdDirs: string[];
  createdFiles: string[];
  gitignoreUpdated: boolean;
}

export function initCommand(): Command {
  const cmd = new Command('init')
    .description('Initialize qualiow in the current project')
    .option('--include-examples', 'Also install the _example-* and testers-ai target configs', false)
    .option('--force', 'Overwrite files that already exist and differ', false)
    .option('--dry-run', 'Print what would be written without writing anything', false)
    .option(
      '--hooks',
      'Install the PreToolUse guard hooks into qa/hooks/ and wire them into .claude/settings.json',
      false,
    )
    .action(async (options: InitOptions) => {
      try {
        await runInit(options, { cwd: process.cwd() });
      } catch (err) {
        console.error(chalk.red('Error during init:'), err instanceof Error ? err.message : err);
        process.exit(1);
      }
    });
  return cmd;
}

// ─── Copy helpers ────────────────────────────────────────────────────

function sameContent(a: string, b: string): boolean {
  try {
    return readFileSync(a).equals(readFileSync(b));
  } catch {
    return false;
  }
}

function copyEntry(
  src: string,
  dest: string,
  opts: { force: boolean; dryRun: boolean },
): CopyRecord {
  let status: CopyStatus;
  if (!existsSync(dest)) {
    status = 'installed';
  } else if (sameContent(src, dest)) {
    status = 'unchanged';
  } else {
    status = opts.force ? 'overwritten' : 'skipped';
  }
  if (!opts.dryRun && (status === 'installed' || status === 'overwritten')) {
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(src, dest);
    chmodSync(dest, statSync(src).mode & 0o777);
  }
  return { dest, status };
}

/** Recursively lists files under `dir` as relative POSIX paths. */
function listFiles(dir: string, filter?: (rel: string) => boolean): string[] {
  const out: string[] = [];
  const walk = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else {
        const rel = relative(dir, full).split('\\').join('/');
        if (!filter || filter(rel)) out.push(rel);
      }
    }
  };
  walk(dir);
  return out.sort();
}

function copyTree(
  srcDir: string,
  destDir: string,
  opts: { force: boolean; dryRun: boolean; filter?: (rel: string) => boolean },
): CopyRecord[] {
  if (!existsSync(srcDir)) return [];
  return listFiles(srcDir, opts.filter).map((rel) =>
    copyEntry(join(srcDir, rel), join(destDir, rel), opts),
  );
}

// ─── Main ────────────────────────────────────────────────────────────

export async function runInit(
  options: InitOptions,
  ctx: { cwd: string; pkgRoot?: string; log?: (line: string) => void },
): Promise<InitResult> {
  const cwd = ctx.cwd;
  const pkgRoot = ctx.pkgRoot ?? getPackageRoot();
  const log = ctx.log ?? ((line: string) => console.log(line));
  const copyOpts = { force: options.force, dryRun: options.dryRun };
  const copies: CopyRecord[] = [];
  const createdDirs: string[] = [];
  const createdFiles: string[] = [];

  if (options.dryRun) log(chalk.cyan.bold('Dry run — nothing will be written\n'));

  if (resolve(pkgRoot) === resolve(cwd)) {
    log(chalk.yellow('  ○ Running inside the package itself — skills and data are already in place'));
  } else {
    // 1. Skills → .claude/skills/
    const skillsSrc = resolveSkillsSource(pkgRoot);
    if (!skillsSrc) {
      throw new Error(`No skills directory found under ${pkgRoot}`);
    }
    copies.push(
      ...copyTree(skillsSrc, join(cwd, '.claude', 'skills'), {
        ...copyOpts,
        filter: (rel) => rel.startsWith('qa-'),
      }),
    );

    // 2. Sub-agents → .claude/agents/
    const agentsCandidates = [join(pkgRoot, 'agents'), join(pkgRoot, '.claude', 'agents')];
    const agentsSrc = agentsCandidates.find((p) => existsSync(p));
    if (agentsSrc) {
      copies.push(
        ...copyTree(agentsSrc, join(cwd, '.claude', 'agents'), {
          ...copyOpts,
          filter: (rel) => rel.endsWith('.md'),
        }),
      );
    }

    // 3. Data → data/
    const dataSrc = join(pkgRoot, 'data');
    copies.push(...copyTree(join(dataSrc, 'knowledge'), join(cwd, 'data', 'knowledge'), copyOpts));
    copies.push(
      ...copyTree(join(dataSrc, 'domains'), join(cwd, 'data', 'domains'), {
        ...copyOpts,
        filter: (rel) => rel.endsWith('.yml'),
      }),
    );
    copies.push(...copyTree(join(dataSrc, 'templates'), join(cwd, 'data', 'templates'), copyOpts));
    copies.push(...copyTree(join(dataSrc, 'security'), join(cwd, 'data', 'security'), copyOpts));
    copies.push(
      ...copyTree(join(dataSrc, 'targets'), join(cwd, 'data', 'targets'), {
        ...copyOpts,
        filter: (rel) => {
          if (!rel.endsWith('.yml') || rel.includes('/')) return false;
          if (rel.startsWith('local-')) return false;
          if (rel === '_default.yml') return true;
          if (!options.includeExamples) return false;
          return rel.startsWith('_example-') || rel === 'testers-ai.yml';
        },
      }),
    );

    // 4. Mobile driver + scripts → qa/bin/ (never the qualiow launcher shim
    // itself — a consumer project runs the real npm-installed `qualiow` bin,
    // not a copy of the plugin-only fallback shim).
    const binSrc = join(pkgRoot, 'bin');
    copies.push(
      ...copyTree(binSrc, join(cwd, 'qa', 'bin'), {
        ...copyOpts,
        filter: (rel) => rel !== 'qualiow',
      }),
    );
    if (existsSync(binSrc)) {
      const versionPath = join(cwd, 'qa', 'bin', 'VERSION');
      const version = `${getPackageVersion(pkgRoot)}\n`;
      const exists = existsSync(versionPath);
      const same = exists && readFileSync(versionPath, 'utf-8') === version;
      const status: CopyStatus = !exists ? 'installed' : same ? 'unchanged' : options.force ? 'overwritten' : 'skipped';
      if (!options.dryRun && (status === 'installed' || status === 'overwritten')) {
        mkdirSync(dirname(versionPath), { recursive: true });
        writeFileSync(versionPath, version);
      }
      copies.push({ dest: versionPath, status });
    }

    // 5. .env.example → qa/.env.example
    const envExampleSrc = join(pkgRoot, '.env.example');
    if (existsSync(envExampleSrc)) {
      copies.push(copyEntry(envExampleSrc, join(cwd, 'qa', '.env.example'), copyOpts));
    }
  }

  // 5b. Hooks (opt-in) → qa/hooks/ + .claude/settings.json
  let hooksSettingsChanged = false;
  if (options.hooks) {
    const hooksScriptsSrc = join(pkgRoot, 'hooks', 'scripts');
    copies.push(
      ...copyTree(hooksScriptsSrc, join(cwd, 'qa', 'hooks'), {
        ...copyOpts,
        filter: (rel) => rel.endsWith('.mjs'),
      }),
    );

    const settingsPath = join(cwd, '.claude', 'settings.json');
    const settingsExisted = existsSync(settingsPath);
    let existingSettings: unknown;
    if (settingsExisted) {
      try {
        existingSettings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
      } catch {
        existingSettings = undefined;
      }
    }
    const { settings, changed } = mergeQualiowHookSettings(existingSettings);
    hooksSettingsChanged = changed || !settingsExisted;
    if (!options.dryRun) {
      mkdirSync(dirname(settingsPath), { recursive: true });
      writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
    }
  }

  // 6. Output directories
  for (const dir of ['output/sessions', 'output/bugs', 'output/context', '.auth', 'qa']) {
    const full = join(cwd, dir);
    if (!existsSync(full)) {
      createdDirs.push(full);
      if (!options.dryRun) mkdirSync(full, { recursive: true });
    }
  }

  // 7. Index files (only when missing)
  for (const [rel, content] of [
    ['output/sessions/INDEX.md', INDEX_MD_HEADER],
    ['output/bugs/all-bugs.md', ALL_BUGS_MD_HEADER],
  ] as const) {
    const full = join(cwd, rel);
    if (!existsSync(full)) {
      createdFiles.push(full);
      if (!options.dryRun) {
        mkdirSync(dirname(full), { recursive: true });
        writeFileSync(full, content);
      }
    }
  }

  // 8. .gitignore (exact-line merge, idempotent)
  const gitignorePath = join(cwd, '.gitignore');
  const existing = existsSync(gitignorePath) ? readFileSync(gitignorePath, 'utf-8') : '';
  const merged = mergeGitignore(existing);
  const gitignoreUpdated = merged !== null;
  if (merged !== null && !options.dryRun) {
    writeFileSync(gitignorePath, merged);
  }

  // 9. Report
  const counts: Record<CopyStatus, number> = { installed: 0, unchanged: 0, overwritten: 0, skipped: 0 };
  for (const c of copies) counts[c.status]++;
  const rel = (p: string) => relative(cwd, p) || '.';

  if (copies.length) {
    log(
      chalk.green(`  ✓ Files: ${counts.installed} installed, ${counts.unchanged} unchanged` +
        (counts.overwritten ? `, ${counts.overwritten} overwritten` : '') +
        (counts.skipped ? chalk.yellow(`, ${counts.skipped} skipped (exist and differ — use --force)`) : '')),
    );
    for (const c of copies.filter((x) => x.status === 'skipped')) {
      log(chalk.yellow(`      skipped ${rel(c.dest)}`));
    }
  }
  for (const d of createdDirs) log(chalk.green(`  ✓ Created ${rel(d)}/`));
  for (const f of createdFiles) log(chalk.green(`  ✓ Created ${rel(f)}`));
  log(
    gitignoreUpdated
      ? chalk.green('  ✓ Updated .gitignore (Qualiow block)')
      : chalk.cyan('  ○ .gitignore already up to date'),
  );
  if (options.hooks) {
    log(
      hooksSettingsChanged
        ? chalk.green('  ✓ Wired hooks into .claude/settings.json')
        : chalk.cyan('  ○ .claude/settings.json hooks already up to date'),
    );
  }

  log('');
  log(chalk.cyan.bold(options.dryRun ? 'Dry run complete.' : 'Qualiow initialized.'));
  log('');
  log(chalk.white('Next steps:'));
  log(chalk.white('  1. npx playwright-cli install --skills   # official Playwright skill, next to qualiow'));
  log(chalk.white('  2. cp qa/.env.example qa/.env            # credentials by env var name only'));
  if (options.hooks) {
    log(chalk.white('     QUALIOW_HOOKS=off or QUALIOW_READ_MAX_LINES=<n> under "env" in .claude/settings.json tune the guards'));
  }
  log(chalk.white('  3. /qa-target-setup   or   /qa-explore https://your-app.com'));
  log(chalk.white('  4. mobile: qa/bin/doctor-mobile.sh       # then /qa-explore-mobile --target <id>'));
  log('');

  return { copies, createdDirs, createdFiles, gitignoreUpdated };
}
