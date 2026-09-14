import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, resolve, relative, basename } from 'node:path';
import { parse as parseYaml } from 'yaml';

const REPO_ROOT = resolve(process.cwd());
const SKILLS_DIR = join(REPO_ROOT, '.claude', 'skills');

const ALLOWED_FRONTMATTER_KEYS = new Set([
  'name',
  'description',
  'allowed-tools',
  'argument-hint',
  'disable-model-invocation',
  'user-invocable',
  'model',
  'effort',
  'background',
  'context',
  'agent',
  'paths',
  'when_to_use',
  'metadata',
  'license',
  'compatibility',
]);

const SHELL_BUILTINS = new Set([
  'export', 'cd', 'for', 'do', 'done', 'if', 'then', 'else', 'elif', 'fi', 'echo',
  'test', '[', 'while', 'read', 'printf', 'true', 'false', 'set', 'source', '.',
  'mkdir', 'cp', 'mv', 'rm', 'cat', 'ls', 'grep', 'sed', 'awk', 'head', 'tail', 'wc',
  'sort', 'uniq', 'tee', 'date', 'sleep',
]);

const FORBIDDEN_STRINGS = [
  'playwright-cli network ',
  'tool-qa-workflow',
  'domains/<domain>.md',
  'quick-report.md',
  'phase-2-functional',
  'phase-3-edge-cases',
  '$MCLI',
  'MOBILE_CLI_STATE',
  'scripts/doctor-mobile',
  'scripts/setup-mobile',
  '{{',
];

function listMdFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  const walk = (d: string) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.md')) out.push(full);
    }
  };
  walk(dir);
  return out;
}

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

function extractAllowedToolPrefixes(allowedTools: unknown): string[] {
  if (typeof allowedTools !== 'string') return [];
  const prefixes: string[] = [];
  const re = /Bash\(([^:)]+):\*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(allowedTools))) {
    prefixes.push(m[1].trim());
  }
  return prefixes;
}

