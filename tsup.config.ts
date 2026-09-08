import { defineConfig } from 'tsup';

// Two builds: the library (with type declarations) and the CLI (with the
// shebang injected as a banner so it never depends on the first line of the
// source file). Sourcemaps are off so the tarball does not embed src/.
export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    format: ['esm'],
    dts: true,
    sourcemap: false,
    clean: true,
    target: 'node22',
    outDir: 'dist',
    splitting: false,
  },
  {
    entry: { 'cli/index': 'src/cli/index.ts' },
    format: ['esm'],
    dts: false,
    sourcemap: false,
    clean: false,
    target: 'node22',
    outDir: 'dist',
    splitting: false,
    banner: { js: '#!/usr/bin/env node' },
  },
]);
