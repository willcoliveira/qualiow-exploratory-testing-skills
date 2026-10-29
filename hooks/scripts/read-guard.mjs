#!/usr/bin/env node
/**
 * PreToolUse hook (matcher: Read|Grep|Glob).
 *
 * Denies a whole-file Read of a qualiow data/session file once it crosses a
 * line threshold, and names the cheaper route instead (`qualiow kb digest`,
 * `qualiow list knowledge --entry`, offset/limit + Grep, or the
 * qa-page-mapper-agent) — see delegation-rules.md. A Read that already
 * carries `offset`/`limit` is always allowed: the caller is already reading
 * a slice.
 *
 * Inside the `qa-bug-judge` sub-agent (hook input `agent_type`, plain or
 * `<plugin>:qa-bug-judge`) it also keeps the finder's own material away from
 * the judge, whatever the slice. Under the project's `output/` (the cwd's or
 * `CLAUDE_PROJECT_DIR`'s) the judge may Read only a claim card —
 * `output/sessions/<dir>/verification/claims/CLAIM-*.md`, or the older
 * `verification/CLAIM-*.md` — and files under that session's `screenshots/`,
 * `videos/`, `traces/`, `logs/` and `evidence/`, and may Grep or Glob only
 * inside those evidence directories. Everything else there is denied: session
 * log, charter, phase files, bugs, drafts, verdicts, stats, the report,
 * snapshots, `INDEX.md`, `output/context/`, … So are `.auth/**` and `.env*`
 * anywhere, and a search whose starting point contains `output/`, `.auth/`
 * or a `.env` file. Reading outside `output/` stays allowed.
 *
 * Node built-ins only — a git-sourced plugin install has neither `dist/` nor
 * `node_modules`. Never throws and never blocks on its own failure: any
 * error here allows the read through (exit 0, no stdout) rather than
 * breaking the caller because of a hook bug.
 */
import { readFileSync, existsSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';

// Lower-cased with forward slashes, matched anywhere on the resolved path.
const CREDENTIAL = [/\/\.auth(\/|$)/, /\/\.env[^/]*$/];
// Lower-cased, relative to output/.
const OUTPUT_READABLE = /^sessions\/[^/]+\/(verification\/(claims\/)?claim-[^/]*\.md|(screenshots|videos|traces|logs|evidence)\/.+)$/;
const OUTPUT_SEARCHABLE = /^sessions\/[^/]+\/(screenshots|videos|traces|logs|evidence)(\/.*)?$/;
const GLOB_CHARS = /[*?[\]{}]/;

const JUDGE_FILE_REASON =
  'is the finder’s own session material or a credential file. qa-bug-judge reads only its claim card and ' +
  'the evidence the claim card lists (screenshots/, videos/, traces/, logs/, evidence/).';
const JUDGE_SEARCH_REASON =
  'qa-bug-judge does not search the session or the project: read only the files its claim card lists, or ' +
  'search inside one of the evidence directories the claim card names (screenshots/, videos/, traces/, logs/, evidence/).';

/** The path as given and through symlinks, lower-cased with forward slashes and no trailing slash. */
function spellings(abs) {
  const out = [abs];
  try {
    out.push(realpathSync(abs));
  } catch {
    // not on disk: the lexical path is all there is
  }
  return out.map((p) => p.split('\\').join('/').toLowerCase().replace(/\/+$/, ''));
}

/** The project roots — the cwd and CLAUDE_PROJECT_DIR — in every spelling. */
function projectRoots(cwd) {
  const roots = [cwd];
  if (process.env.CLAUDE_PROJECT_DIR) roots.push(resolve(process.env.CLAUDE_PROJECT_DIR));
  return [...new Set(roots.flatMap(spellings))];
}

/** The part of `p` below a project's output/ ('' for output/ itself), or null when it is not under one. */
function belowOutput(p, roots) {
  for (const r of roots) {
    const out = `${r}/output`;
    if (p === out) return '';
    if (p.startsWith(`${out}/`)) return p.slice(out.length + 1);
  }
  // Another project's session directory holds a finder's notes just the same.
  const m = /\/output\/((sessions|bugs|context)(\/.*)?)$/.exec(p);
  return m ? m[1] : null;
}

/** True when a search starting at `p` would take in a project's output/. */
const containsOutput = (p, roots) => roots.some((r) => `${r}/output` === p || `${r}/output`.startsWith(`${p}/`));

const isCredential = (p) => CREDENTIAL.some((re) => re.test(p));

/** The directory (or file) a Glob pattern starts from: its leading segments without glob characters. */
function globRoot(base, pattern) {
  const parts = pattern.split('/');
  const literal = [];
  for (const part of parts) {
    if (GLOB_CHARS.test(part)) break;
    literal.push(part);
  }
  const prefix = literal.join('/') || (isAbsolute(pattern) ? '/' : '.');
  return isAbsolute(pattern) ? resolve(prefix) : resolve(base, prefix);
}

/** A deny reason for a qa-bug-judge Read/Grep/Glob, or null. */
function judgeDecision(toolName, toolInput, cwd) {
  const roots = projectRoots(cwd);
  if (toolName === 'Read') {
    if (typeof toolInput.file_path !== 'string' || !toolInput.file_path) return null;
    const readable = spellings(resolve(cwd, toolInput.file_path)).every((p) => {
      if (isCredential(p)) return false;
      const below = belowOutput(p, roots);
      return below === null || OUTPUT_READABLE.test(below);
    });
    return readable ? null : `${toolInput.file_path} ${JUDGE_FILE_REASON}`;
  }
  const base = resolve(cwd, typeof toolInput.path === 'string' && toolInput.path ? toolInput.path : '.');
  const root =
    toolName === 'Glob' && typeof toolInput.pattern === 'string' ? globRoot(base, toolInput.pattern) : base;
  let isFile = false;
  try {
    isFile = statSync(root).isFile();
  } catch {
    // a path that does not exist is judged as a directory
  }
  if (!isFile) {
    try {
      const names = readdirSync(root).map((n) => n.toLowerCase());
      if (names.some((n) => n === '.auth' || n.startsWith('.env'))) return JUDGE_SEARCH_REASON;
    } catch {
      // unreadable or missing: judged on the path alone
    }
  }
  const searchable = spellings(root).every((p) => {
    if (isCredential(p)) return false;
    const below = belowOutput(p, roots);
    if (below === null) return !containsOutput(p, roots);
    return isFile ? OUTPUT_READABLE.test(below) : OUTPUT_SEARCHABLE.test(below);
  });
  return searchable ? null : JUDGE_SEARCH_REASON;
}

const GUARDED = [
  {
    re: /(^|\/)data\/knowledge\/(manifest\.ya?ml|releases\/)/,
    route:
      'knowledge manifest or release entry \u2192 `qualiow kb digest --for <explore|backend|mobile>` or `qualiow list knowledge --entry <id>`',
  },
  {
    re: /(^|\/)output\/sessions\/[^/]+\/phase-\d[^/]*\.md/,
    route: "phase file \u2192 Read with offset/limit after Grep '^## '",
  },
  {
    re: /(^|\/)output\/sessions\/[^/]+\/snapshots\//,
    route: 'raw snapshot \u2192 qa-page-mapper-agent',
  },
];

function deny(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    }),
  );
}

