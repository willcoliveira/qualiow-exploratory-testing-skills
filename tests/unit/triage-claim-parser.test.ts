import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  normaliseJudgeVerdict,
  parseClaimCard,
  parseSeverityField,
  parseVerdictBlock,
} from '../../src/triage/claim-parser.js';

const VERIFICATION_DIR = resolve(
  process.cwd(),
  'tests/fixtures/verified-session/2026-09-20-1500-explore-verified-example/verification',
);
const read = (rel: string) => readFileSync(join(VERIFICATION_DIR, rel), 'utf-8');

describe('parseClaimCard', () => {
  it('parses every field of a full card', () => {
    const claim = parseClaimCard(read('claims/CLAIM-101.md'));
    expect(claim.id).toBe('CLAIM-101');
    expect(claim.complete).toBe(true);
    expect(claim.title).toBe(
      '[Payment methods] fails [when a second card is saved] causing [no default card on the account]',
    );
    expect(claim.url).toBe('https://example.com/account/payment-methods');
    expect(claim.claimedSeverity).toBe('High');
    expect(claim.environment).toBe('Playwright CLI, Chromium, 1280x720');
    expect(claim.reproductionRate).toBe('Always');
    expect(claim.expected).toContain('stays the default');
    expect(claim.actual).toContain('No default card');
  });

  it('keeps the read-only / state-changing suffix on every step', () => {
    const claim = parseClaimCard(read('claims/CLAIM-101.md'));
    expect(claim.steps).toHaveLength(4);
    expect(claim.steps[1]).toBe('Open Payment methods and save a second card. — state-changing');
    expect(claim.steps[3]).toBe('Observe: no card is marked default. — read-only');
  });

  it('separates evidence path tokens from the inline prose', () => {
    const claim = parseClaimCard(read('claims/CLAIM-101.md'));
    expect(claim.evidencePaths).toEqual([
      '/home/tester/project/output/sessions/2026-09-20-1500-explore-verified-example/screenshots/BUG-101.png',
      'snapshots/payment-methods.json',
    ]);
    expect(claim.evidenceInline).toContain('Console / network excerpts: none');
    expect(claim.evidenceInline).toContain('neither row has the Default badge');
    expect(claim.evidenceInline).not.toContain('.png');
    expect(claim.evidenceInline).not.toContain('.json');
  });

  it('never carries the Safety or Auth sections', () => {
    const claim = parseClaimCard(read('claims/CLAIM-101.md'));
    const serialised = JSON.stringify(claim);
    expect(serialised).not.toContain('Live re-run');
    expect(serialised).not.toContain('Storage state');
  });

  it('marks a stub card incomplete instead of throwing', () => {
    const claim = parseClaimCard(read('claims/CLAIM-102.md'));
    expect(claim.id).toBe('CLAIM-102');
    expect(claim.complete).toBe(false);
    expect(claim.title).toBe('');
    expect(claim.steps).toEqual([]);
    expect(claim.evidencePaths).toEqual([]);
  });

  it('drops a bullet that is only a label once its path is removed', () => {
    const claim = parseClaimCard(
      [
        '# CLAIM-007',
        '',
        '**Title:** [X] fails [Y] causing [Z]',
        '',
        '## Actual Behavior',
        'It breaks.',
        '',
        '## Steps to Reproduce',
        '1. Do it.',
        '',
        '## Evidence',
        '- Screenshot: `screenshots/BUG-007.png`',
        '- Console errors: TypeError: x is undefined',
      ].join('\n'),
    );
    expect(claim.complete).toBe(true);
    expect(claim.evidencePaths).toEqual(['screenshots/BUG-007.png']);
    expect(claim.evidenceInline).toBe('Console errors: TypeError: x is undefined');
  });
});

describe('parseVerdictBlock', () => {
  it('reads a fenced CONFIRMED block with an agreed severity', () => {
    const v = parseVerdictBlock(read('VERDICT-101.md'));
    expect(v.verdict).toBe('CONFIRMED');
    expect(v.fenced).toBe(true);
    expect(v.method).toBe('live-repro');
    expect(v.confidence).toBe('high');
    expect(v.severity).toBe('High');
    expect(v.reproResult).toContain('Reproduced');
    expect(v.falsePositivePattern).toBeUndefined();
  });

  it('reads a fenced REFUTED block: n/a severity and a false-positive pattern', () => {
    const v = parseVerdictBlock(read('VERDICT-104.md'));
    expect(v.verdict).toBe('REFUTED');
    expect(v.severity).toBeNull();
    expect(v.falsePositivePattern).toContain('transient network entry');
  });

  it('reads the unfenced one-line UNVERIFIED form', () => {
    const v = parseVerdictBlock(read('VERDICT-103.md'));
    expect(v.verdict).toBe('UNVERIFIED');
    expect(v.fenced).toBe(false);
    expect(v.verdictRaw).toContain('judge unavailable');
    expect(v.method).toBeUndefined();
  });

  it('reads an adjusted severity', () => {
    const v = parseVerdictBlock(
      '```\nVERDICT: CONFIRMED-ADJUSTED\nMETHOD: evidence-only\nCONFIDENCE: medium\nSEVERITY: adjusted to Medium — a workaround exists\nREPRO_RESULT: n/a\nREASONING: x\n```\n',
    );
    expect(v.verdict).toBe('CONFIRMED-ADJUSTED');
    expect(v.severity).toBe('Medium');
    expect(v.method).toBe('evidence-only');
  });
});

describe('parseSeverityField / normaliseJudgeVerdict', () => {
  it.each([
    ['agree with claimed High', 'High'],
    ['agrees with the claimed medium', 'Medium'],
    ['adjusted to Low — cosmetic', 'Low'],
    ['n/a', null],
    ['keep Critical', 'Critical'],
    ['', null],
  ])('%s → %s', (raw, expected) => {
    expect(parseSeverityField(raw)).toBe(expected);
  });

  it('returns undefined when the line is absent', () => {
    expect(parseSeverityField(undefined)).toBeUndefined();
  });

  it.each([
    ['CONFIRMED', 'CONFIRMED'],
    ['confirmed-adjusted (High→Medium)', 'CONFIRMED-ADJUSTED'],
    ['REFUTED', 'REFUTED'],
    ['UNREPRODUCIBLE after 3 attempts', 'UNREPRODUCIBLE'],
    ['UNVERIFIED (judge unavailable: timeout)', 'UNVERIFIED'],
    ['maybe', 'UNKNOWN'],
  ])('%s → %s', (raw, expected) => {
    expect(normaliseJudgeVerdict(raw)).toBe(expected);
  });
});
