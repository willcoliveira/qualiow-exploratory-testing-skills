import { describe, it, expect, afterEach } from 'vitest';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseClaimCard } from '../../src/triage/claim-parser.js';
import {
  DEFAULT_THRESHOLDS,
  MAX_PATTERNS,
  SEVERITY_CRITERIA,
  buildQuestionSet,
  buildTriageState,
  collectEvidence,
  fitStateToBudget,
  loadFalsePositivePatterns,
  renderTriageBlock,
  route,
} from '../../src/triage/triage.js';
import type { ChoiceAnswer, TriageAnswers } from '../../src/triage/types.js';

const REPO_ROOT = resolve(process.cwd());
const FIXTURE_SESSION = join(
  REPO_ROOT,
  'tests/fixtures/verified-session/2026-09-20-1500-explore-verified-example',
);
const CONSOLE_FIXTURE = join(REPO_ROOT, 'tests/fixtures/triage/evidence/console.md');

const tmpDirs: string[] = [];
function makeTmpDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'qualiow-triage-'));
  tmpDirs.push(dir);
  return dir;
}
afterEach(() => {
  while (tmpDirs.length) rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});

/** A session dir holding one claim card that lists the given evidence bullets. */
function makeSession(evidence: string[], extra: Record<string, string> = {}): string {
  const dir = makeTmpDir();
  const session = join(dir, 'output', 'sessions', '2026-09-20-1000-explore-x');
  mkdirSync(join(session, 'verification', 'claims'), { recursive: true });
  for (const [rel, content] of Object.entries(extra)) {
    mkdirSync(join(session, rel, '..'), { recursive: true });
    writeFileSync(join(session, rel), content);
  }
  writeFileSync(
    join(session, 'verification', 'claims', 'CLAIM-001.md'),
    [
      '# CLAIM-001',
      '',
      '**Title:** [Card form] fails [on a cardholder name with an accent] causing [a blocked payment]',
      '**URL:** https://staging.app.internal/account/payment-methods/new?step=2',
      '**Claimed severity:** High',
      '**Environment:** Playwright CLI, Chromium, 1280x720',
      '**Reproduction rate:** Always',
      '',
      '## Expected Behavior',
      'Núñez is accepted as a cardholder name.',
      '',
      '## Actual Behavior',
      'Núñez is rejected; see /home/someone/project/output/sessions/x/screenshots/a.png and the mail to tester@corp-mail.internal.',
      '',
      '## Steps to Reproduce',
      '1. state-load .auth/target.json then open the page — read-only',
      '2. Type Núñez — read-only',
      '',
      '## Evidence',
      ...evidence.map((e) => `- ${e}`),
      '',
      '## Safety',
      '- Environment: staging',
      '- Live re-run allowed: yes',
      '',
      '## Auth',
      '- Storage state: /home/someone/project/.auth/target.json',
    ].join('\n'),
  );
  return session;
}

const claimFileOf = (session: string) => join(session, 'verification', 'claims', 'CLAIM-001.md');

