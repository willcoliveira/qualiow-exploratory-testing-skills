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
