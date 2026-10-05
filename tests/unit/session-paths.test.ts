import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { linkSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { relInside, resolveEvidence } from '../../src/utils/session-paths.js';

let root: string;
let session: string;
let outside: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'qualiow-paths-'));
  session = join(root, 'session');
  outside = join(root, 'outside');
  for (const d of ['screenshots', 'videos', 'traces', 'logs', 'evidence', 'snapshots', '.auth', 'verification']) {
    mkdirSync(join(session, d), { recursive: true });
  }
  mkdirSync(outside, { recursive: true });
  writeFileSync(join(session, 'screenshots', 'A1-login.png'), 'png');
  writeFileSync(join(session, 'evidence', 'A2-requests.txt'), 'GET / 200');
  writeFileSync(join(session, 'snapshots', 'A1-tree.yml'), '- tree');
  writeFileSync(join(session, '.auth', 'state.json'), '{}');
  writeFileSync(join(session, 'verification', 'A1-claim.md'), 'x');
  writeFileSync(join(session, 'charter.md'), 'x');
  writeFileSync(join(outside, 'secret.png'), 'png');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function reason(p: unknown): string {
  const r = resolveEvidence(session, p);
  return r.ok ? 'ok' : r.reason;
}

describe('resolveEvidence — accepted', () => {
  it('a regular file under an allowed directory', () => {
    const r = resolveEvidence(session, 'screenshots/A1-login.png');
    expect(r).toMatchObject({ ok: true, rel: 'screenshots/A1-login.png', top: 'screenshots', base: 'A1-login.png', size: 3 });
  });

  it('every allowed top-level directory', () => {
    for (const d of ['videos', 'traces', 'logs', 'evidence']) {
      writeFileSync(join(session, d, 'f.bin'), 'x');
      expect(reason(`${d}/f.bin`)).toBe('ok');
    }
  });
});

describe('resolveEvidence — refused by spelling', () => {
  it.each([
    ['../x', 'segment'],
    ['screenshots/../charter.md', 'segment'],
    ['./screenshots/A1-login.png', 'segment'],
    ['screenshots//A1-login.png', 'segment'],
    ['/etc/hosts', 'absolute'],
    ['~/A1.png', 'starts with ~'],
    ['screenshots\\A1-login.png', 'backslash'],
    ['C:/evidence/A1.png', 'colon'],
    ['screenshots/A1-caf\u00e9.png', 'non-ASCII'],
    ['screenshots/A1-\u0000.png', 'control'],
    ['screenshots/A1-\u202e.png', 'non-ASCII'],
    [`screenshots/${'a'.repeat(200)}.png`, 'longer than 200'],
    ['', 'not a path'],
    [42, 'not a path'],
  ])('%j ⇒ %s', (p, expected) => {
    expect(reason(p)).toContain(expected);
  });

  it.each(['snapshots/A1-tree.yml', 'Snapshots/A1-tree.yml', 'SNAPSHOTS/A1-tree.yml', 'evidence/snapshots/x.png'])(
    '%s ⇒ never evidence (case-folded)',
    (p) => {
      expect(reason(p)).toContain('snapshots/, which is never evidence');
    },
  );

  it.each(['.auth/state.json', '.AUTH/state.json', '.Auth/state.json'])('%s ⇒ never evidence (case-folded)', (p) => {
    expect(reason(p)).toContain('.auth/, which is never evidence');
  });
});

describe('resolveEvidence — refused by what is on disk', () => {
  it('a missing file', () => {
    expect(reason('screenshots/A9-nope.png')).toBe('does not exist');
  });

  it('a zero-byte file', () => {
    writeFileSync(join(session, 'screenshots', 'A1-empty.png'), '');
    expect(reason('screenshots/A1-empty.png')).toBe('is an empty file');
  });

  it('a directory', () => {
    mkdirSync(join(session, 'screenshots', 'A1-dir'));
    expect(reason('screenshots/A1-dir')).toBe('is not a regular file');
  });

  it('a file outside the allowed directories', () => {
    expect(reason('charter.md')).toContain('is not under screenshots/');
    expect(reason('verification/A1-claim.md')).toContain('is not under screenshots/');
  });

  it('a symbolic link to /etc/hosts', () => {
    symlinkSync('/etc/hosts', join(session, 'screenshots', 'A1-hosts.png'));
    expect(reason('screenshots/A1-hosts.png')).toContain('symbolic link leading out of the session');
  });

  it('a symbolic link inside the session to another file inside it', () => {
    symlinkSync(join(session, 'screenshots', 'A1-login.png'), join(session, 'screenshots', 'A3-search.png'));
    expect(reason('screenshots/A3-search.png')).toBe('is a symbolic link — cite the file itself');
  });

  it('a hard link (either name)', () => {
    linkSync(join(session, 'screenshots', 'A1-login.png'), join(session, 'screenshots', 'A2-checkout.png'));
    expect(reason('screenshots/A2-checkout.png')).toContain('is a hard link');
    expect(reason('screenshots/A1-login.png')).toContain('is a hard link');
  });

  it('an allowed directory that is a link out of the session', () => {
    rmSync(join(session, 'logs'), { recursive: true });
    symlinkSync(outside, join(session, 'logs'));
    expect(reason('logs/secret.png')).toBe('leads out of the session directory');
  });

  it('an allowed directory that is a link to snapshots/', () => {
    rmSync(join(session, 'traces'), { recursive: true });
    symlinkSync(join(session, 'snapshots'), join(session, 'traces'));
    expect(reason('traces/A1-tree.yml')).toContain('snapshots/, which is never evidence');
  });

  it('the top-level directory is read in its on-disk case, against an exact-case allow-list', () => {
    mkdirSync(join(session, 'Logs2'));
    writeFileSync(join(session, 'Logs2', 'A1.txt'), 'x');
    // On a case-insensitive disk this resolves to `Logs2/`; on a case-sensitive one it is missing.
    expect(reason('logs2/A1.txt')).toMatch(/is not under screenshots\/|does not exist/);
  });
});

describe('relInside', () => {
  it('is null for the root itself, for a parent and for a sibling', () => {
    expect(relInside('/a/b', '/a/b')).toBeNull();
    expect(relInside('/a/b', '/a')).toBeNull();
    expect(relInside('/a/b', '/a/bc/x')).toBeNull();
    expect(relInside('/a/b', '/a/b/c/d')).toBe('c/d');
  });
});
