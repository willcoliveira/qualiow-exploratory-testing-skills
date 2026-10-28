import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runExplore } from '../../src/cli/commands/explore.js';

const tmpDirs: string[] = [];
function makeTmpCwd(): string {
  const dir = mkdtempSync(join(tmpdir(), 'qualiow-explore-'));
  tmpDirs.push(dir);
  return dir;
}
afterEach(() => {
  while (tmpDirs.length) rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});
const silentLog = (): void => {};

describe('runExplore — an existing session directory', () => {
  it('refuses a second run in the same minute instead of overwriting the charter', async () => {
    const cwd = makeTmpCwd();
    const now = new Date(2026, 8, 8, 18, 13);
    const first = await runExplore('https://example.com', { timeBox: '45m', dryRun: false }, { cwd, now, log: silentLog });
    const charter = join(first.sessionDir, 'charter.md');
    writeFileSync(charter, `${readFileSync(charter, 'utf-8')}\nfilled in by phase 2\n`);

    await expect(
      runExplore('https://example.com', { timeBox: '45m', dryRun: false }, { cwd, now, log: silentLog }),
    ).rejects.toThrow(/already exists/);
    expect(readFileSync(charter, 'utf-8')).toContain('filled in by phase 2');
  });

  it('a dry run over an existing directory still writes nothing and does not throw', async () => {
    const cwd = makeTmpCwd();
    const now = new Date(2026, 8, 8, 18, 13);
    const first = await runExplore('https://example.com', { timeBox: '45m', dryRun: false }, { cwd, now, log: silentLog });
    const dry = await runExplore('https://example.com', { timeBox: '45m', dryRun: true }, { cwd, now, log: silentLog });
    expect(dry.sessionDir).toBe(first.sessionDir);
    expect(existsSync(join(first.sessionDir, 'charter.md'))).toBe(true);
  });
});

describe('runExplore — charter date', () => {
  it.skipIf(process.platform === 'win32')('is the local date the directory name carries, not the UTC one', async () => {
    const previous = process.env.TZ;
    // UTC+14: 01:00 local on the 8th is still the 7th in UTC.
    process.env.TZ = 'Pacific/Kiritimati';
    try {
      const cwd = makeTmpCwd();
      const now = new Date(2026, 8, 8, 1, 0);
      const { sessionDir } = await runExplore('https://example.com', { timeBox: '45m', dryRun: false }, { cwd, now, log: silentLog });
      const name = sessionDir.split(/[\\/]/).pop()!;
      expect(name.startsWith('2026-09-08-0100-')).toBe(true);
      const charter = readFileSync(join(sessionDir, 'charter.md'), 'utf-8');
      expect(charter).toContain('**Date:** 2026-09-08');
    } finally {
      if (previous === undefined) delete process.env.TZ;
      else process.env.TZ = previous;
    }
  });
});
