#!/usr/bin/env node
/**
 * PreToolUse hook (matcher: Read).
 *
 * Denies a whole-file Read of a qualiow data/session file once it crosses a
 * line threshold, and names the cheaper route instead (`qualiow kb digest`,
 * `qualiow list knowledge --entry`, offset/limit + Grep, or the
 * qa-page-mapper-agent) — see delegation-rules.md. A Read that already
 * carries `offset`/`limit` is always allowed: the caller is already reading
 * a slice.
 *
 * Node built-ins only — a git-sourced plugin install has neither `dist/` nor
 * `node_modules`. Never throws and never blocks on its own failure: any
 * error here allows the read through (exit 0, no stdout) rather than
 * breaking the caller because of a hook bug.
 */
import { readFileSync, existsSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';

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
  if (input.tool_name !== 'Read') process.exit(0);

  const toolInput = input.tool_input || {};
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
    deny(
      `${filePath} is ${lineCount} lines (limit ${threshold}). Route: ${matched.route}. ` +
        'Set QUALIOW_HOOKS=off to disable.',
    );
  }
  process.exit(0);
} catch {
  process.exit(0);
}