/** Number of \n plus one if the last line has no trailing newline. */
function countLines(text) {
  if (text.length === 0) return 0;
  const newlines = (text.match(/\n/g) || []).length;
  return text.endsWith('\n') ? newlines : newlines + 1;
}

try {
  if (process.env.QUALIOW_HOOKS === 'off') process.exit(0);

  let raw = '';
  try {
    raw = readFileSync(0, 'utf-8');
  } catch {
    process.exit(0);
  }
  if (!raw || !raw.trim()) process.exit(0);

  const input = JSON.parse(raw);
  if (input.tool_name !== 'Read' && input.tool_name !== 'Grep' && input.tool_name !== 'Glob') process.exit(0);

  const toolInput = input.tool_input || {};
  // Before the offset/limit exit: a slice of a private file is still the file.
  const agent = typeof input.agent_type === 'string' ? input.agent_type : '';
  if (agent === 'qa-bug-judge' || agent.endsWith(':qa-bug-judge')) {
    const cwd = typeof input.cwd === 'string' && input.cwd ? input.cwd : process.cwd();
    const reason = judgeDecision(input.tool_name, toolInput, cwd);
    if (reason) {
      deny(reason);
      process.exit(0);
    }
  }

  if (input.tool_name !== 'Read') process.exit(0);
  if (toolInput.offset != null || toolInput.limit != null) process.exit(0);

  const filePath = toolInput.file_path;
  if (!filePath || typeof filePath !== 'string') process.exit(0);

  const normalized = filePath.split('\\').join('/');
  const matched = GUARDED.find((g) => g.re.test(normalized));
  if (!matched) process.exit(0);

  const abs = isAbsolute(filePath) ? filePath : resolve(input.cwd || process.cwd(), filePath);
  if (!existsSync(abs)) process.exit(0);

  const content = readFileSync(abs, 'utf-8');
  const lineCount = countLines(content);
  const threshold = Number(process.env.QUALIOW_READ_MAX_LINES) || 300;

  if (lineCount > threshold) {
    deny(`${filePath} is ${lineCount} lines (limit ${threshold}). Route: ${matched.route}.`);
  }
  process.exit(0);
} catch {
  process.exit(0);
}
