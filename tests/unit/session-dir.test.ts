import { describe, it, expect } from 'vitest';
import {
  SESSION_KINDS,
  SESSION_DIR_RE,
  slugify,
  sessionTimestamp,
  sessionDirName,
  parseSessionDirName,
} from '../../src/utils/session-dir.js';

describe('SESSION_KINDS', () => {
  it('lists the four known session kinds', () => {
    expect(SESSION_KINDS).toEqual(['explore', 'quick', 'mobile', 'backend']);
  });
});

describe('SESSION_DIR_RE', () => {
  it('matches a canonical session directory name', () => {
    expect(SESSION_DIR_RE.test('2026-09-08-1813-explore-example')).toBe(true);
  });

  it('matches every declared kind', () => {
    for (const kind of SESSION_KINDS) {
      expect(SESSION_DIR_RE.test(`2026-01-01-0000-${kind}-x`)).toBe(true);
    }
  });

  it('rejects an unknown kind', () => {
    expect(SESSION_DIR_RE.test('2026-09-08-1813-bogus-example')).toBe(false);
  });

  it('rejects a legacy directory name without a kind', () => {
    expect(SESSION_DIR_RE.test('20260101-0900-old')).toBe(false);
  });

  it('rejects a slug starting with a dash or uppercase', () => {
    expect(SESSION_DIR_RE.test('2026-09-08-1813-explore--example')).toBe(false);
    expect(SESSION_DIR_RE.test('2026-09-08-1813-explore-Example')).toBe(false);
  });
});

describe('slugify', () => {
  it('lowercases and dashes arbitrary text', () => {
    expect(slugify('Hello World!')).toBe('hello-world');
  });

  it('reduces a full URL to its hostname', () => {
    expect(slugify('https://www.example.com/path?query=1')).toBe('www-example-com');
  });

  it('reduces a URL without a scheme by treating it as plain text', () => {
    expect(slugify('example.com/path')).toBe('example-com-path');
  });

  it('strips a leading underscore (for _example-* target ids)', () => {
    expect(slugify('_example-target')).toBe('example-target');
  });

  it('collapses runs of non-alphanumerics into single dashes', () => {
    expect(slugify('Foo___Bar   Baz')).toBe('foo-bar-baz');
  });

  it('trims leading and trailing dashes', () => {
    expect(slugify('--leading-and-trailing--')).toBe('leading-and-trailing');
  });

  it('caps the result at 40 characters', () => {
    const long = 'a'.repeat(60);
    const result = slugify(long);
    expect(result.length).toBeLessThanOrEqual(40);
  });

  it('falls back to "session" for empty or all-punctuation input', () => {
    expect(slugify('')).toBe('session');
    expect(slugify('   ')).toBe('session');
    expect(slugify('!!!')).toBe('session');
  });

  it('handles null/undefined input without throwing', () => {
    // @ts-expect-error deliberately passing an invalid type at the boundary
    expect(slugify(undefined)).toBe('session');
  });
});

describe('sessionTimestamp', () => {
  it('formats a date as YYYY-MM-DD-HHmm in local time', () => {
    const d = new Date(2026, 8, 8, 18, 13); // month is 0-indexed: September
    expect(sessionTimestamp(d)).toBe('2026-09-08-1813');
  });

  it('zero-pads single-digit month, day, hour and minute', () => {
    const d = new Date(2026, 0, 5, 3, 7);
    expect(sessionTimestamp(d)).toBe('2026-01-05-0307');
  });
});

describe('sessionDirName', () => {
  it('combines timestamp, kind and slugified target', () => {
    const d = new Date(2026, 8, 8, 18, 13);
    expect(sessionDirName('explore', 'https://parabank.example.com/', d)).toBe(
      '2026-09-08-1813-explore-parabank-example-com',
    );
  });

  it('produces a name that matches SESSION_DIR_RE', () => {
    const name = sessionDirName('quick', 'My Target!');
    expect(SESSION_DIR_RE.test(name)).toBe(true);
  });
});

describe('parseSessionDirName', () => {
  it('parses a canonical directory name back into its parts', () => {
    expect(parseSessionDirName('2026-09-08-1813-explore-example')).toEqual({
      timestamp: '2026-09-08-1813',
      kind: 'explore',
      slug: 'example',
    });
  });

  it('parses a slug that itself contains dashes', () => {
    expect(parseSessionDirName('2026-09-08-1813-backend-my-service-dev')).toEqual({
      timestamp: '2026-09-08-1813',
      kind: 'backend',
      slug: 'my-service-dev',
    });
  });

  it('returns null for a non-matching name', () => {
    expect(parseSessionDirName('not-a-session-dir')).toBeNull();
    expect(parseSessionDirName('20260101-0900-old')).toBeNull();
  });
});
