import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { containsSecrets } from '../../src/utils/redact.js';
import { findSecretCategories } from '../../hooks/scripts/secret-patterns.mjs';
import { QUALIOW_HOOK_ENTRIES } from '../../src/utils/settings-merge.js';

const REPO_ROOT = resolve(process.cwd());
const HOOKS_JSON = join(REPO_ROOT, 'hooks', 'hooks.json');
const READ_GUARD = join(REPO_ROOT, 'hooks', 'scripts', 'read-guard.mjs');
const WRITE_GUARD = join(REPO_ROOT, 'hooks', 'scripts', 'write-guard.mjs');

// The same sample strings tests/unit/redact.test.ts uses, so the hook's copy of the
// pattern list and src/utils/redact.ts are held to one verdict per string.
const SECRET_SAMPLES = [
  'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
  'api_key=fake_key_abc123def456ghi789jkl012',
  'api-key: fake_key_abc123def456ghi789jkl012',
  'password=SuperSecret123!',
  'password: my_secret_pass',
  'token=abcdef1234567890abcdef1234567890',
  'secret=my_very_secret_value_123',
  'The SSN is 123-45-6789 and belongs to John',
  'Card: 4111111111111111 exp 12/25',
  'Number: 4222222222222',
  'Card: 6221260000000000001',
  'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnop',
  'AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE',
  'aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  'sk-proj-abc123def456ghi789jkl012mno345',
  'ghp_16C7e42F292c6912E7710c838347Ae178B4a',
  'xoxb-FAKE-TEST-TOKEN-not-a-real-slack-token',
  'Set-Cookie: session=abc123def456ghi789; HttpOnly',
  'contact qa.user@corp-internal.test now',
  '-----BEGIN PRIVATE KEY-----\nMIIBVwIBADANBgkqhkiG9w0BAQEFAASCAT8=\n-----END PRIVATE KEY-----',
];

const CLEAN_SAMPLES = [
  'Password field accepts 8 characters',
  'The secret sauce of exploratory testing',
  'the token is invalid after logout',
  'POST /api/login took 1743183294821 ns',
  'order 20260908123456',
  'contact support@example.com for help',
  'password=[REDACTED]',
  'Set-Cookie: [REDACTED]',
  'Authorization: Bearer [JWT_REDACTED]',
  'api_key=[REDACTED]',
];

const tmpDirs: string[] = [];
function makeTmpCwd(): string {
  const dir = mkdtempSync(join(tmpdir(), 'qualiow-hooks-'));
  tmpDirs.push(dir);
  return dir;
}
afterEach(() => {
  while (tmpDirs.length) rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});

function writeLines(path: string, n: number): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, Array.from({ length: n }, (_, i) => `line ${i + 1}`).join('\n') + '\n');
}

interface HookDecision {
  hookEventName: string;
  permissionDecision: string;
  permissionDecisionReason: string;
}

function runHook(
  script: string,
  payload: unknown,
  env: Record<string, string | undefined> = {},
): HookDecision | null {
  const base: Record<string, string | undefined> = { ...process.env };
  delete base.QUALIOW_HOOKS;
  delete base.QUALIOW_READ_MAX_LINES;
  delete base.CLAUDE_PROJECT_DIR;
  const stdout = execFileSync('node', [script], {
    input: typeof payload === 'string' ? payload : JSON.stringify(payload),
    env: { ...base, ...env },
    encoding: 'utf-8',
  });
  if (!stdout.trim()) return null;
  return (JSON.parse(stdout) as { hookSpecificOutput: HookDecision }).hookSpecificOutput;
}

function readPayload(cwd: string, file_path: string, extra: Record<string, unknown> = {}) {
  return {
    session_id: 'test',
    cwd,
    hook_event_name: 'PreToolUse',
    tool_name: 'Read',
    tool_input: { file_path, ...extra },
  };
}

function writePayload(cwd: string, tool_name: string, tool_input: Record<string, unknown>) {
  return { session_id: 'test', cwd, hook_event_name: 'PreToolUse', tool_name, tool_input };
}

