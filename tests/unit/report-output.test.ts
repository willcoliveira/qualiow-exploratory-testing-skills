import { describe, it, expect, afterEach } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  symlinkSync,
  cpSync,
  realpathSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { resolveReportOutputPath, runReport } from '../../src/cli/commands/report.js';

const tmpDirs: string[] = [];
afterEach(() => {
  while (tmpDirs.length) rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});
const silentLog = () => {};

const FIXTURE = resolve(
  process.cwd(),
  'tests',
  'fixtures',
  'canonical-session',
  '2026-09-08-1813-explore-example',
);

function makeCwd(): string {
  // realpath so comparisons hold where tmpdir() is itself a link (macOS /var).
  const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'qualiow-report-out-')));
  tmpDirs.push(cwd);
  mkdirSync(join(cwd, 'output', 'sessions'), { recursive: true });
  return cwd;
}

describe('resolveReportOutputPath — confined to output/', () => {
  it('places a bare relative file under output/, and accepts a leading output/', () => {
    const cwd = makeCwd();
    expect(resolveReportOutputPath(cwd, 'report.html')).toBe(join(cwd, 'output', 'report.html'));
    expect(resolveReportOutputPath(cwd, 'output/report.html')).toBe(join(cwd, 'output', 'report.html'));
    expect(resolveReportOutputPath(cwd, join(cwd, 'output', 'x', 'bugs.csv'))).toBe(
      join(cwd, 'output', 'x', 'bugs.csv'),
    );
    expect(existsSync(join(cwd, 'output', 'x'))).toBe(true);
  });

  it.each([
    ['../escape.html'],
    ['sub/../../escape.html'],
    ['output/../../escape.html'],
    ['output/../package.json'],
    ['/etc/passwd'],
    ['.'],
    ['output'],
  ])('refuses %s', (requested) => {
    const cwd = makeCwd();
    expect(() => resolveReportOutputPath(cwd, requested)).toThrow(/Refusing to write the report/);
  });

  it('refuses an absolute path outside output/', () => {
    const cwd = makeCwd();
    expect(() => resolveReportOutputPath(cwd, join(cwd, '.claude', 'settings.json'))).toThrow(/outside output/);
  });

  it('refuses a symlinked directory under output/ that leads out of it, creating nothing there', () => {
    const cwd = makeCwd();
    const elsewhere = join(cwd, 'elsewhere');
    mkdirSync(elsewhere);
    symlinkSync(elsewhere, join(cwd, 'output', 'link'));
    expect(() => resolveReportOutputPath(cwd, 'link/report.html')).toThrow(/link out of output/);
    expect(() => resolveReportOutputPath(cwd, 'link/new/report.html')).toThrow(/link out of output/);
    expect(existsSync(join(elsewhere, 'new'))).toBe(false);
  });

  it('refuses to write through an existing symlink', () => {
    const cwd = makeCwd();
    const victim = join(cwd, 'victim.txt');
    writeFileSync(victim, 'keep');
    symlinkSync(victim, join(cwd, 'output', 'report.html'));
    expect(() => resolveReportOutputPath(cwd, 'report.html')).toThrow(/symbolic link/);
  });
});

describe('runReport -o', () => {
  it('writes inside output/ and refuses a path outside without touching it', async () => {
    const cwd = makeCwd();
    cpSync(FIXTURE, join(cwd, 'output', 'sessions', '2026-09-08-1813-explore-example'), { recursive: true });
    const outside = join(cwd, 'package.json');
    writeFileSync(outside, '{}');

    await expect(
      runReport({ session: 'latest', format: 'json', output: '../package.json', stdout: false }, { cwd, log: silentLog }),
    ).rejects.toThrow(/Refusing to write the report/);
    expect(readFileSync(outside, 'utf-8')).toBe('{}');

    const { outputPath } = await runReport(
      { session: 'latest', format: 'json', output: 'report.json', stdout: false },
      { cwd, log: silentLog },
    );
    expect(outputPath).toBe(join(cwd, 'output', 'report.json'));
    expect(existsSync(outputPath!)).toBe(true);
  });
});
