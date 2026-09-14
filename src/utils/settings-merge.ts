/**
 * Merge helper for `qualiow init --hooks`.
 *
 * Adds the qualiow PreToolUse hook entries and permission allow rules to a
 * parsed `.claude/settings.json` object, preserving every existing key and
 * entry. Idempotent by exact string: a hook whose `command` is already
 * registered anywhere under `hooks.PreToolUse`, or an allow rule already
 * present, is left alone rather than duplicated — so running `--hooks`
 * twice yields a byte-identical file.
 */

export interface QualiowHookEntry {
  matcher: string;
  command: string;
}

export const QUALIOW_HOOK_ENTRIES: QualiowHookEntry[] = [
  { matcher: 'Read', command: 'node "$CLAUDE_PROJECT_DIR/qa/hooks/read-guard.mjs"' },
  {
    matcher: 'Write|Edit|MultiEdit',
    command: 'node "$CLAUDE_PROJECT_DIR/qa/hooks/write-guard.mjs"',
  },
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
