import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readEnvVar } from '../../src/utils/paths.js';

// Obviously fake names, unique enough that no real environment sets them.
const NAME = 'QUALIOW_TEST_PATHS_PASS';
const VALUE = 'Bom-Pass-fake-0001';

const tmpDirs: string[] = [];

function makeTmpDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'qualiow-paths-cred-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  delete process.env[NAME];
  while (tmpDirs.length) rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});

describe('readEnvVar — .env files', () => {
  it('reads the first variable of a qa/.env saved with a UTF-8 byte-order mark', () => {
    const cwd = makeTmpDir();
    mkdirSync(join(cwd, 'qa'));
    writeFileSync(join(cwd, 'qa', '.env'), `﻿${NAME}=${VALUE}\nQUALIOW_TEST_OTHER=x\n`);
    expect(readEnvVar(cwd, NAME)).toBe(VALUE);
  });

  it('reads the first variable of a root .env saved with a byte-order mark', () => {
    const cwd = makeTmpDir();
    writeFileSync(join(cwd, '.env'), `﻿${NAME}=${VALUE}\n`);
    expect(readEnvVar(cwd, NAME)).toBe(VALUE);
  });
});
