import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { parse as parseYaml } from 'yaml';

const REPO_ROOT = resolve(process.cwd());
const AGENTS_DIR = join(REPO_ROOT, '.claude', 'agents');

const ALLOWED_FRONTMATTER_KEYS = new Set([
  'name',
  'description',
  'tools',
  'model',
  'effort',
  'maxTurns',
  'background',
  'color',
  'disallowedTools',
  'skills',
]);

const ALLOWED_MODELS = new Set(['haiku', 'sonnet', 'opus', 'inherit']);
const ALLOWED_EFFORTS = new Set(['low', 'medium', 'high']);

const FORBIDDEN_STRINGS = [
  '{{',
  // The npm package is qualiow-exploratory-testing; the bare spelling below resolves
  // a package that does not exist (see qa-explore/references/paths.md).
  'npx qualiow',
];

// Same simple frontmatter parser as tests/unit/skills-lint.test.ts — duplicated on
// purpose so the two linters stay independent.
function parseFrontmatter(content: string): Record<string, unknown> | null {
  const match = content.match(/^---\n([\s\S]*?)\n---\r?\n?/);
  if (!match) return null;
  try {
    const data = parseYaml(match[1]);
    return data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function extractBashEntries(tools: unknown): string[] {
  if (typeof tools !== 'string') return [];
  const entries: string[] = [];
  const re = /Bash\(([^)]*)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tools))) {
    entries.push(m[1]);
  }
  return entries;
}

const agentFiles = existsSync(AGENTS_DIR)
  ? readdirSync(AGENTS_DIR)
      .filter((f) => f.endsWith('.md'))
      .sort()
  : [];

describe('agent definitions exist', () => {
  it('finds at least one agent under .claude/agents', () => {
    expect(agentFiles.length).toBeGreaterThan(0);
  });
});

describe.each(agentFiles)('agent: %s', (file) => {
  const agentPath = join(AGENTS_DIR, file);
  const content = readFileSync(agentPath, 'utf-8');
  const frontmatter = parseFrontmatter(content);
  const expectedName = file.replace(/\.md$/, '');

  it('has parseable frontmatter (simple --- block)', () => {
    expect(frontmatter).not.toBeNull();
  });

  it('name matches the file name and the naming pattern', () => {
    expect(frontmatter?.name).toBe(expectedName);
    expect(String(frontmatter?.name ?? '')).toMatch(/^[a-z0-9-]{1,64}$/);
  });

  it('only uses documented sub-agent frontmatter keys', () => {
    const keys = Object.keys(frontmatter ?? {});
    const unknown = keys.filter((k) => !ALLOWED_FRONTMATTER_KEYS.has(k));
    expect(unknown).toEqual([]);
  });

  it('does not set permissionMode', () => {
    expect(
      Object.prototype.hasOwnProperty.call(frontmatter ?? {}, 'permissionMode'),
      `${file}: permissionMode is rejected by plugin-distributed agents (docs/KNOWN-ISSUES.md ISSUE-001). Remove the key.`,
    ).toBe(false);
  });

  it('uses a model alias when model is set', () => {
    if (frontmatter?.model === undefined) return;
    expect(ALLOWED_MODELS.has(String(frontmatter.model))).toBe(true);
  });

  it('uses a known effort level when effort is set', () => {
    if (frontmatter?.effort === undefined) return;
    expect(ALLOWED_EFFORTS.has(String(frontmatter.effort))).toBe(true);
  });

  it('description is at most 1024 characters', () => {
    expect(String(frontmatter?.description ?? '').length).toBeLessThanOrEqual(1024);
  });

  it('is at most 200 lines', () => {
    expect(content.split('\n').length).toBeLessThanOrEqual(200);
  });

  it('every Bash(<prefix>:*) entry in tools is a plain command prefix', () => {
    const bad = extractBashEntries(frontmatter?.tools).filter(
      (entry) => !/^[a-z0-9][a-z0-9._/-]*:\*$/.test(entry),
    );
    expect(bad, `${file}: malformed Bash tool entries: ${bad.join(', ')}`).toEqual([]);
  });
});

describe('forbidden strings are absent from every agent file', () => {
  const violations: string[] = [];

  for (const file of agentFiles) {
    const agentPath = join(AGENTS_DIR, file);
    readFileSync(agentPath, 'utf-8')
      .split('\n')
      .forEach((line, idx) => {
        for (const forbidden of FORBIDDEN_STRINGS) {
          if (line.includes(forbidden)) {
            violations.push(
              `${relative(REPO_ROOT, agentPath)}:${idx + 1}: contains forbidden string "${forbidden}"`,
            );
          }
        }
      });
  }

  it('contains none of the forbidden strings', () => {
    expect(violations, `Violations:\n${violations.join('\n')}`).toEqual([]);
  });
});
