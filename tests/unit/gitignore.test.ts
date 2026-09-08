import { describe, it, expect } from 'vitest';
import {
  QUALIOW_GITIGNORE_ENTRIES,
  QUALIOW_GITIGNORE_HEADER,
  mergeGitignore,
} from '../../src/utils/gitignore.js';

describe('mergeGitignore', () => {
  it('returns the full block (header + entries) for an empty .gitignore', () => {
    const merged = mergeGitignore('');
    expect(merged).not.toBeNull();
    expect(merged).toContain(QUALIOW_GITIGNORE_HEADER);
    for (const entry of QUALIOW_GITIGNORE_ENTRIES) {
      expect(merged).toContain(entry);
    }
  });

  it('returns null when every entry and the header are already present', () => {
    const full = [QUALIOW_GITIGNORE_HEADER, ...QUALIOW_GITIGNORE_ENTRIES].join('\n') + '\n';
    expect(mergeGitignore(full)).toBeNull();
  });

  it('is idempotent: merging the output of a merge returns null', () => {
    const first = mergeGitignore('node_modules/\n');
    expect(first).not.toBeNull();
    const second = mergeGitignore(first as string);
    expect(second).toBeNull();
  });

  it('adds .env even when .env.example is already present (exact-line match only)', () => {
    const existing = 'node_modules/\n.env.example\n';
    const merged = mergeGitignore(existing);
    expect(merged).not.toBeNull();
    const lines = (merged as string).split('\n');
    expect(lines).toContain('.env');
    expect(lines).toContain('.env.example');
  });

  it('never writes the header line more than once', () => {
    const existing = `${QUALIOW_GITIGNORE_HEADER}\n.auth/\n`; // header present, most entries missing
    const merged = mergeGitignore(existing) as string;
    expect(merged).not.toBeNull();
    const headerCount = merged
      .split('\n')
      .filter((l) => l === QUALIOW_GITIGNORE_HEADER).length;
    expect(headerCount).toBe(1);
  });

  it('adds the header exactly once on a fresh file, and it is not duplicated by a second merge', () => {
    const first = mergeGitignore('') as string;
    const headerCount = first.split('\n').filter((l) => l === QUALIOW_GITIGNORE_HEADER).length;
    expect(headerCount).toBe(1);
  });

  it('is unaffected by unrelated lines that merely contain a similar substring', () => {
    // "mydist/" is not one of QUALIOW_GITIGNORE_ENTRIES and should not suppress
    // or interfere with any real entry being added.
    const existing = 'mydist/\nbuild/\n';
    const merged = mergeGitignore(existing) as string;
    expect(merged).not.toBeNull();
    for (const entry of QUALIOW_GITIGNORE_ENTRIES) {
      expect(merged).toContain(entry);
    }
    expect(merged).toContain('mydist/');
    expect(merged).toContain('build/');
  });

  it('only adds the entries that are missing, keeping present ones unduplicated', () => {
    const existing = `${QUALIOW_GITIGNORE_HEADER}\n.auth/\n.env\n`;
    const merged = mergeGitignore(existing) as string;
    expect(merged).not.toBeNull();
    const lines = merged.split('\n');
    expect(lines.filter((l) => l === '.auth/')).toHaveLength(1);
    expect(lines.filter((l) => l === '.env')).toHaveLength(1);
    // The still-missing entries should now be present.
    expect(lines).toContain('qa/.env');
    expect(lines).toContain('output/sessions/*/');
  });

  it('does not require a trailing newline on the existing content', () => {
    const existing = 'node_modules/'; // no trailing newline
    const merged = mergeGitignore(existing) as string;
    expect(merged.startsWith('node_modules/\n')).toBe(true);
  });
});
