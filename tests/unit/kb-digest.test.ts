import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, cpSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseDocument } from 'yaml';
import { runKbDigest, learnedPatternLeadIns } from '../../src/cli/commands/kb.js';

const REPO_ROOT = resolve(process.cwd());
const REPO_DATA_DIR = join(REPO_ROOT, 'data');

/** The line ceiling the explore digest must stay under. The point of the digest
 *  is that a session loads it instead of the manifest and the release files, so
 *  the ceiling is part of the contract rather than an incidental property. */
const EXPLORE_LINE_CEILING = 130;

const tmpDirs: string[] = [];
const ENV_KEY = 'CLAUDE_PLUGIN_ROOT';
const originalPluginRoot = process.env[ENV_KEY];

function makeTmpDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'qualiow-digest-'));
  tmpDirs.push(dir);
  return dir;
}

/** A writable copy of the repo's data/ for the mutation cases. */
function makeTmpDataCopy(): string {
  const dir = makeTmpDir();
  cpSync(REPO_DATA_DIR, join(dir, 'data'), { recursive: true });
  return join(dir, 'data');
}

afterEach(() => {
  if (originalPluginRoot === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = originalPluginRoot;
  while (tmpDirs.length) {
    rmSync(tmpDirs.pop()!, { recursive: true, force: true });
  }
});

const ALWAYS_IDS = [
  'heuristic-sfdipot',
  'heuristic-few-hiccupps',
  'heuristic-test-tours',
  'heuristic-goldilocks',
  'technique-boundary-testing',
];

// ─── selection ───────────────────────────────────────────────────────

describe('runKbDigest — default selection', () => {
  it('names every loading_strategy.always id', () => {
    const digest = runKbDigest({}, REPO_ROOT);
    for (const id of ALWAYS_IDS) {
      expect(digest).toContain(`- ${id} [`);
    }
  });

  it('opens with a header carrying the manifest version and the counts', () => {
    const digest = runKbDigest({}, REPO_ROOT);
    const header = digest.split('\n')[0];
    expect(header).toMatch(/^# Knowledge digest v\d+\.\d+\.\d+ · \d+ entries · always \d+/);
  });

  it('renders each entry heading as `id [type/priority] tags: …`', () => {
    const digest = runKbDigest({}, REPO_ROOT);
    expect(digest).toMatch(/^- heuristic-sfdipot \[heuristic\/high\] tags: .+/m);
  });
});

describe('runKbDigest — --domain', () => {
  it('adds the fintech entries and records them in the header', () => {
    const digest = runKbDigest({ domain: 'fintech' }, REPO_ROOT);
    expect(digest).toContain('- technique-exactly-once-verification [');
    expect(digest.split('\n')[0]).toContain('domain fintech +');
  });

  it('an unmapped domain adds nothing but still renders', () => {
    const digest = runKbDigest({ domain: 'not-a-domain' }, REPO_ROOT);
    expect(digest.split('\n')[0]).toContain('domain not-a-domain +0');
    for (const id of ALWAYS_IDS) expect(digest).toContain(`- ${id} [`);
  });
});

describe('runKbDigest — --tag', () => {
  it('adds the security entries', () => {
    const digest = runKbDigest({ tag: ['security'] }, REPO_ROOT);
    expect(digest).toContain('- technique-error-guessing [');
    expect(digest.split('\n')[0]).toContain('tags security +');
  });

  it('accepts repeated tags without duplicating an entry', () => {
    const digest = runKbDigest({ tag: ['security', 'accessibility'] }, REPO_ROOT);
    expect(digest).toContain('- technique-error-guessing [');
    expect(digest).toContain('- checklist-accessibility-wcag [');
    const occurrences = digest.split('\n').filter((l) => l.startsWith('- technique-error-guessing ['));
    expect(occurrences).toHaveLength(1);
  });
});

describe('runKbDigest — --for', () => {
  it('explore selects only the always entries', () => {
    const digest = runKbDigest({ for: 'explore' }, REPO_ROOT);
    expect(digest.split('\n')[0]).toContain('skill explore +0');
    for (const id of ALWAYS_IDS) expect(digest).toContain(`- ${id} [`);
  });

  it('backend adds the BE/API techniques', () => {
    const digest = runKbDigest({ for: 'backend' }, REPO_ROOT);
    for (const id of [
      'technique-verification-mode-selection',
      'technique-environment-fingerprinting',
      'technique-authenticated-api-probing',
      'technique-async-callback-contracts',
      'technique-test-suite-audit',
    ]) {
      expect(digest).toContain(`- ${id} [`);
    }
  });

  it('an unknown skill throws, naming the known ones', () => {
    expect(() => runKbDigest({ for: 'desktop' }, REPO_ROOT)).toThrow(/Unknown skill "desktop"/);
    expect(() => runKbDigest({ for: 'desktop' }, REPO_ROOT)).toThrow(/backend/);
  });
});

// ─── size ────────────────────────────────────────────────────────────

describe('runKbDigest — size', () => {
  it(`the explore digest stays under ${EXPLORE_LINE_CEILING} lines`, () => {
    const digest = runKbDigest({ for: 'explore' }, REPO_ROOT);
    expect(digest.split('\n').length).toBeLessThan(EXPLORE_LINE_CEILING);
  });

  it('caps each entry block at --max-lines', () => {
    const digest = runKbDigest({ for: 'explore', maxLines: 4 }, REPO_ROOT);
    const lines = digest.split('\n');
    const blockStarts = lines
      .map((line, i) => (line.startsWith('- ') ? i : -1))
      .filter((i) => i >= 0);
    expect(blockStarts.length).toBe(ALWAYS_IDS.length);
    for (let n = 0; n < blockStarts.length - 1; n++) {
      expect(blockStarts[n + 1] - blockStarts[n]).toBeLessThanOrEqual(4);
    }
  });

  it('a smaller cap produces a smaller digest', () => {
    const wide = runKbDigest({ for: 'explore', maxLines: 12 }, REPO_ROOT).split('\n').length;
    const narrow = runKbDigest({ for: 'explore', maxLines: 4 }, REPO_ROOT).split('\n').length;
    expect(narrow).toBeLessThan(wide);
  });
});

// ─── sub-items and learned patterns ──────────────────────────────────

describe('runKbDigest — entry blocks', () => {
  it('names the SFDIPOT dimensions with their first question', () => {
    const digest = runKbDigest({ for: 'explore', maxLines: 40 }, REPO_ROOT);
    expect(digest).toMatch(/Dimensions: Structure — What are the major components/);
  });

  it('carries the learned-pattern lead-ins and the grep pointer', () => {
    const digest = runKbDigest({ for: 'explore' }, REPO_ROOT);
    expect(digest).toContain('## Learned patterns');
    expect(digest).toContain('Grep the file for the full entry.');
    expect(digest).toContain('"Errors are swallowed instead of retried"');
  });

  it('never inlines a whole learned-patterns entry', () => {
    const digest = runKbDigest({ for: 'explore' }, REPO_ROOT);
    expect(digest).not.toContain('Disqualifier:');
  });
});

describe('learnedPatternLeadIns', () => {
  it('groups lead-ins under their heading and joins a wrapped bullet', () => {
    const sections = learnedPatternLeadIns(
      [
        '# Learned Patterns',
        '',
        '## False Positive Patterns',
        '',
        '- **"A lead-in that runs',
        '  across two lines"**: the rest of the item.',
        '- **Second lead-in** with **more bold** later.',
        '',
        '## Missed Bug Patterns',
        '',
        '- **Third lead-in**: body.',
        '- a bullet with no bold lead-in',
      ].join('\n'),
    );
    expect(sections).toHaveLength(2);
    expect(sections[0].heading).toBe('False Positive Patterns');
    expect(sections[0].items).toEqual([
      '"A lead-in that runs across two lines"',
      'Second lead-in',
    ]);
    expect(sections[1].items).toEqual(['Third lead-in']);
  });
});

// ─── --entry ─────────────────────────────────────────────────────────

describe('runKbDigest — --entry', () => {
  it('prints the entry file verbatim, listing the tours', () => {
    const output = runKbDigest({ entry: 'heuristic-test-tours' }, REPO_ROOT);
    const onDisk = readFileSync(
      join(REPO_DATA_DIR, 'knowledge', 'releases', 'v0.1.0', 'entries', 'heuristic-test-tours.yml'),
      'utf-8',
    ).trimEnd();
    expect(output).toBe(onDisk);
    expect(output).toContain('- name: Guidebook Tour');
    expect(output).toContain('- name: Money Tour');
  });

  it('an unknown id throws', () => {
    expect(() => runKbDigest({ entry: 'heuristic-does-not-exist' }, REPO_ROOT)).toThrow(
      /Unknown entry "heuristic-does-not-exist"/,
    );
  });
});

// ─── custom entries ──────────────────────────────────────────────────

describe('runKbDigest — custom entries', () => {
  it('renders a custom entry in its own section, marked [custom]', () => {
    const dataDir = makeTmpDataCopy();
    writeFileSync(
      join(dataDir, 'knowledge', 'custom', 'technique-house-style.yml'),
      [
        'id: technique-house-style',
        'version: "0.1.0"',
        'type: technique',
        'name: "House style"',
        'description: "A project-local technique."',
        'tags: [local]',
        'domains: [all]',
        'priority: medium',
        'added: "2026-09-13"',
        '',
        'content:',
        '  summary: "Check the things this project always gets wrong."',
        '',
      ].join('\n'),
    );
    const digest = runKbDigest({ for: 'explore', data: dataDir }, REPO_ROOT);
    expect(digest).toContain('## Custom entries');
    expect(digest).toContain('- technique-house-style [technique/medium] [custom] tags: local');
  });

  it('omits the section when the custom directory holds no entries', () => {
    const digest = runKbDigest({ for: 'explore' }, REPO_ROOT);
    expect(digest).not.toContain('## Custom entries');
  });
});

// ─── error paths ─────────────────────────────────────────────────────

describe('runKbDigest — manifest problems', () => {
  it('an unknown id in loading_strategy throws, naming it', () => {
    const dataDir = makeTmpDataCopy();
    const manifestPath = join(dataDir, 'knowledge', 'manifest.yml');
    const doc = parseDocument(readFileSync(manifestPath, 'utf-8'));
    doc.addIn(['loading_strategy', 'always'], 'heuristic-does-not-exist');
    writeFileSync(manifestPath, doc.toString(), 'utf-8');

    expect(() => runKbDigest({ data: dataDir }, REPO_ROOT)).toThrow(
      /unknown entry id\(s\): heuristic-does-not-exist/,
    );
  });

  it('a manifest without by_skill reports that --for has nothing to select', () => {
    const dataDir = makeTmpDataCopy();
    const manifestPath = join(dataDir, 'knowledge', 'manifest.yml');
    const doc = parseDocument(readFileSync(manifestPath, 'utf-8'));
    doc.deleteIn(['loading_strategy', 'by_skill']);
    writeFileSync(manifestPath, doc.toString(), 'utf-8');

    expect(() => runKbDigest({ for: 'explore', data: dataDir }, REPO_ROOT)).toThrow(
      /no loading_strategy\.by_skill/,
    );
  });

  it('a data directory with no manifest throws, naming the path it looked at', () => {
    const empty = makeTmpDir();
    expect(() => runKbDigest({ data: empty }, REPO_ROOT)).toThrow(/No knowledge manifest at/);
  });
});

// ─── data resolution ─────────────────────────────────────────────────

describe('runKbDigest — data resolution', () => {
  it('falls back to the package data from a cwd that has none', () => {
    delete process.env[ENV_KEY];
    const cwd = makeTmpDir();
    const digest = runKbDigest({ for: 'explore' }, cwd);
    for (const id of ALWAYS_IDS) expect(digest).toContain(`- ${id} [`);
  });

  it('prefers a project-local knowledge base over the package data', () => {
    delete process.env[ENV_KEY];
    const cwd = makeTmpDir();
    mkdirSync(join(cwd, 'data'), { recursive: true });
    cpSync(join(REPO_DATA_DIR, 'knowledge'), join(cwd, 'data', 'knowledge'), { recursive: true });
    writeFileSync(
      join(cwd, 'data', 'knowledge', 'learned-patterns.md'),
      ['# Learned Patterns', '', '## Project patterns', '', '- **Project-only lead-in**: body.', ''].join('\n'),
    );
    const digest = runKbDigest({ for: 'explore' }, cwd);
    expect(digest).toContain('Project-only lead-in');
  });
});