function resolveReference(raw: string, currentDir: string, skillDir: string, repoRoot: string): string {
  if (raw.startsWith('${CLAUDE_SKILL_DIR}')) {
    const rest = raw.slice('${CLAUDE_SKILL_DIR}'.length).replace(/^\//, '');
    // A skill runs from .claude/skills/<name> in a checkout and from
    // <plugin>/skills/<name> under a plugin install; a candidate path is valid
    // when it resolves under either layout (paths.md lists both on purpose).
    const candidates = [
      resolve(skillDir, rest),
      resolve(repoRoot, 'skills', basename(skillDir), rest),
    ];
    return candidates.find((c) => existsSync(c)) ?? candidates[0];
  }
  if (raw.startsWith('data/')) {
    return resolve(repoRoot, raw);
  }
  return resolve(currentDir, raw);
}

interface BashBlock {
  code: string;
  startLine: number; // 1-based line number of the first line of code
}

function extractBashBlocks(content: string): BashBlock[] {
  const lines = content.split('\n');
  const blocks: BashBlock[] = [];
  let inBlock = false;
  let current: string[] = [];
  let startLine = 0;

  lines.forEach((line, idx) => {
    if (!inBlock && /^```bash\s*$/.test(line.trim())) {
      inBlock = true;
      current = [];
      startLine = idx + 2; // 1-based line number of the line right after the fence
      return;
    }
    if (inBlock && /^```\s*$/.test(line.trim())) {
      inBlock = false;
      blocks.push({ code: current.join('\n'), startLine });
      return;
    }
    if (inBlock) current.push(line);
  });

  return blocks;
}

function checkBashLine(
  rawLine: string,
  allowedPrefixes: string[],
): { ok: boolean; token?: string } {
  const trimmed = rawLine.trim();
  if (trimmed === '') return { ok: true };
  if (/^[#<…]/.test(trimmed)) return { ok: true }; // illustrative / comment line

  // Option lines, operators and redirects continue a previous command.
  if (/^(-|&&|\|\||\||\)|\}|;|[0-9]?>)/.test(trimmed)) return { ok: true };

  const line = trimmed.replace(/^\$\s+/, ''); // strip a shell-prompt "$ "
  if (line === '') return { ok: true };

  const firstToken = line.split(/\s+/)[0];
  if (SHELL_BUILTINS.has(firstToken)) return { ok: true };
  if (allowedPrefixes.some((p) => p && line.startsWith(p))) return { ok: true };

  return { ok: false, token: firstToken };
}

const skillDirs = existsSync(SKILLS_DIR)
  ? readdirSync(SKILLS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort()
  : [];

describe('skill directories exist', () => {
  it('finds at least one skill under .claude/skills', () => {
    expect(skillDirs.length).toBeGreaterThan(0);
  });
});

describe.each(skillDirs)('skill: %s', (name) => {
  const skillDir = join(SKILLS_DIR, name);
  const skillMdPath = join(skillDir, 'SKILL.md');
  const exists = existsSync(skillMdPath);
  const content = exists ? readFileSync(skillMdPath, 'utf-8') : '';
  const frontmatter = exists ? parseFrontmatter(content) : null;

  it('has a SKILL.md', () => {
    expect(exists).toBe(true);
  });

  it('has parseable frontmatter (simple --- block)', () => {
    expect(frontmatter).not.toBeNull();
  });

  it('name matches the directory name and the naming pattern', () => {
    expect(frontmatter?.name).toBe(name);
    expect(String(frontmatter?.name ?? '')).toMatch(/^[a-z0-9-]{1,64}$/);
  });

  it('description is at most 1024 characters', () => {
    expect(String(frontmatter?.description ?? '').length).toBeLessThanOrEqual(1024);
  });

  it('only uses recognized frontmatter keys', () => {
    const keys = Object.keys(frontmatter ?? {});
    const unknown = keys.filter((k) => !ALLOWED_FRONTMATTER_KEYS.has(k));
    expect(unknown).toEqual([]);
  });

  it('SKILL.md is at most 500 lines', () => {
    expect(content.split('\n').length).toBeLessThanOrEqual(500);
  });
});

describe('forbidden strings are absent from every skill file', () => {
  const violations: string[] = [];

  for (const name of skillDirs) {
    for (const file of listMdFiles(join(SKILLS_DIR, name))) {
      const lines = readFileSync(file, 'utf-8').split('\n');
      lines.forEach((line, idx) => {
        for (const forbidden of FORBIDDEN_STRINGS) {
          if (line.includes(forbidden)) {
            violations.push(
              `${relative(REPO_ROOT, file)}:${idx + 1}: contains forbidden string "${forbidden}"`,
            );
          }
        }
      });
    }
  }

  it('contains none of the forbidden strings', () => {
    expect(violations, `Violations:\n${violations.join('\n')}`).toEqual([]);
  });
});

describe('relative links and backticked paths resolve', () => {
  const violations: string[] = [];
  const linkRe = /\[[^\]]*\]\(([^)]+)\)/g;
  const backtickRe = /`((?:\$\{CLAUDE_SKILL_DIR\}|phases\/|references\/)[^`]*)`/g;

  for (const name of skillDirs) {
    const skillDir = join(SKILLS_DIR, name);
    for (const file of listMdFiles(skillDir)) {
      const dir = dirname(file);
      const lines = readFileSync(file, 'utf-8').split('\n');

      lines.forEach((line, idx) => {
        for (const re of [linkRe, backtickRe]) {
          re.lastIndex = 0;
          let m: RegExpExecArray | null;
          while ((m = re.exec(line))) {
            const raw = m[1].split('#')[0].trim();
            if (!raw) continue;
            if (/^https?:\/\//i.test(raw)) continue;
            if (raw.includes('<')) continue;

            const resolved = resolveReference(raw, dir, skillDir, REPO_ROOT);
            if (!existsSync(resolved)) {
              violations.push(
                `${relative(REPO_ROOT, file)}:${idx + 1}: broken reference "${raw}" -> ${relative(REPO_ROOT, resolved)}`,
              );
            }
          }
        }
      });
    }
  }

  it('every relative link / backticked path resolves to an existing file', () => {
    expect(violations, `Violations:\n${violations.join('\n')}`).toEqual([]);
  });
});

describe('every ```bash fence line is a recognized builtin or an allowed-tools command', () => {
  const violations: string[] = [];

  for (const name of skillDirs) {
    const skillDir = join(SKILLS_DIR, name);
    const skillMdPath = join(skillDir, 'SKILL.md');
    if (!existsSync(skillMdPath)) continue;
    const frontmatter = parseFrontmatter(readFileSync(skillMdPath, 'utf-8'));
    const allowedPrefixes = extractAllowedToolPrefixes(frontmatter?.['allowed-tools']);

    for (const file of listMdFiles(skillDir)) {
      const content = readFileSync(file, 'utf-8');
      for (const block of extractBashBlocks(content)) {
        const lines = block.code.split('\n');
        let continued = false; // previous line ended with a backslash
        lines.forEach((line, i) => {
          const result = continued ? { ok: true } : checkBashLine(line, allowedPrefixes);
          continued = /\\\s*$/.test(line);
          if (!result.ok) {
            violations.push(
              `${relative(REPO_ROOT, file)}:${block.startLine + i}: unrecognized command "${result.token}" (not a shell builtin or covered by allowed-tools)`,
            );
          }
        });
      }
    }
  }

  it('contains no unrecognized commands', () => {
    expect(violations, `Violations:\n${violations.join('\n')}`).toEqual([]);
  });
});
