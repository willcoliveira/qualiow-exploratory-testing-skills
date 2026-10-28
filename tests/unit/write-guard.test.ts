import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import {
  MIN_SECRET_VALUE_LENGTH as HOOK_MIN_LENGTH,
  secretValueVariants as hookVariants,
} from '../../hooks/scripts/secret-patterns.mjs';
import { MIN_SECRET_VALUE_LENGTH, secretValueVariants } from '../../src/utils/secret-values.js';

const WRITE_GUARD = join(resolve(process.cwd()), 'hooks', 'scripts', 'write-guard.mjs');
const BUG = 'output/sessions/2026-09-08-1813-explore-x/bugs/BUG-001.md';

const tmpDirs: string[] = [];
function makeTmpCwd(): string {
  const dir = mkdtempSync(join(tmpdir(), 'qualiow-write-guard-'));
  tmpDirs.push(dir);
  return dir;
}
afterEach(() => {
  while (tmpDirs.length) rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});

function seed(cwd: string, rel: string, content: string): void {
  const abs = join(cwd, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

function guard(
  cwd: string,
  tool_name: string,
  tool_input: Record<string, unknown>,
  env: Record<string, string> = {},
): string | null {
  const base: Record<string, string | undefined> = { ...process.env, ...env };
  delete base.QUALIOW_HOOKS;
  const stdout = execFileSync('node', [WRITE_GUARD], {
    input: JSON.stringify({ session_id: 't', cwd, hook_event_name: 'PreToolUse', tool_name, tool_input }),
    env: base,
    encoding: 'utf-8',
  });
  if (!stdout.trim()) return null;
  const d = JSON.parse(stdout).hookSpecificOutput;
  expect(d.permissionDecision).toBe('deny');
  return d.permissionDecisionReason as string;
}

describe('write-guard.mjs hardening', () => {
  it('judges an Edit on the file as it would read afterwards', () => {
    const cwd = makeTmpCwd();
    seed(cwd, BUG, 'Evidence:\npassword=[REDACTED]\nend\n');
    // new_string alone is clean; dropped in place of the placeholder it is not.
    const reason = guard(cwd, 'Edit', { file_path: BUG, old_string: '[REDACTED]', new_string: 'hunter2' });
    expect(reason).toContain('Password');
    expect(reason).not.toContain('hunter2');

    seed(cwd, BUG, 'Authorization: [REDACTED]\n');
    expect(guard(cwd, 'Edit', { file_path: BUG, old_string: '[REDACTED]', new_string: 'Basic dXNlcjpw' })).toContain(
      'Authorization header',
    );
  });

  it('lets an edit that removes one of several secrets through', () => {
    const cwd = makeTmpCwd();
    seed(cwd, BUG, 'password=hunter2\npassword=letmein\n');
    expect(guard(cwd, 'Edit', { file_path: BUG, old_string: 'password=hunter2', new_string: 'password=[REDACTED]' })).toBeNull();
  });

  it('applies MultiEdit edits in sequence and honours replace_all', () => {
    const cwd = makeTmpCwd();
    seed(cwd, BUG, 'token=\nnote\n');
    const reason = guard(cwd, 'MultiEdit', {
      file_path: BUG,
      edits: [
        { old_string: 'note', new_string: 'clean' },
        { old_string: 'token=\n', new_string: 'token=abcdefgh1234\n', replace_all: true },
      ],
    });
    expect(reason).toContain('Token');
  });

  it('falls back to new_string when the file cannot be read', () => {
    const cwd = makeTmpCwd();
    expect(guard(cwd, 'Edit', { file_path: BUG, old_string: 'a', new_string: 'password=hunter2' })).toContain('Password');
    expect(guard(cwd, 'Edit', { file_path: BUG, old_string: 'a', new_string: 'clean text' })).toBeNull();
  });

  it('normalises the path: `..` cannot borrow the snapshots exemption', () => {
    const cwd = makeTmpCwd();
    const sneaky = 'output/sessions/x/snapshots/../bugs/BUG-001.md';
    expect(guard(cwd, 'Write', { file_path: sneaky, content: 'password=hunter2' })).toContain('Password');
    expect(guard(cwd, 'Write', { file_path: 'output/sessions/x/snapshots/p.yml', content: 'password=hunter2' })).toBeNull();
  });

  it('matches output/ case-insensitively and through an absolute path', () => {
    const cwd = makeTmpCwd();
    expect(guard(cwd, 'Write', { file_path: 'Output/sessions/x/bugs/BUG-001.md', content: 'password=hunter2' })).toContain(
      'Password',
    );
    expect(guard(cwd, 'Write', { file_path: join(cwd, BUG), content: 'password=hunter2' })).toContain('Password');
    expect(guard(cwd, 'Write', { file_path: 'src/output-notes.md', content: 'password=hunter2' })).toBeNull();
  });

  it('handles NotebookEdit (notebook_path + new_source)', () => {
    const cwd = makeTmpCwd();
    const nb = 'output/sessions/x/analysis.ipynb';
    expect(guard(cwd, 'NotebookEdit', { notebook_path: nb, new_source: 'key = "sk_' + 'live_abcdefghij123"' })).toContain(
      'Stripe key',
    );
    expect(guard(cwd, 'NotebookEdit', { notebook_path: nb, new_source: 'print(1)' })).toBeNull();
    expect(guard(cwd, 'NotebookEdit', { notebook_path: 'notes/a.ipynb', new_source: 'password=hunter2' })).toBeNull();
  });

  it('denies JSON-quoted secrets and lets the redacted JSON through', () => {
    const cwd = makeTmpCwd();
    expect(guard(cwd, 'Write', { file_path: BUG, content: '{"password":"hunter2"}' })).toContain('Password');
    expect(guard(cwd, 'Write', { file_path: BUG, content: '{"password":"[REDACTED]"}' })).toBeNull();
  });
});

describe('write-guard.mjs known credential values', () => {
  // Obviously fake values; the names are the ones the shipped configs use.
  const PASS = 'Summer2026!fake';
  const APP_SECRET = 'not-a-real-secret-42';

  function seedEnv(cwd: string): void {
    seed(cwd, 'qa/.env', `QA_USER=qa.user\nQA_PASS=${PASS}\nQA_AWS_REGION=eu-west-1\n`);
    seed(cwd, '.env', `APP_CLIENT_SECRET="${APP_SECRET}"\nSHORT_TOKEN=abc12\n`);
  }

  it('denies a Write under output/ that carries a qa/.env value, naming the variable and never the value', () => {
    const cwd = makeTmpCwd();
    seedEnv(cwd);
    const reason = guard(cwd, 'Write', { file_path: BUG, content: `Steps:\n1. Log in with qa.user / ${PASS}\n` });
    expect(reason).toContain('QA_PASS');
    expect(reason).toContain('qualiow auth fill');
    expect(reason).not.toContain(PASS);
  });

  it('catches the value URL-encoded, JSON-escaped and base64-encoded, and a .env value by name pattern', () => {
    const cwd = makeTmpCwd();
    seedEnv(cwd);
    for (const content of [
      `body: username=qa.user&password=${encodeURIComponent(PASS)}`,
      `Authorization header was ${Buffer.from(`qa.user:x`).toString('base64')} and ${Buffer.from(PASS).toString('base64')}`,
      JSON.stringify({ note: `typed ${PASS}` }),
    ]) {
      expect(guard(cwd, 'Write', { file_path: BUG, content })).toContain('QA_PASS');
    }
    expect(guard(cwd, 'Write', { file_path: BUG, content: `client secret ${APP_SECRET}` })).toContain('APP_CLIENT_SECRET');
  });

  it('ignores values under six characters, names outside the list, and paths outside output/ or under snapshots/', () => {
    const cwd = makeTmpCwd();
    seedEnv(cwd);
    expect(guard(cwd, 'Write', { file_path: BUG, content: 'region eu-west-1, user qa.user, code abc12' })).toBeNull();
    expect(guard(cwd, 'Write', { file_path: 'notes/login.md', content: PASS })).toBeNull();
    expect(guard(cwd, 'Write', { file_path: 'output/sessions/x/snapshots/p.yml', content: PASS })).toBeNull();
  });

  it('reads a default name from the environment when no .env file sets it', () => {
    const cwd = makeTmpCwd();
    expect(guard(cwd, 'Write', { file_path: BUG, content: `token ${PASS}` }, { QA_TOKEN: PASS })).toContain('QA_TOKEN');
    expect(guard(cwd, 'Write', { file_path: BUG, content: `token ${PASS}` }, { UNRELATED_VAR: PASS })).toBeNull();
  });

  it('judges an Edit on the file afterwards: introducing the value is denied, removing it passes', () => {
    const cwd = makeTmpCwd();
    seedEnv(cwd);
    seed(cwd, BUG, 'Password: [REDACTED-PLACEHOLDER]\n');
    expect(
      guard(cwd, 'Edit', { file_path: BUG, old_string: '[REDACTED-PLACEHOLDER]', new_string: PASS.slice(0, 7) }),
    ).toBeNull();
    seed(cwd, BUG, `Password: ${PASS.slice(0, 7)}\n`);
    // Neither half is the value; together they are.
    expect(
      guard(cwd, 'Edit', { file_path: BUG, old_string: '\n', new_string: `${PASS.slice(7)}\n` }),
    ).toContain('QA_PASS');

    seed(cwd, BUG, `Password: ${PASS}\nmore\n`);
    expect(guard(cwd, 'Edit', { file_path: BUG, old_string: PASS, new_string: '[REDACTED]' })).toBeNull();
  });

  it('fails open on an unreadable .env', () => {
    const cwd = makeTmpCwd();
    mkdirSync(join(cwd, 'qa', '.env'), { recursive: true }); // a directory, not a file
    expect(guard(cwd, 'Write', { file_path: BUG, content: 'clean text' })).toBeNull();
  });

  it('uses the same variants and minimum length as src/utils/secret-values.ts', () => {
    expect(HOOK_MIN_LENGTH).toBe(MIN_SECRET_VALUE_LENGTH);
    for (const value of [PASS, 'with space & ampersand', 'ünïcødé-pässwörd', 'a"quote\\back', 'short']) {
      expect(hookVariants(value)).toEqual(secretValueVariants(value));
    }
  });
});
