/**
 * Merge helper for `qualiow init --hooks`.
 *
 * Adds the qualiow PreToolUse hook entries and permission allow rules to a
 * parsed `.claude/settings.json` object, preserving every existing key and
 * entry. Idempotent by exact string: a hook whose `command` is already
 * registered anywhere under `hooks.PreToolUse`, or an allow rule already
 * present, is left alone rather than duplicated — so running `--hooks`
 * twice yields a byte-identical file. The one edit made to an existing entry
 * is the upgrade path: a qualiow hook registered by an earlier version under a
 * narrower matcher has that matcher rewritten to the current one.
 */

export interface QualiowHookEntry {
  matcher: string;
  command: string;
}

export const QUALIOW_HOOK_ENTRIES: QualiowHookEntry[] = [
  { matcher: 'Read', command: 'node "$CLAUDE_PROJECT_DIR/qa/hooks/read-guard.mjs"' },
  {
    matcher: 'Write|Edit|MultiEdit|NotebookEdit',
    command: 'node "$CLAUDE_PROJECT_DIR/qa/hooks/write-guard.mjs"',
  },
  { matcher: 'Bash', command: 'node "$CLAUDE_PROJECT_DIR/qa/hooks/bash-guard.mjs"' },
];

export const QUALIOW_PERMISSION_ALLOW: string[] = [
  'Bash(playwright-cli:*)',
  'Bash(npx playwright-cli:*)',
  'Bash(qualiow:*)',
];

type JsonRecord = Record<string, unknown>;

function isRecord(v: unknown): v is JsonRecord {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Every `command` already registered anywhere under hooks.PreToolUse. */
function existingHookCommands(settings: JsonRecord): Set<string> {
  const commands = new Set<string>();
  const hooks = settings.hooks;
  if (!isRecord(hooks)) return commands;
  const preToolUse = hooks.PreToolUse;
  if (!Array.isArray(preToolUse)) return commands;
  for (const entry of preToolUse) {
    if (!isRecord(entry) || !Array.isArray(entry.hooks)) continue;
    for (const h of entry.hooks) {
      if (isRecord(h) && typeof h.command === 'string') commands.add(h.command);
    }
  }
  return commands;
}

/**
 * Merges the qualiow hook entries and permission allow rules into a parsed
 * settings.json object (or `undefined`/anything non-object, treated as
 * empty). Returns the merged object and whether anything changed.
 */
export function mergeQualiowHookSettings(existing: unknown): {
  settings: JsonRecord;
  changed: boolean;
} {
  const settings: JsonRecord = isRecord(existing) ? { ...existing } : {};
  let changed = false;

  const hooksSection: JsonRecord = isRecord(settings.hooks)
    ? { ...(settings.hooks as JsonRecord) }
    : {};
  const preToolUse: unknown[] = Array.isArray(hooksSection.PreToolUse)
    ? [...(hooksSection.PreToolUse as unknown[])]
    : [];
  const haveCommands = existingHookCommands(settings);

  // Upgrade: an entry holding only a qualiow hook keeps its place but takes the
  // current matcher. An entry the user built — other hooks beside ours — is left
  // exactly as it is.
  for (let i = 0; i < preToolUse.length; i++) {
    const entry = preToolUse[i];
    if (!isRecord(entry) || !Array.isArray(entry.hooks) || entry.hooks.length !== 1) continue;
    const only = entry.hooks[0];
    if (!isRecord(only) || typeof only.command !== 'string') continue;
    const ours = QUALIOW_HOOK_ENTRIES.find((e) => e.command === only.command);
    if (!ours || entry.matcher === ours.matcher) continue;
    preToolUse[i] = { ...entry, matcher: ours.matcher };
    changed = true;
  }

  for (const { matcher, command } of QUALIOW_HOOK_ENTRIES) {
    if (haveCommands.has(command)) continue;
    preToolUse.push({ matcher, hooks: [{ type: 'command', command }] });
    haveCommands.add(command);
    changed = true;
  }
  hooksSection.PreToolUse = preToolUse;
  settings.hooks = hooksSection;

  const permissions: JsonRecord = isRecord(settings.permissions)
    ? { ...(settings.permissions as JsonRecord) }
    : {};
  const allow: unknown[] = Array.isArray(permissions.allow)
    ? [...(permissions.allow as unknown[])]
    : [];
  const allowSet = new Set(allow.filter((a): a is string => typeof a === 'string'));
  for (const rule of QUALIOW_PERMISSION_ALLOW) {
    if (allowSet.has(rule)) continue;
    allow.push(rule);
    allowSet.add(rule);
    changed = true;
  }
  permissions.allow = allow;
  settings.permissions = permissions;

  return { settings, changed };
}
