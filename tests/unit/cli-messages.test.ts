import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runReport } from '../../src/cli/commands/report.js';
import { runSessionFinalize } from '../../src/cli/commands/session.js';

const REPO_ROOT = resolve(process.cwd());

// `paths.md` allows `qualiow …` and `npx -y -p qualiow-exploratory-testing qualiow …`;
// bare `npx qualiow` resolves a package that does not exist.
const BARE_NPX = /npx\s+qualiow\b/;

const FILES = [
  'src/cli/commands/explore.ts',
  'src/cli/commands/report.ts',
  'src/cli/commands/list.ts',
  'src/cli/commands/kb.ts',
  'src/cli/commands/session.ts',
  'src/cli/commands/validate.ts',
];

const tmpDirs: string[] = [];
afterEach(() => {
  while (tmpDirs.length) rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});

describe('CLI messages never tell the user to run bare `npx qualiow`', () => {
  it.each(FILES)('%s', (file) => {
    const lines = readFileSync(join(REPO_ROOT, file), 'utf-8').split(/\r?\n/);
    const offending = lines
      .map((line, i) => ({ line: i + 1, text: line.trim() }))
      .filter(({ text }) => BARE_NPX.test(text));
    expect(offending).toEqual([]);
  });

  it('the "no output/sessions" errors name a working spelling', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'qualiow-msg-'));
    tmpDirs.push(cwd);
    await expect(runReport({ session: 'latest', format: 'md', stdout: false }, { cwd })).rejects.toThrow(
      /Run `qualiow init` first/,
    );
    await expect(runSessionFinalize('latest', {}, { cwd })).rejects.toThrow(/Run `qualiow init` first/);
  });
});
