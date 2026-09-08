#!/usr/bin/env node
// Thin wrapper so the knowledge-base sync can run without the CLI being on
// PATH: `node scripts/kb-sync.mjs [--check]`. Requires `npm run build` first.
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist', 'index.js');
if (!existsSync(dist)) {
  console.error('dist/index.js not found — run `npm run build` first');
  process.exit(1);
}
const { syncKnowledgeManifest } = await import(dist);
const check = process.argv.includes('--check');
const result = syncKnowledgeManifest(resolve(root, 'data'), { check });
if (check && result.changed) {
  console.error('manifest.yml is out of sync — run: node scripts/kb-sync.mjs');
  process.exit(1);
}
console.log(
  check
    ? `manifest.yml in sync (${result.entryCount} entries)`
    : result.changed
      ? `manifest.yml updated (${result.entryCount} entries)`
      : `manifest.yml already in sync (${result.entryCount} entries)`,
);