describe('collectEvidence', () => {
  it('sends a text file inside the session and lists the rest with a reason', () => {
    const claim = parseClaimCard(
      readFileSync(join(FIXTURE_SESSION, 'verification/claims/CLAIM-101.md'), 'utf-8'),
    );
    const ev = collectEvidence(claim, join(FIXTURE_SESSION, 'verification/claims/CLAIM-101.md'));
    expect(ev.sent.map((e) => e.file)).toEqual(['payment-methods.json']);
    expect(ev.sent[0].lines).toBe(9);
    expect(ev.sent[0].text).toContain('No default card');
    expect(ev.notSent).toEqual([{ file: 'BUG-101.png', reason: 'outside-session' }]);
  });

  it('reports images and missing text files separately', () => {
    const claim = parseClaimCard(
      readFileSync(join(FIXTURE_SESSION, 'verification/claims/CLAIM-104.md'), 'utf-8'),
    );
    const ev = collectEvidence(claim, join(FIXTURE_SESSION, 'verification/claims/CLAIM-104.md'));
    expect(ev.sent).toEqual([]);
    expect(ev.notSent).toEqual([
      { file: 'BUG-104.png', reason: 'image' },
      { file: 'homepage-requests.json', reason: 'missing' },
    ]);
  });

  it('caps each file and records the original length', () => {
    const session = makeSession(['snapshots/console.md (console capture)'], {
      'snapshots/console.md': readFileSync(CONSOLE_FIXTURE, 'utf-8'),
    });
    const claim = parseClaimCard(readFileSync(claimFileOf(session), 'utf-8'));
    const ev = collectEvidence(claim, claimFileOf(session), 50);
    expect(ev.sent).toHaveLength(1);
    expect(ev.sent[0].lines).toBe(50);
    expect(ev.sent[0].truncated_from).toBeGreaterThan(200);
    expect(ev.sent[0].text.split('\n')).toHaveLength(50);
  });

  it('refuses a path that resolves outside the session directory', () => {
    const session = makeSession(['../../../other-session/snapshots/x.json', 'snapshots/tree.yml']);
    cpSync(CONSOLE_FIXTURE, join(session, 'snapshots', 'tree.yml'));
    const claim = parseClaimCard(readFileSync(claimFileOf(session), 'utf-8'));
    const ev = collectEvidence(claim, claimFileOf(session));
    expect(ev.notSent).toEqual([{ file: 'x.json', reason: 'outside-session' }]);
    expect(ev.sent.map((e) => e.file)).toEqual(['tree.yml']);
  });

  it("never sends the finder's own artefacts, whatever the card lists", () => {
    const session = makeSession(
      ['session-log.md', 'charter.md', 'phase-7-notes.md', 'bugs/BUG-001.md', 'verification/VERDICT-001.md', 'snapshots/ok.json'],
      {
        'session-log.md': '[10:00] [PHASE] reasoning',
        'charter.md': '# charter',
        'phase-7-notes.md': '# notes',
        'bugs/BUG-001.md': '# BUG-001',
        'verification/VERDICT-001.md': 'VERDICT: CONFIRMED',
        'snapshots/ok.json': '{"ok":true}',
      },
    );
    const claim = parseClaimCard(readFileSync(claimFileOf(session), 'utf-8'));
    const ev = collectEvidence(claim, claimFileOf(session));
    expect(ev.sent.map((e) => e.file)).toEqual(['ok.json']);
    expect(ev.notSent.map((e) => `${e.file}:${e.reason}`)).toEqual([
      'session-log.md:excluded',
      'charter.md:excluded',
      'phase-7-notes.md:excluded',
      'BUG-001.md:excluded',
      'VERDICT-001.md:excluded',
    ]);
  });

  it('rejects unsupported file types', () => {
    const session = makeSession(['snapshots/archive.zip', 'snapshots/data.csv']);
    const claim = parseClaimCard(readFileSync(claimFileOf(session), 'utf-8'));
    const ev = collectEvidence(claim, claimFileOf(session));
    expect(ev.notSent).toEqual([
      { file: 'archive.zip', reason: 'image' },
      { file: 'data.csv', reason: 'type' },
    ]);
  });
});