describe('hooks/hooks.json', () => {
  const manifest = JSON.parse(readFileSync(HOOKS_JSON, 'utf-8')) as {
    hooks: { PreToolUse: { matcher: string; hooks: { type: string; command: string }[] }[] };
  };

  it('registers a Read|Grep|Glob guard, a Write|Edit|MultiEdit|NotebookEdit guard and a Bash guard', () => {
    const matchers = manifest.hooks.PreToolUse.map((e) => e.matcher);
    expect(matchers).toEqual(['Read|Grep|Glob', 'Write|Edit|MultiEdit|NotebookEdit', 'Bash']);
  });

  it('registers the same matchers as `qualiow init --hooks`', () => {
    expect(manifest.hooks.PreToolUse.map((e) => e.matcher)).toEqual(QUALIOW_HOOK_ENTRIES.map((e) => e.matcher));
  });

  it('every command points at a script that exists under hooks/scripts/', () => {
    for (const entry of manifest.hooks.PreToolUse) {
      for (const h of entry.hooks) {
        expect(h.type).toBe('command');
        const rel = h.command.replace(/^node\s+"?\$\{CLAUDE_PLUGIN_ROOT\}\//, '').replace(/"$/, '');
        expect(rel.startsWith('hooks/scripts/')).toBe(true);
        expect(existsSync(join(REPO_ROOT, rel))).toBe(true);
      }
    }
  });
});

describe('read-guard.mjs', () => {
  it('denies a whole-file Read of a large knowledge manifest and names the digest', () => {
    const cwd = makeTmpCwd();
    writeLines(join(cwd, 'data', 'knowledge', 'manifest.yml'), 400);
    const d = runHook(READ_GUARD, readPayload(cwd, 'data/knowledge/manifest.yml'));
    expect(d?.permissionDecision).toBe('deny');
    expect(d?.hookEventName).toBe('PreToolUse');
    expect(d?.permissionDecisionReason).toContain('400 lines');
    expect(d?.permissionDecisionReason).toContain('kb digest');
    expect(d?.permissionDecisionReason).not.toContain('QUALIOW_HOOKS');
  });

  it('allows the same Read when it carries offset or limit', () => {
    const cwd = makeTmpCwd();
    writeLines(join(cwd, 'data', 'knowledge', 'manifest.yml'), 400);
    expect(runHook(READ_GUARD, readPayload(cwd, 'data/knowledge/manifest.yml', { offset: 10, limit: 40 }))).toBeNull();
    expect(runHook(READ_GUARD, readPayload(cwd, 'data/knowledge/manifest.yml', { limit: 40 }))).toBeNull();
  });

  it('allows a large file outside the guarded paths', () => {
    const cwd = makeTmpCwd();
    writeLines(join(cwd, 'src', 'service.ts'), 400);
    expect(runHook(READ_GUARD, readPayload(cwd, 'src/service.ts'))).toBeNull();
  });

  it('allows a guarded file under the threshold', () => {
    const cwd = makeTmpCwd();
    writeLines(join(cwd, 'data', 'knowledge', 'releases', 'v0.1.0', 'entries', 'x.yml'), 10);
    expect(runHook(READ_GUARD, readPayload(cwd, 'data/knowledge/releases/v0.1.0/entries/x.yml'))).toBeNull();
  });

  it('honours QUALIOW_READ_MAX_LINES and QUALIOW_HOOKS=off', () => {
    const cwd = makeTmpCwd();
    const rel = 'data/knowledge/releases/v0.1.0/entries/x.yml';
    writeLines(join(cwd, rel), 10);
    expect(runHook(READ_GUARD, readPayload(cwd, rel), { QUALIOW_READ_MAX_LINES: '5' })?.permissionDecision).toBe('deny');
    expect(runHook(READ_GUARD, readPayload(cwd, rel), { QUALIOW_READ_MAX_LINES: '5', QUALIOW_HOOKS: 'off' })).toBeNull();
  });

  it('routes a raw snapshot to the page mapper and a phase file to offset/limit', () => {
    const cwd = makeTmpCwd();
    const snap = 'output/sessions/2026-09-08-1813-explore-x/snapshots/home.yml';
    const phase = 'output/sessions/2026-09-08-1813-explore-x/phase-3-discovery.md';
    writeLines(join(cwd, snap), 400);
    writeLines(join(cwd, phase), 400);
    expect(runHook(READ_GUARD, readPayload(cwd, snap))?.permissionDecisionReason).toContain('qa-page-mapper-agent');
    expect(runHook(READ_GUARD, readPayload(cwd, join(cwd, phase)))?.permissionDecisionReason).toContain('offset/limit');
  });

  it('ignores other tools, missing files and malformed input', () => {
    const cwd = makeTmpCwd();
    writeLines(join(cwd, 'data', 'knowledge', 'manifest.yml'), 400);
    expect(runHook(READ_GUARD, { ...readPayload(cwd, 'data/knowledge/manifest.yml'), tool_name: 'Grep' })).toBeNull();
    expect(runHook(READ_GUARD, readPayload(cwd, 'data/knowledge/releases/v9/entries/missing.yml'))).toBeNull();
    expect(runHook(READ_GUARD, '{not json')).toBeNull();
    expect(runHook(READ_GUARD, '')).toBeNull();
  });
});

