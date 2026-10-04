#!/usr/bin/env node
/**
 * PreToolUse hook (matcher: Write|Edit|MultiEdit|NotebookEdit).
 *
 * Denies writing a secret-shaped string into anything under `output/`
 * (excluding `output/**\/snapshots/`, which never ships a report and is
 * excluded from the secrets scan the same way `qualiow session finalize`
 * excludes it). Mechanises security rule 3 (redact before disk) instead of
 * relying on the model remembering it.
 *
 * The path is resolved against the hook's `cwd` first, so `snapshots/../bugs/`
 * cannot borrow the snapshots exemption, and `output/` matches in any case
 * (macOS file systems are case-insensitive). An Edit or MultiEdit is judged on
 * the file as it would read afterwards, so a secret assembled across the edit
 * boundary is caught; edits that only remove or keep secrets already there
 * pass, so a file can be cleaned up one value at a time.
 *
 * Node built-ins only, plus the sibling `secret-patterns.mjs` — a
 * git-sourced plugin install has neither `dist/` nor `node_modules`. Never
 * throws and never echoes the matched text back: the denial reason names
 * categories only.
 */
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { countSecrets, findSecretCategories } from './secret-patterns.mjs';

const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);
// Larger files are judged on the inserted text alone.
const MAX_POST_EDIT_BYTES = 5 * 1024 * 1024;

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

/** The text the tool inserts, on its own. */
function insertedText(toolName, toolInput) {
  if (toolName === 'Write') {
    return typeof toolInput.content === 'string' ? toolInput.content : '';
  }
  if (toolName === 'Edit') {
    return typeof toolInput.new_string === 'string' ? toolInput.new_string : '';
  }
  if (toolName === 'MultiEdit') {
    const edits = Array.isArray(toolInput.edits) ? toolInput.edits : [];
    return edits
      .map((e) => (e && typeof e.new_string === 'string' ? e.new_string : ''))
      .join('\n');
  }
  if (toolName === 'NotebookEdit') {
    return typeof toolInput.new_source === 'string' ? toolInput.new_source : '';
  }
  return '';
}

function applyEdit(content, edit) {
  if (!edit || typeof edit.old_string !== 'string' || typeof edit.new_string !== 'string') {
    return null;
  }
  if (!edit.old_string || !content.includes(edit.old_string)) return null;
  return edit.replace_all
    ? content.split(edit.old_string).join(edit.new_string)
    : content.replace(edit.old_string, () => edit.new_string);
}

/** [before, after] for an Edit/MultiEdit, or null when the file can't be read or an edit won't apply. */
function postEditContent(toolName, toolInput, absPath) {
  if (toolName !== 'Edit' && toolName !== 'MultiEdit') return null;
  let before;
  try {
    if (statSync(absPath).size > MAX_POST_EDIT_BYTES) return null;
    before = readFileSync(absPath, 'utf-8');
  } catch {
    return null;
  }
  const edits = toolName === 'Edit' ? [toolInput] : Array.isArray(toolInput.edits) ? toolInput.edits : [];
  let after = before;
  for (const edit of edits) {
    after = applyEdit(after, edit);
    if (after === null) return null;
  }
  return [before, after];
}

/** Categories whose match count the edit raises. */
function introducedCategories(before, after) {
  const was = countSecrets(before);
  const out = [];
  for (const [category, n] of countSecrets(after)) {
    if (n > (was.get(category) || 0)) out.push(category);
  }
  return out;
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
  if (!WRITE_TOOLS.has(input.tool_name)) process.exit(0);

  const toolInput = input.tool_input || {};
  const filePath = input.tool_name === 'NotebookEdit' ? toolInput.notebook_path : toolInput.file_path;
  if (!filePath || typeof filePath !== 'string') process.exit(0);

  const cwd = typeof input.cwd === 'string' && input.cwd ? input.cwd : process.cwd();
  const absPath = resolve(cwd, filePath);
  const normalized = absPath.split('\\').join('/');
  const outputAt = normalized.search(/(^|\/)output\//i);
  if (outputAt === -1) process.exit(0);
  if (normalized.slice(outputAt).includes('/snapshots/')) process.exit(0);

  const found = new Set(findSecretCategories(insertedText(input.tool_name, toolInput)));
  const edited = postEditContent(input.tool_name, toolInput, absPath);
  if (edited) introducedCategories(edited[0], edited[1]).forEach((c) => found.add(c));

  if (found.size > 0) {
    deny(
      `Refusing to write ${filePath}: it contains ${[...found].join(', ')}. ` +
        'Redact per security-rules.md ([REDACTED]) before writing; ' +
        'qualiow session finalize --redact rewrites an existing file. ' +
        'Set QUALIOW_HOOKS=off to disable.',
    );
  }
  process.exit(0);
} catch {
  process.exit(0);
}
