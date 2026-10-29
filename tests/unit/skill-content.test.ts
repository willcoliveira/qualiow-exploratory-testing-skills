/**
 * Skill and agent prose that a session acts on, held to what the CLI does with it.
 * Each block pins one behaviour a phase file or agent definition must keep.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { learnedPatternLeadIns } from '../../src/cli/commands/kb.js';
import { runSessionFinalize } from '../../src/cli/commands/session.js';
import { hasConfidentialityHeader } from '../../src/utils/confidentiality.js';
import { C2_NAME, cleanup, copySession, silentLog } from './contract2-helpers.js';

const tmpDirs: string[] = [];
afterEach(() => cleanup(tmpDirs));

const REPO_ROOT = resolve(process.cwd());
const SKILLS = join(REPO_ROOT, '.claude', 'skills');

function skillFile(...parts: string[]): string {
  return readFileSync(join(SKILLS, ...parts), 'utf-8');
}

/** The bodies of the ```markdown fences in a file. */
function markdownFences(content: string): string[] {
  const out: string[] = [];
  const re = /^```markdown\n([\s\S]*?)^```$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) out.push(m[1]);
  return out;
}

describe('/qa-explore-feedback learned-pattern templates', () => {
  const content = skillFile('qa-explore-feedback', 'SKILL.md');
  const start = content.indexOf('### 5. Update Learned Patterns');
  const section = content.slice(start, content.indexOf('\n### 6.', start));
  const fences = markdownFences(section);

  it('has the three templates', () => {
    expect(fences).toHaveLength(3);
  });

  it.each([0, 1, 2])('template %i yields a lead-in kb digest lifts', (i) => {
    const sections = learnedPatternLeadIns(fences[i]);
    expect(sections.length).toBeGreaterThan(0);
    expect(sections.at(-1)!.items[0]).toMatch(/^\[NEW\] \S/);
  });
});

describe('mobile runs no bug judge (ADR-013)', () => {
  it('mobile phase 7 runs qa-explore phase 7 in off mode', () => {
    const phase7 = skillFile('qa-explore-mobile', 'phases', '07-reporting.md');
    expect(phase7).toContain('## Verification is off on mobile (ADR-013)');
    expect(phase7).toMatch(/skip \*\*Verify Bugs\*\* and \*\*Finalize Bug Reports\*\*/);
  });

  it('the judge has no mobile branch', () => {
    const judge = readFileSync(join(REPO_ROOT, '.claude', 'agents', 'qa-bug-judge.md'), 'utf-8');
    expect(judge).not.toMatch(/mcli|--state/);
  });
});

describe('qa-bug-judge keeps quoted text off the field lines', () => {
  const judge = readFileSync(join(REPO_ROOT, '.claude', 'agents', 'qa-bug-judge.md'), 'utf-8')
    .replace(/\s+/g, ' ');

  it('quotes tested text as `> ` lines and writes exactly one VERDICT line', () => {
    expect(judge).toContain('`VERDICT:` appears on exactly one line');
    expect(judge).toMatch(/prefixed `> `, even when the quoted text itself starts with a field name/);
  });
});

describe('qa-reporting-agent and /qa-explore-report agree with what finalize checks', () => {
  const agent = readFileSync(join(REPO_ROOT, '.claude', 'agents', 'qa-reporting-agent.md'), 'utf-8');
  const report = skillFile('qa-explore-report', 'SKILL.md');

  it('the agent does not count on finalize to catch report layout', () => {
    expect(agent).not.toContain('a format violation in `session-report.md`');
    expect(agent).toContain('It never reads the report\'s layout');
  });

  it('--format summary is copied from phase-7-notes.md, never composed', () => {
    expect(report).not.toMatch(/top 3\s+findings; key recommendation/);
    expect(report).toMatch(/\*\*summary\*\*: copied, never composed/);
  });

  it('the forked skill opens nothing outside the chosen session', () => {
    expect(report).not.toContain('Cross-check with `output/sessions/INDEX.md`');
  });
});

describe('a contract-2 session without the CLI stays contract 2 and unindexed', () => {
  it('explore phase 7 keeps contract 2 and writes no index rows by hand', () => {
    const phase7 = skillFile('qa-explore', 'phases', '07-reporting.md').replace(/\s+/g, ' ');
    expect(phase7).not.toContain('leave `contract`, `continues` and `coverage.areas` out of `stats.json`');
    expect(phase7).toContain('keep the session on contract 2 exactly as written and write **no** index rows');
  });

  it('paths.md allows hand-written index rows only for contract-1 sessions', () => {
    const paths = skillFile('qa-explore', 'references', 'paths.md').replace(/\s+/g, ' ');
    expect(paths).toContain('never for an explore or quick session');
  });
});

describe('/qa-verify-backend credentials never ride on a shell variable', () => {
  const backend = ['phases/00-setup.md', 'phases/03-live-verification.md', 'references/aws-readonly-probes.md']
    .map((f) => skillFile('qa-verify-backend', ...f.split('/')))
    .join('\n');

  it('passes a literal --profile on aws calls instead of exporting it', () => {
    expect(backend).not.toMatch(/export AWS_PROFILE|--profile "\$/);
    expect(backend).toContain('aws sts get-caller-identity --profile <profile> --region <region>');
  });

  it('proves the API key from a node --env-file script, never $KEY on a curl line', () => {
    expect(backend).not.toMatch(/curl[^\n]*\$KEY/);
    expect(backend).toContain('node --env-file=qa/.env probes/auth-proof.mjs');
  });
});

describe('/qa-explore-feedback never edits a finalized session', () => {
  const content = skillFile('qa-explore-feedback', 'SKILL.md');
  const feedbackTemplate = markdownFences(content).find((f) => f.includes('# Feedback — '));

  it('records severity changes in feedback.md, not in the bug file or all-bugs.md', () => {
    expect(content).not.toMatch(/Adjust the `\*\*Severity:\*\*` line/);
    expect(content).toContain('Never edit\n`bugs/*.md`, `stats.json` or any other file of a finalized session.');
    expect(content).toContain('`<session-dir>/feedback.md`');
  });

  it('ships a feedback.md template that opens with the confidentiality header', () => {
    expect(feedbackTemplate).toBeDefined();
    expect(hasConfidentialityHeader(feedbackTemplate!)).toBe(true);
  });

  it('a finalized contract-2 session with that feedback.md still passes finalize --check', async () => {
    const { cwd, sessionDir } = copySession(tmpDirs);
    expect((await runSessionFinalize(C2_NAME, {}, { cwd, log: silentLog })).ok).toBe(true);
    writeFileSync(
      join(sessionDir, 'feedback.md'),
      feedbackTemplate!
        .replace('<session-dir>', C2_NAME)
        .replace('<YYYY-MM-DD>', '2026-10-28')
        .replace('BUG-NNN: <old> → <new> — <reason>', 'BUG-001: High → Medium — a workaround exists'),
    );
    const check = await runSessionFinalize(C2_NAME, { check: true }, { cwd, log: silentLog });
    expect(check.violations).toEqual([]);
  });

  it('/qa-explore-report no longer says feedback owns severity changes in the bug files', () => {
    expect(skillFile('qa-explore-report', 'SKILL.md')).not.toContain('owns severity changes');
  });
});
