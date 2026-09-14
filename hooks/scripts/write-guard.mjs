#!/usr/bin/env node
/**
 * PreToolUse hook (matcher: Write|Edit|MultiEdit).
 *
 * Denies writing a secret-shaped string into anything under `output/`
 * (excluding `output/**\/snapshots/`, which never ships a report and is
 * excluded from the secrets scan the same way `qualiow session finalize`
 * excludes it). Mechanises security rule 3 (redact before disk) instead of
 * relying on the model remembering it.
 *
 * Node built-ins only, plus the sibling `secret-patterns.mjs` — a
 * git-sourced plugin install has neither `dist/` nor `node_modules`. Never
 * throws and never echoes the matched text back: the denial reason names
 * categories only.
 */
import { readFileSync } from 'node:fs';
import { findSecretCategories } from './secret-patterns.mjs';

const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit']);

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

function collectText(toolName, toolInput) {
  if (!toolInput) return '';
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
  return '';
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
  const filePath = toolInput.file_path;
  if (!filePath || typeof filePath !== 'string') process.exit(0);

  const normalized = filePath.split('\\').join('/');
  if (!/(^|\/)output\//.test(normalized)) process.exit(0);
  if (normalized.includes('/snapshots/')) process.exit(0);

  const text = collectText(input.tool_name, toolInput);
  if (!text) process.exit(0);

  const categories = findSecretCategories(text);
  if (categories.length > 0) {
    deny(
      `Refusing to write ${filePath}: it contains ${categories.join(', ')}. ` +
        'Redact per security-rules.md ([REDACTED]) before writing; ' +
        'qualiow session finalize --redact rewrites an existing file. ' +
        'Set QUALIOW_HOOKS=off to disable.',
    );
  }
  process.exit(0);
} catch {
  process.exit(0);
}
