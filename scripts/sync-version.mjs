#!/usr/bin/env node
// Copies package.json's version into .claude-plugin/plugin.json and into the
// marketplace manifest's plugin entry so the npm package, the Claude Code
// plugin, and the marketplace listing always advertise the same release.
// Wired to the npm `version` lifecycle script; safe to run by hand.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf-8'));

const manifestPath = resolve(root, '.claude-plugin', 'plugin.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));

if (manifest.version !== pkg.version) {
  manifest.version = pkg.version;
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`plugin.json version -> ${pkg.version}`);
} else {
  console.log(`plugin.json already at ${pkg.version}`);
}

const marketplacePath = resolve(root, '.claude-plugin', 'marketplace.json');
const marketplace = JSON.parse(readFileSync(marketplacePath, 'utf-8'));
const plugin = marketplace.plugins?.[0];

if (plugin && plugin.version !== pkg.version) {
  plugin.version = pkg.version;
  writeFileSync(marketplacePath, JSON.stringify(marketplace, null, 2) + '\n');
  console.log(`marketplace.json plugins[0].version -> ${pkg.version}`);
} else if (plugin) {
  console.log(`marketplace.json already at ${pkg.version}`);
}
