/**
 * Skill and agent prose that a session acts on, held to what the CLI does with it.
 * Each block pins one behaviour a phase file or agent definition must keep.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { learnedPatternLeadIns } from '../../src/cli/commands/kb.js';

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
  const section = content.slice(content.indexOf('Update Learned Patterns'));
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
