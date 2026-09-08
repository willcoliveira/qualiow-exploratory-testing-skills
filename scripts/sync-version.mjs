#!/usr/bin/env node
// Copies package.json's version into .claude-plugin/plugin.json so the npm
// package and the Claude Code plugin always advertise the same release.
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
