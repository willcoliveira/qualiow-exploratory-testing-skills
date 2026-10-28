#!/usr/bin/env node
// Keeps the npm package, the Claude Code plugin and the marketplace listing on
// one release version.
//
//   node scripts/sync-version.mjs
//       Copies package.json's version into .claude-plugin/plugin.json and into the
//       marketplace manifest's plugin entry. Wired to the npm `version` lifecycle
//       script; safe to run by hand.
//
//   node scripts/sync-version.mjs --check <version>
//       Writes nothing. Exits 1 unless package.json and .claude-plugin/plugin.json
//       both equal <version> (X.Y.Z, or the tag form vX.Y.Z). The release workflow
//       runs it against the pushed tag.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkgPath = resolve(root, 'package.json');
const manifestPath = resolve(root, '.claude-plugin', 'plugin.json');
const marketplacePath = resolve(root, '.claude-plugin', 'marketplace.json');

const USAGE = `usage: node scripts/sync-version.mjs [--check <X.Y.Z>]`;
const VERSION_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

const readJson = (path) => JSON.parse(readFileSync(path, 'utf-8'));
const writeJson = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + '\n');

function fail(message, code) {
  console.error(`sync-version: ${message}`);
  process.exit(code);
}

const args = process.argv.slice(2);

if (args.length === 0) {
  sync();
} else if (args[0] === '--check') {
  if (args.length !== 2) fail(`--check takes exactly one version\n${USAGE}`, 2);
  check(args[1]);
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

  const marketplace = readJson(marketplacePath);
  const plugin = marketplace.plugins?.[0];
  if (plugin && plugin.version !== pkg.version) {
    plugin.version = pkg.version;
    writeJson(marketplacePath, marketplace);
    console.log(`marketplace.json plugins[0].version -> ${pkg.version}`);
  } else if (plugin) {
    console.log(`marketplace.json already at ${pkg.version}`);
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
