import { describe, it, expect } from 'vitest';
import {
  CONFIDENTIALITY_LINES,
  CONFIDENTIALITY_HEADER_MD,
  CONFIDENTIALITY_NOTICE,
  hasConfidentialityHeader,
} from '../../src/utils/confidentiality.js';

describe('CONFIDENTIALITY_LINES', () => {
  it('is exactly the two canonical lines', () => {
    expect(CONFIDENTIALITY_LINES).toEqual([
      'CONFIDENTIAL: This report may contain internal URLs, security vulnerabilities,',
      'and application details. Do not share outside your organization without review.',
    ]);
  });
});

describe('CONFIDENTIALITY_HEADER_MD', () => {
  it('is a two-line blockquote', () => {
    const lines = CONFIDENTIALITY_HEADER_MD.split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe(
      '> CONFIDENTIAL: This report may contain internal URLs, security vulnerabilities,',
    );
    expect(lines[1]).toBe(
      '> and application details. Do not share outside your organization without review.',
    );
  });
});

describe('CONFIDENTIALITY_NOTICE', () => {
  it('is the two lines joined by a single space, with no blockquote markers', () => {
    expect(CONFIDENTIALITY_NOTICE).toBe(
      'CONFIDENTIAL: This report may contain internal URLs, security vulnerabilities, ' +
        'and application details. Do not share outside your organization without review.',
    );
    expect(CONFIDENTIALITY_NOTICE).not.toContain('>');
    expect(CONFIDENTIALITY_NOTICE).not.toContain('\n');
  });
});

describe('hasConfidentialityHeader', () => {
  it('detects the blockquote form at the top of a markdown file', () => {
    const text = `${CONFIDENTIALITY_HEADER_MD}\n\n# A Report\n`;
    expect(hasConfidentialityHeader(text)).toBe(true);
  });

  it('detects the header after leading blank lines', () => {
    const text = `\n\n${CONFIDENTIALITY_HEADER_MD}\n\n# A Report\n`;
    expect(hasConfidentialityHeader(text)).toBe(true);
  });

  it('detects the notice in plain (non-blockquote) form', () => {
    expect(hasConfidentialityHeader(CONFIDENTIALITY_NOTICE)).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(
      hasConfidentialityHeader(
        'confidential: this report may contain internal urls, security stuff',
      ),
    ).toBe(true);
  });

  it('returns false when the header is missing', () => {
    expect(hasConfidentialityHeader('# A Report\n\nJust content.')).toBe(false);
  });

  it('returns false when the header appears only after the first 400 characters', () => {
    const padding = 'x'.repeat(450);
    const text = `${padding}\n${CONFIDENTIALITY_HEADER_MD}`;
    expect(hasConfidentialityHeader(text)).toBe(false);
  });
});
