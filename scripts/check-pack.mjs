#!/usr/bin/env node
// Asserts the npm tarball contains what the three install paths need and
// nothing that must stay out of it. Runs `npm pack --dry-run --json`.
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const MUST_INCLUDE = [
  'dist/index.js',
  'dist/index.d.ts',
  'dist/cli/index.js',
  'skills/qa-explore/SKILL.md',
  'skills/qa-explore/references/paths.md',
  'skills/qa-explore/references/security-rules.md',
  'skills/qa-explore-mobile/SKILL.md',
  'skills/qa-verify-backend/SKILL.md',
  'agents/qa-gather-agent.md',
  'agents/qa-bug-judge.md',
  '.claude-plugin/plugin.json',
  '.claude-plugin/marketplace.json',
  'bin/qualiow',
  'hooks/hooks.json',
  'hooks/scripts/read-guard.mjs',
  'hooks/scripts/write-guard.mjs',
  'hooks/scripts/bash-guard.mjs',
  'hooks/scripts/secret-patterns.mjs',
  'bin/mcli',
  'bin/mobile-cli.mjs',
  'bin/wadb',
  'bin/wk-ios',
  'bin/wkeval.mjs',
  'bin/doctor-mobile.sh',
  'bin/setup-mobile.sh',
  'data/security/SECURITY-POLICY.md',
  'data/knowledge/manifest.yml',
  'data/domains/_default.yml',
  'data/templates/bug-report.md',
  'data/targets/_default.yml',
  'data/targets/_example-api-only.yml',
  'data/targets/_example-backend.yml',
  'data/targets/parabank.yml',
  'data/targets/saucedemo.yml',
  'docs/GETTING-STARTED.md',
  'docs/MOBILE-SETUP.md',
  'docs/BACKEND-VERIFICATION.md',
  '.env.example',
  'CHANGELOG.md',
];

const MUST_EXCLUDE = [
  /^\.claude\//,
  /^src\//,
  /^tests\//,
  /\.map$/,
  /^data\/targets\/local-/,
  /^data\/domains\/.*\.md$/,
  /^docs\/KNOWN-ISSUES\.md$/,
  /^docs\/ARCHITECTURE-DECISIONS\.md$/,
  /^scripts\//,
  /^output\//,
];

// Credentials and session state: refused wherever they sit in the tree, not only at the root.
// `.env.example` is the one shipped template.
export const SENSITIVE = [
  /(^|\/)\.env(\.(?!example$)[^/]*)?$/,
  /(^|\/)\.auth\//,
  /(^|\/)\.npmrc$/,
  /(^|\/)[^/]*storage[-_]?state[^/]*\.json$/i,
  /(^|\/)\.playwright-cli\//,
  /(^|\/)[^/]*\.(pem|key|p12)$/i,
];

export const isSensitive = (path) => SENSITIVE.some((re) => re.test(path));

// The POC target configs never ship. parabank and saucedemo are the shipped demo
// targets (MUST_INCLUDE above), so they are not on this list.
const POC_TARGETS = [
  'compendiumdev', 'demoqa', 'gh-users-search', 'thinking-tester', 'ultimateqa', 'webdriveruniversity',
];

/**
 * Pure check over the packed file list. `tracked` is the set of paths under version
 * control and `modified` the tracked paths with uncommitted changes (null skips that part).
 * Everything shipped outside dist/ must be tracked and unmodified, so an untracked
 * _client.yml or a locally edited mirror never reaches the registry.
 */
export function findProblems(files, tracked, modified) {
  const problems = [];
  for (const path of MUST_INCLUDE) {
    if (!files.has(path)) problems.push(`missing: ${path}`);
  }
  for (const path of files) {
    for (const re of MUST_EXCLUDE) {
      if (re.test(path)) problems.push(`must not ship: ${path}`);
    }
    if (isSensitive(path)) problems.push(`sensitive path must not ship: ${path}`);
    for (const poc of POC_TARGETS) {
      if (path === `data/targets/${poc}.yml`) problems.push(`must not ship: ${path}`);
    }
    if (tracked && !path.startsWith('dist/') && path !== 'package.json') {
      if (!tracked.has(path)) problems.push(`shipped but not tracked: ${path}`);
      else if (modified && modified.has(path)) problems.push(`shipped with uncommitted changes: ${path}`);
    }
  }
  return problems;
}

function main() {
  const out = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
    cwd: root,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const files = new Set(JSON.parse(out)[0].files.map((f) => f.path));

  const vcs = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf-8' });
  const tracked = new Set(vcs('ls-files', '-z').split('\0').filter(Boolean));
  const modified = new Set(
    vcs('status', '--porcelain', '-z', '--untracked-files=no')
      .split('\0')
      .filter((l) => l.length > 3)
      .map((l) => l.slice(3)),
  );

  const problems = findProblems(files, tracked, modified);
  if (problems.length) {
    console.error('check-pack: FAILED');
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
  }
  console.log(`check-pack: OK (${files.size} files)`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
