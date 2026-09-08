/**
 * .gitignore merge for `qualiow init`.
 *
 * Adds the Qualiow ignore block by exact-line comparison (so an unrelated
 * substring like `.env.example` never suppresses `.env`), writes the section
 * header at most once, and is idempotent: a second run adds nothing.
 */

export const QUALIOW_GITIGNORE_HEADER = '# Qualiow';

export const QUALIOW_GITIGNORE_ENTRIES = [
  '.auth/',
  '.env',
  'qa/.env',
  'output/sessions/*/',
  '!output/sessions/INDEX.md',
  'output/context/*.md',
  'data/targets/local-*.yml',
  '.playwright-cli/',
  '*.trace.zip',
  '*.webm',
] as const;

/**
 * Returns the new .gitignore content, or null when nothing needs adding.
 * Compares against existing lines exactly (trimmed of trailing whitespace).
 */
export function mergeGitignore(existing: string): string | null {
  const existingLines = new Set(
    existing.split('\n').map((l) => l.replace(/\s+$/, '')),
  );
  const missing = QUALIOW_GITIGNORE_ENTRIES.filter(
    (e) => !existingLines.has(e),
  );
  if (missing.length === 0) return null;

  const block: string[] = [];
  if (!existingLines.has(QUALIOW_GITIGNORE_HEADER)) {
    block.push(QUALIOW_GITIGNORE_HEADER);
  }
  block.push(...missing);

  const prefix =
    existing.length === 0 || existing.endsWith('\n') ? '' : '\n';
  const leadingBlank = existing.length > 0 ? '\n' : '';
  return existing + prefix + leadingBlank + block.join('\n') + '\n';
}
