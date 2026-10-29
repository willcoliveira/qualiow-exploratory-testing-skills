#!/usr/bin/env node
// Keeps the npm package, the Claude Code plugin and the marketplace listing on
// one release version.
//
//   node scripts/sync-version.mjs
//       Copies package.json's version into .claude-plugin/plugin.json. Wired to the
//       npm `version` lifecycle script; safe to run by hand. It does not touch
//       marketplace.json: the marketplace entry is pinned to a published release
//       and moves only with --pin.
//
//   node scripts/sync-version.mjs --check <version>
//       Writes nothing. Exits 1 unless package.json and .claude-plugin/plugin.json
//       both equal <version> (X.Y.Z, or the tag form vX.Y.Z). The release workflow
//       runs it against the pushed tag.
//
//   node scripts/sync-version.mjs --pin <vX.Y.Z>
//       Run after the release workflow has published X.Y.Z. Points the marketplace
//       entry at that release: version, and a github source with ref = the tag and
//       sha = the tag's commit, resolved with the local git. Refuses unless the tag
//       is an annotated tag whose commit is on origin/main and whose
//       .claude-plugin/plugin.json says X.Y.Z. Never fetches; run `git fetch origin
//       --tags` first.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkgPath = resolve(root, 'package.json');
const manifestPath = resolve(root, '.claude-plugin', 'plugin.json');
const marketplacePath = resolve(root, '.claude-plugin', 'marketplace.json');

const USAGE = `usage: node scripts/sync-version.mjs [--check <X.Y.Z> | --pin <vX.Y.Z>]`;
const VERSION_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const RELEASE_TAG_RE = /^v\d+\.\d+\.\d+$/;

const readJson = (path) => JSON.parse(readFileSync(path, 'utf-8'));
const writeJson = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + '\n');

function fail(message, code) {
  console.error(`sync-version: ${message}`);
  process.exit(code);
}

const args = process.argv.slice(2);

if (args.length === 0) {
  sync();
} else if (args[0] === '--check' || args[0] === '--pin') {
  if (args.length !== 2) fail(`${args[0]} takes exactly one value\n${USAGE}`, 2);
  if (args[0] === '--check') check(args[1]);
  else pin(args[1]);
} else {
  fail(`unknown argument "${args[0]}"\n${USAGE}`, 2);
}

function sync() {
  const pkg = readJson(pkgPath);
  const manifest = readJson(manifestPath);
  if (manifest.version !== pkg.version) {
    manifest.version = pkg.version;
    writeJson(manifestPath, manifest);
    console.log(`plugin.json version -> ${pkg.version}`);
  } else {
    console.log(`plugin.json already at ${pkg.version}`);
  }
}

function check(raw) {
  const want = raw.startsWith('v') ? raw.slice(1) : raw;
  if (!VERSION_RE.test(want)) fail(`"${raw}" is not a version (expected X.Y.Z or vX.Y.Z)\n${USAGE}`, 2);

  const found = [
    ['package.json', readJson(pkgPath).version],
    ['.claude-plugin/plugin.json', readJson(manifestPath).version],
  ];
  const wrong = found.filter(([, version]) => version !== want);
  if (wrong.length > 0) {
    const detail = wrong.map(([file, version]) => `${file} is ${JSON.stringify(version)}`).join(', ');
    fail(
      `version mismatch: expected ${want}, but ${detail}. ` +
        `Bump with \`npm version ${want}\` (it runs this script) and tag the commit that carries it.`,
      1,
    );
  }
  console.log(`package.json and .claude-plugin/plugin.json are both at ${want}`);
}

function git(...gitArgs) {
  return execFileSync('git', gitArgs, {
    cwd: root,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function tryGit(...gitArgs) {
  try {
    return git(...gitArgs);
  } catch {
    return null;
  }
}

function githubRepo(pkg) {
  const url = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;
  const match = /github\.com[/:]([^/]+\/[^/]+?)(?:\.git)?$/.exec(url ?? '');
  if (!match) fail(`package.json repository (${JSON.stringify(url)}) is not a github.com repository`, 1);
  return match[1];
}

function pin(tag) {
  if (!RELEASE_TAG_RE.test(tag)) fail(`"${tag}" is not a release tag (expected vX.Y.Z)\n${USAGE}`, 2);
  const version = tag.slice(1);

  const type = tryGit('cat-file', '-t', `refs/tags/${tag}`);
  if (type === null) fail(`tag ${tag} does not exist here; run \`git fetch origin --tags\` first`, 1);
  if (type !== 'tag') fail(`${tag} is a lightweight tag; a release tag is annotated`, 1);
  const sha = git('rev-parse', `refs/tags/${tag}^{commit}`);

  if (tryGit('rev-parse', '--verify', '--quiet', 'refs/remotes/origin/main') === null) {
    fail('there is no origin/main here; run `git fetch origin` first', 1);
  }
  if (tryGit('merge-base', '--is-ancestor', sha, 'refs/remotes/origin/main') === null) {
    fail(`${tag} (${sha}) is not on origin/main; only a released commit on main can be pinned`, 1);
  }

  const shipped = tryGit('show', `${sha}:.claude-plugin/plugin.json`);
  let shippedVersion;
  try {
    shippedVersion = JSON.parse(shipped ?? '').version;
  } catch {
    shippedVersion = undefined;
  }
  if (shippedVersion !== version) {
    fail(
      `${tag}'s .claude-plugin/plugin.json says ${JSON.stringify(shippedVersion)}, not "${version}"; ` +
        `plugin installs would cache it under the wrong version`,
      1,
    );
  }

  const repo = githubRepo(readJson(pkgPath));
  const marketplace = readJson(marketplacePath);
  const entry = marketplace.plugins?.[0];
  if (!entry) fail('.claude-plugin/marketplace.json has no plugins[0] entry', 1);

  const source = { source: 'github', repo, ref: tag, sha };
  if (entry.version === version && JSON.stringify(entry.source) === JSON.stringify(source)) {
    console.log(`marketplace.json already pinned to ${repo}@${tag} (${sha})`);
    return;
  }
  entry.source = source;
  entry.version = version;
  writeJson(marketplacePath, marketplace);
  console.log(`marketplace.json plugins[0] -> ${repo}@${tag} (${sha}), version ${version}`);
}
