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
  '.claude-plugin/plugin.json',
  '.claude-plugin/marketplace.json',
  'bin/qualiow',
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
  'data/targets/testers-ai.yml',
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
  /^\.env$/,
  /^\.auth\//,
];

// The POC target configs never ship.
const POC_TARGETS = [
  'compendiumdev', 'demoqa', 'gh-users-search', 'parabank',
  'saucedemo', 'thinking-tester', 'ultimateqa', 'webdriveruniversity',
];

const out = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
  cwd: root,
  encoding: 'utf-8',
  stdio: ['ignore', 'pipe', 'ignore'],
});
const files = new Set(JSON.parse(out)[0].files.map((f) => f.path));

const problems = [];
for (const path of MUST_INCLUDE) {
  if (!files.has(path)) problems.push(`missing: ${path}`);
}
for (const path of files) {
  for (const re of MUST_EXCLUDE) {
    if (re.test(path)) problems.push(`must not ship: ${path}`);
  }
  for (const poc of POC_TARGETS) {
    if (path === `data/targets/${poc}.yml`) problems.push(`must not ship: ${path}`);
  }
}

if (problems.length) {
  console.error('check-pack: FAILED');
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`check-pack: OK (${files.size} files)`);