describe('read-guard.mjs — qa-bug-judge sees only its claim card and evidence', () => {
  const S = 'output/sessions/2026-10-28-1200-explore-x';
  const PRIVATE = [
    `${S}/session-log.md`,
    `${S}/charter.md`,
    `${S}/progress.json`,
    `${S}/phase-3-discovery.md`,
    `${S}/phase-7-notes.md`,
    `${S}/bugs/BUG-001.md`,
    `${S}/bugs/refuted/BUG-002.md`,
    `${S}/verification/drafts/BUG-001.md`,
    `${S}/verification/VERDICT-002.md`,
    `${S}/verification/JEV-001.json`,
    `${S}/verification/LAYA-001.md`,
    // Everything else under output/ that is not the claim card or its evidence.
    `${S}/stats.json`,
    `${S}/session-report.md`,
    `${S}/evidence-level.md`,
    `${S}/backlog.md`,
    `${S}/snapshots/home.yml`,
    `${S}/verification/proposed-patterns.md`,
    'output/sessions/INDEX.md',
    'output/bugs/all-bugs.md',
    'output/context/TICKET-1-context.md',
    'output/report.html',
    '.auth/parabank.json',
    'qa/.env',
    'qa/.env.local',
    '.env',
  ];
  const READABLE = [
    `${S}/verification/claims/CLAIM-001.md`,
    `${S}/verification/CLAIM-001.md`,
    `${S}/screenshots/A1-cart.png`,
    `${S}/videos/session.webm`,
    `${S}/traces/trace.zip`,
    `${S}/logs/console.txt`,
    `${S}/evidence/network.txt`,
    // Outside output/: reference files stay readable, whatever their name.
    'data/templates/bug-report.md',
    'docs/charter.md',
  ];

  function seedSession(): string {
    const cwd = makeTmpCwd();
    for (const rel of [...PRIVATE, ...READABLE]) writeLines(join(cwd, rel), 3);
    return cwd;
  }

  const judge = (cwd: string, tool_name: string, tool_input: Record<string, unknown>, agent_type = 'qa-bug-judge') =>
    runHook(READ_GUARD, { session_id: 't', cwd, hook_event_name: 'PreToolUse', tool_name, tool_input, agent_type });

  it.each(['qa-bug-judge', 'qualiow:qa-bug-judge'])('denies %s a Read of the finder files and credentials', (agent) => {
    const cwd = seedSession();
    for (const rel of PRIVATE) {
      for (const input of [{ file_path: rel }, { file_path: join(cwd, rel) }, { file_path: rel, offset: 1, limit: 2 }]) {
        const d = judge(cwd, 'Read', input, agent);
        expect(d?.permissionDecision, rel).toBe('deny');
        expect(d?.permissionDecisionReason).toContain('claim card');
      }
    }
    expect(judge(cwd, 'Read', { file_path: `${S}/verification/claims/../drafts/BUG-001.md` }, agent)?.permissionDecision).toBe('deny');
  });

  it('resolves output/ against CLAUDE_PROJECT_DIR as well as the cwd', () => {
    const cwd = seedSession();
    mkdirSync(join(cwd, 'src'));
    const d = runHook(
      READ_GUARD,
      { cwd: join(cwd, 'src'), tool_name: 'Read', tool_input: { file_path: '../output/report.html' }, agent_type: 'qa-bug-judge' },
      { CLAUDE_PROJECT_DIR: cwd },
    );
    expect(d?.permissionDecision).toBe('deny');
  });

  it('lets the judge read its claim card, the evidence directories and files outside output/', () => {
    const cwd = seedSession();
    for (const rel of READABLE) expect(judge(cwd, 'Read', { file_path: rel }), rel).toBeNull();
  });

  it('denies a Read through a symlink that leads to a private file', () => {
    const cwd = seedSession();
    symlinkSync(join(cwd, S, 'session-log.md'), join(cwd, S, 'evidence', 'notes.txt'));
    expect(judge(cwd, 'Read', { file_path: `${S}/evidence/notes.txt` })?.permissionDecision).toBe('deny');
  });

  it.each([
    ['Grep', { pattern: 'expected' }],
    ['Grep', { pattern: 'x', path: S }],
    ['Grep', { pattern: 'x', path: 'output/sessions' }],
    ['Grep', { pattern: 'x', path: `${S}/bugs` }],
    ['Grep', { pattern: 'x', path: `${S}/session-log.md` }],
    ['Grep', { pattern: 'x', path: `${S}/screenshots/..` }],
    ['Grep', { pattern: 'x', path: '/' }],
    ['Grep', { pattern: 'x', path: 'qa' }],
    ['Glob', { pattern: '**/*.md' }],
    ['Glob', { pattern: '**/*.md', path: S }],
    ['Glob', { pattern: `${S}/*.md` }],
    ['Glob', { pattern: 'bugs/*', path: S }],
    ['Glob', { pattern: '../**/*.md', path: `${S}/logs` }],
    ['Glob', { pattern: '.auth/*' }],
    ['Grep', { pattern: 'x', path: `${S}/verification/claims` }],
    ['Grep', { pattern: 'x', path: `${S}/snapshots` }],
    ['Grep', { pattern: 'x', path: `${S}/stats.json` }],
    ['Glob', { pattern: 'output/**/*.md' }],
  ])('denies the judge a %s search that reaches the finder files: %j', (tool, input) => {
    const cwd = seedSession();
    const d = judge(cwd, tool, input);
    expect(d?.permissionDecision).toBe('deny');
    expect(d?.permissionDecisionReason).toContain('claim card');
  });

  it('denies an absolute Glob pattern into the session', () => {
    const cwd = seedSession();
    expect(judge(cwd, 'Glob', { pattern: join(cwd, S, 'bugs', '*.md') })?.permissionDecision).toBe('deny');
  });

  it.each([
    ['Grep', { pattern: 'TypeError', path: `${S}/logs` }],
    ['Grep', { pattern: 'TypeError', path: `${S}/logs/console.txt` }],
    ['Grep', { pattern: '500', path: `${S}/evidence` }],
    ['Grep', { pattern: 'Expected', path: `${S}/verification/claims/CLAIM-001.md` }],
    ['Glob', { pattern: '*.png', path: `${S}/screenshots` }],
    ['Glob', { pattern: `${S}/screenshots/*.png` }],
    ['Glob', { pattern: 'logs/*.txt', path: S }],
    ['Grep', { pattern: 'severity', path: 'data/templates' }],
    ['Glob', { pattern: 'data/templates/*.md' }],
  ])('lets the judge %s inside its evidence or outside output/: %j', (tool, input) => {
    const cwd = seedSession();
    expect(judge(cwd, tool, input)).toBeNull();
  });

  it('leaves other agents and the main session alone', () => {
    const cwd = seedSession();
    expect(judge(cwd, 'Read', { file_path: `${S}/session-log.md` }, 'qa-reporting-agent')).toBeNull();
    expect(judge(cwd, 'Grep', { pattern: 'x' }, 'qa-reporting-agent')).toBeNull();
    expect(runHook(READ_GUARD, { cwd, tool_name: 'Read', tool_input: { file_path: `${S}/bugs/BUG-001.md` } })).toBeNull();
    expect(runHook(READ_GUARD, { cwd, tool_name: 'Glob', tool_input: { pattern: '**/*.md' } })).toBeNull();
  });
});