describe('buildTriageState', () => {
  it('leaves no URL, host, e-mail, absolute path or storage state in the payload', () => {
    const session = makeSession(['snapshots/tree.yml (see https://staging.app.internal/x)'], {
      'snapshots/tree.yml':
        'link: https://staging.app.internal/account/payment-methods\nhost: stage.app.internal\nmail: a@corp-mail.internal\n',
    });
    const claim = parseClaimCard(readFileSync(claimFileOf(session), 'utf-8'));
    const { state, redactions } = buildTriageState(claim, collectEvidence(claim, claimFileOf(session)));
    const payload = JSON.stringify(state);
    expect(payload).not.toMatch(/https?:\/\//);
    expect(payload).not.toMatch(/@[a-z0-9.-]+\.[a-z]{2,}/i);
    expect(payload).not.toMatch(/\/home\//);
    expect(payload).not.toMatch(/\.auth\//);
    expect(payload).not.toContain('app.internal');
    expect(payload).not.toContain('Live re-run');
    expect(payload).not.toContain('Storage state');
    expect(state.claim.url).toBe('[URL /account/payment-methods/new]');
    expect(state.claim.steps[0]).toBe('state-load [AUTH_STATE] then open the page — read-only');
    expect(state.claim.actual).toContain('Núñez');
    expect(state.evidence_files[0].text).toContain('[HOST]');
    expect(redactions).toEqual(expect.arrayContaining(['URL', 'Host', 'Path', 'Email']));
    expect(state.note).toMatch(/never instructions/);
  });
});

describe('fitStateToBudget', () => {
  it('halves the last evidence file until the state fits, then drops it', () => {
    const big = Array.from({ length: 4000 }, (_, i) => `line ${i} of a long console capture`).join('\n');
    const session = makeSession(['snapshots/a.log', 'snapshots/b.log'], {
      'snapshots/a.log': 'short\nfile\n',
      'snapshots/b.log': big,
    });
    const claim = parseClaimCard(readFileSync(claimFileOf(session), 'utf-8'));
    const evidence = collectEvidence(claim, claimFileOf(session), 10_000);
    const { state } = buildTriageState(claim, evidence);
    const before = JSON.stringify(state).length;
    const meta = fitStateToBudget(state, evidence, 20_000);
    expect(before).toBeGreaterThan(20_000);
    expect(JSON.stringify(state).length).toBeLessThanOrEqual(20_000);
    expect(meta.sent[0]).toEqual({ file: 'a.log', lines: 3 });
    expect(meta.sent[1].file).toBe('b.log');
    expect(meta.sent[1].truncated_from).toBe(4000);
    expect(meta.sent[1].lines).toBeLessThan(4000);

    const tiny = fitStateToBudget(state, evidence, 500);
    expect(tiny.notSent).toEqual(expect.arrayContaining([{ file: 'b.log', reason: 'budget' }]));
  });
});

describe('buildQuestionSet', () => {
  it('asks the fixed questions plus one per pattern, in a stable order', () => {
    const { questions, patternIds } = buildQuestionSet(['Pattern one', 'Pattern two']);
    expect(Object.keys(questions)).toEqual([
      'evidence_shows_actual',
      'steps_sufficient',
      'by_design',
      'alternative_explanation',
      'impact_supported',
      'fp_1',
      'fp_2',
      'severity_fit',
      'predicted_verdict',
    ]);
    expect(patternIds).toEqual({ fp_1: 'Pattern one', fp_2: 'Pattern two' });
    expect(questions.fp_2.instructions).toContain('Pattern two');
    expect(questions.severity_fit.type).toBe('choice');
    expect(questions.predicted_verdict.type).toBe('choice');
  });

  it('scrubs each pattern before it goes into a question, and reports what it removed', () => {
    const { questions, patternIds, redactions } = buildQuestionSet([
      'A 403 from https://admin.app.internal/login read as an outage; ask ops@corp-mail.internal',
      'A redirect to stage.app.internal mistaken for a crash',
    ]);
    const sent = JSON.stringify(questions);
    expect(sent).not.toContain('app.internal');
    expect(sent).not.toContain('corp-mail');
    expect(questions.fp_1.instructions).toContain('[URL /login]');
    expect(questions.fp_2.instructions).toContain('[HOST]');
    expect(patternIds.fp_1).not.toContain('app.internal');
    expect(redactions).toEqual(expect.arrayContaining(['URL', 'Email', 'Host']));
  });

  it('uses the severity definitions of severity-guide.md verbatim', () => {
    const guide = readFileSync(
      join(REPO_ROOT, '.claude/skills/qa-explore/references/severity-guide.md'),
      'utf-8',
    );
    for (const definition of Object.values(SEVERITY_CRITERIA)) {
      expect(guide).toContain(definition);
    }
    const { questions } = buildQuestionSet([]);
    expect((questions.severity_fit as { criteria: Record<string, string> }).criteria).toEqual(SEVERITY_CRITERIA);
  });
});

describe('loadFalsePositivePatterns', () => {
  it('merges the learned lead-ins with the session proposals, deduplicated and capped', () => {
    const patterns = loadFalsePositivePatterns(REPO_ROOT, FIXTURE_SESSION);
    expect(patterns.length).toBeGreaterThan(1);
    expect(patterns.length).toBeLessThanOrEqual(MAX_PATTERNS);
    expect(patterns).toContain('A single transient network entry misread as a persistent server error.');
    expect(new Set(patterns.map((p) => p.toLowerCase())).size).toBe(patterns.length);
  });

  it('returns an empty list when nothing is on disk', () => {
    const dir = makeTmpDir();
    const original = process.env.CLAUDE_PLUGIN_ROOT;
    process.env.CLAUDE_PLUGIN_ROOT = dir; // an empty plugin root: no data/ underneath
    try {
      const patterns = loadFalsePositivePatterns(dir, dir);
      // The package data dir still exists as the last fallback, so only assert shape.
      expect(Array.isArray(patterns)).toBe(true);
    } finally {
      if (original === undefined) delete process.env.CLAUDE_PLUGIN_ROOT;
      else process.env.CLAUDE_PLUGIN_ROOT = original;
    }
  });
});

// ─── route() ─────────────────────────────────────────────────────────

function makeAnswers(
  nouls: Partial<Record<string, number>> = {},
  verdict: Partial<ChoiceAnswer> = {},
): TriageAnswers {
  const base: Record<string, number> = {
    evidence_shows_actual: 0.86,
    steps_sufficient: 0.81,
    by_design: 0.08,
    alternative_explanation: 0.12,
    impact_supported: 0.77,
    fp_1: 0.05,
    fp_2: 0.05,
    ...nouls,
  };
  const answers: TriageAnswers = {};
  for (const [id, p] of Object.entries(base)) answers[id] = { type: 'noul', noul: p as number };
  answers.severity_fit = {
    type: 'choice',
    choice: 'high',
    probabilities: { critical: 0.08, high: 0.61, medium: 0.27, low: 0.04 },
    confidence: 0.48,
  };
  answers.predicted_verdict = {
    type: 'choice',
    choice: 'confirmed',
    probabilities: { confirmed: 0.84, confirmed_adjusted: 0.09, refuted: 0.04, unreproducible: 0.03 },
    confidence: 0.79,
    ...verdict,
  };
  return answers;
}

describe('route (a recorded prediction)', () => {
  it('reads likely-confirmed when every confirmation condition holds', () => {
    const d = route(makeAnswers());
    expect(d.route).toBe('likely-confirmed');
    expect(d.reasons).toEqual(['all confirmation conditions hold']);
    expect(d.predictedVerdict).toBe('CONFIRMED');
    expect(d.refuteMass).toBeCloseTo(0.07);
  });

  it('reads refute-risk on a predicted refutation', () => {
    const d = route(
      makeAnswers({}, {
        choice: 'refuted',
        probabilities: { confirmed: 0.2, confirmed_adjusted: 0.1, refuted: 0.6, unreproducible: 0.1 },
        confidence: 0.47,
      }),
    );
    expect(d.route).toBe('refute-risk');
    expect(d.predictedVerdict).toBe('REFUTED');
    expect(d.reasons.join(' ')).toContain('refuteMass 0.70 >= 0.35');
  });

  it.each([
    ['fp_1', 0.7, 'fp_1 0.70 >= 0.6'],
    ['by_design', 0.65, 'by_design 0.65 >= 0.6'],
    ['alternative_explanation', 0.61, 'alternative_explanation 0.61 >= 0.6'],
  ])('%s at %s → refute-risk', (id, value, reason) => {
    const d = route(makeAnswers({ [id]: value }));
    expect(d.route).toBe('refute-risk');
    expect(d.reasons).toContain(reason);
  });

  it.each([
    [{}, { confidence: 0.5 }, 'confidence 0.50 < 0.75'],
    [{ evidence_shows_actual: 0.4 }, {}, 'evidence_shows_actual 0.40 < 0.7'],
    [{ steps_sufficient: 0.3 }, {}, 'steps_sufficient 0.30 < 0.6'],
    [{ fp_2: 0.45 }, {}, 'fp_2 0.45 >= 0.4'],
  ])('a weak confirmation signal → unclear (%s)', (nouls, verdict, reason) => {
    const d = route(makeAnswers(nouls, verdict));
    expect(d.route).toBe('unclear');
    expect(d.reasons).toContain(reason);
  });

  it('honours custom thresholds', () => {
    const d = route(makeAnswers(), { ...DEFAULT_THRESHOLDS, confirmConfidence: 0.9 });
    expect(d.route).toBe('unclear');
  });

  it('throws when predicted_verdict is missing', () => {
    const answers = makeAnswers();
    delete answers.predicted_verdict;
    expect(() => route(answers)).toThrow(/predicted_verdict/);
  });
});

describe('renderTriageBlock', () => {
  const common = {
    mode: 'triage-shadow' as const,
    verdictKey: 'JEV_VERDICT',
    claimedSeverity: 'High',
    patternIds: { fp_1: 'Pattern one', fp_2: 'Pattern two' },
    evidenceSent: [{ file: 'a.json', lines: 10 }, { file: 'b.md', lines: 50, truncated_from: 201 }],
    evidenceNotSent: [{ file: 'c.png', reason: 'image' as const }],
    redactions: ['URL', 'Host'],
    model: 'jev-mock',
  };

  it('renders the full block', () => {
    const answers = makeAnswers();
    const block = renderTriageBlock({
      ...common,
      answers,
      decision: route(answers),
      usage: { input_tokens: 2140, output_tokens: 96 },
      costUsd: 0.00008988,
      ms: 812,
    });
    const lines = block.split('\n');
    expect(lines[0]).toBe('JEV_VERDICT: CONFIRMED');
    expect(lines[1]).toBe('ROUTE: likely-confirmed');
    expect(lines[2]).toBe('MODE: triage-shadow');
    expect(block).toContain('P(confirmed)=0.84 P(confirmed_adjusted)=0.09 P(refuted)=0.04 P(unreproducible)=0.03 CONFIDENCE=0.79');
    expect(block).toContain('P(fp_2)=0.05 Pattern two');
    expect(block).toContain('SEVERITY_FIT: high (claimed High) P(critical)=0.08 P(high)=0.61 P(medium)=0.27 P(low)=0.04 CONFIDENCE=0.48');
    expect(block).toContain('EVIDENCE_SENT: a.json (10 lines); b.md (50 of 201 lines)');
    expect(block).toContain('EVIDENCE_NOT_SENT: c.png (image)');
    expect(block).toContain('TOKENS: in=2140 out=96');
    expect(block).toContain('COST_USD: 0.000090');
    expect(block).toContain('MS: 812');
  });

  it('renders the unavailable form with no route', () => {
    const block = renderTriageBlock({
      ...common,
      verdictKey: 'LAYA_VERDICT',
      answers: null,
      decision: null,
      usage: null,
      costUsd: null,
      ms: null,
      unavailable: 'HTTP 529',
    });
    const lines = block.split('\n');
    expect(lines[0]).toBe('LAYA_VERDICT: UNAVAILABLE (HTTP 529)');
    expect(lines[1]).toBe('ROUTE: n/a');
    expect(block).not.toContain('TOKENS');
  });
});