describe('write-guard.mjs', () => {
  const token = 'ghp_16C7e42F292c6912E7710c838347Ae178B4a';
  const bugPath = 'output/sessions/2026-09-08-1813-explore-x/bugs/BUG-001.md';

  it('denies a Write under output/ that carries a secret, naming the category only', () => {
    const cwd = makeTmpCwd();
    const d = runHook(WRITE_GUARD, writePayload(cwd, 'Write', { file_path: bugPath, content: `Evidence: header ${token}` }));
    expect(d?.permissionDecision).toBe('deny');
    expect(d?.permissionDecisionReason).toContain('GitHub token');
    expect(d?.permissionDecisionReason).not.toContain(token);
    expect(d?.permissionDecisionReason).not.toContain('QUALIOW_HOOKS');
  });

  it('allows the same content under snapshots/, outside output/, when clean, or when disabled', () => {
    const cwd = makeTmpCwd();
    const content = `header ${token}`;
    expect(runHook(WRITE_GUARD, writePayload(cwd, 'Write', { file_path: 'output/sessions/x/snapshots/p.yml', content }))).toBeNull();
    expect(runHook(WRITE_GUARD, writePayload(cwd, 'Write', { file_path: 'src/notes.md', content }))).toBeNull();
    expect(runHook(WRITE_GUARD, writePayload(cwd, 'Write', { file_path: bugPath, content: 'Steps: open the cart' }))).toBeNull();
    expect(runHook(WRITE_GUARD, writePayload(cwd, 'Write', { file_path: bugPath, content }), { QUALIOW_HOOKS: 'off' })).toBeNull();
  });

  it('checks Edit.new_string and every MultiEdit edit', () => {
    const cwd = makeTmpCwd();
    const edit = runHook(WRITE_GUARD, writePayload(cwd, 'Edit', { file_path: bugPath, old_string: 'a', new_string: 'password=SuperSecret123!' }));
    expect(edit?.permissionDecision).toBe('deny');
    expect(edit?.permissionDecisionReason).toContain('Password');
    const multi = runHook(WRITE_GUARD, writePayload(cwd, 'MultiEdit', {
      file_path: bugPath,
      edits: [{ old_string: 'a', new_string: 'clean' }, { old_string: 'b', new_string: 'SSN 123-45-6789' }],
    }));
    expect(multi?.permissionDecision).toBe('deny');
    expect(multi?.permissionDecisionReason).toContain('SSN');
  });

  it('lets an already-redacted value through', () => {
    const cwd = makeTmpCwd();
    const content = 'Authorization: [REDACTED]\npassword=[REDACTED]\nSet-Cookie: [REDACTED]';
    expect(runHook(WRITE_GUARD, writePayload(cwd, 'Write', { file_path: bugPath, content }))).toBeNull();
  });
});

describe('secret-patterns.mjs parity with src/utils/redact.ts', () => {
  it.each(SECRET_SAMPLES)('flags %s the same way', (sample) => {
    expect(findSecretCategories(sample).length > 0).toBe(containsSecrets(sample));
    expect(findSecretCategories(sample).length).toBeGreaterThan(0);
  });

  it.each(CLEAN_SAMPLES)('leaves %s alone the same way', (sample) => {
    expect(findSecretCategories(sample).length > 0).toBe(containsSecrets(sample));
    expect(findSecretCategories(sample)).toEqual([]);
  });
});
