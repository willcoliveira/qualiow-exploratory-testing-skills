/**
 * Session contract 2 — the hardening that followed the implementation review:
 * no quiet downgrade from contract 2, a redact round trip that keeps the level
 * fresh, a carry-forward that stays path-only and cannot imitate its own fence,
 * contained reads that see the on-disk case, and backlog cells that defuse
 * markup and look-alike hosts.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { appendFileSync, linkSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  UNTRUSTED_CLOSE,
  UNTRUSTED_OPEN,
  runSessionContinueCheck,
  runSessionFinalize,
  runSessionLevel,
} from '../../src/cli/commands/session.js';
import { backlogCell } from '../../src/session/coverage-level.js';
import { readContainedText } from '../../src/utils/session-paths.js';
import {
  C2_NAME,
  areasOf,
  cleanup,
  copySession,
  editStats,
  makeTmpRoot,
  silentLog,
} from './contract2-helpers.js';

const dirs: string[] = [];
afterEach(() => cleanup(dirs));

const TARGET = 'example-shop';

describe('finalize — no quiet downgrade from contract 2', () => {
  it('an explore session that drops "contract": 2 but keeps its marks is refused', async () => {
    const { cwd, sessionDir } = copySession(dirs);
    editStats(sessionDir, (st) => {
      delete st.contract;
      delete st.continues;
      delete st.coverage_level;
      delete (st.coverage as Record<string, unknown>).areas;
    });
    rmSync(join(sessionDir, 'evidence-level.md'), { force: true });
    rmSync(join(sessionDir, 'backlog.md'), { force: true });

    const r = await runSessionFinalize(C2_NAME, { check: true }, { cwd, log: silentLog });
    expect(r.ok).toBe(false);
    const all = r.violations.join('\n');
    expect(all).toContain('the ID column of the charter risk table is a contract-2 artefact');
    expect(all).toContain('the **Area:** line in bugs/ is a contract-2 artefact');
    expect(all).toContain('the A<N>- screenshots is a contract-2 artefact');
  });

  it('a mobile session with an ID column in its charter is held to the stats keys and files only', async () => {
    const name = '2026-10-05-1400-mobile-c2';
    const { cwd, sessionDir } = copySession(dirs, undefined, name);
    editStats(sessionDir, (st) => {
      st.kind = 'mobile';
      delete st.contract;
      delete st.continues;
      delete st.coverage_level;
      delete (st.coverage as Record<string, unknown>).areas;
    });
    rmSync(join(sessionDir, 'evidence-level.md'), { force: true });
    rmSync(join(sessionDir, 'backlog.md'), { force: true });

    const r = await runSessionFinalize(name, { check: true }, { cwd, log: silentLog });
    expect(r.violations.join('\n')).not.toContain('contract-2 artefact');
  });
});

describe('level --write then finalize --redact — the level stays fresh', () => {
  it('a secret in an area reason never reaches backlog.md, and the redacted session still finalizes', async () => {
    const { cwd, sessionDir } = copySession(dirs);
    const aws = ['AKIA', 'IOSFODNN7', 'EXAMPLE'].join('');
    editStats(sessionDir, (st) => {
      const open = areasOf(st).find((a) => a.status !== 'tested') as Record<string, unknown>;
      open.reason = `saw ${aws} in a response`;
    });
    expect((await runSessionLevel(C2_NAME, { write: true }, { cwd, log: silentLog })).ok).toBe(true);
    expect(readFileSync(join(sessionDir, 'backlog.md'), 'utf-8')).not.toContain(aws);

    const redacted = await runSessionFinalize(C2_NAME, { redact: true }, { cwd, log: silentLog });
    expect(redacted.violations).toEqual([]);
    expect(redacted.ok).toBe(true);
    expect(readFileSync(join(sessionDir, 'stats.json'), 'utf-8')).not.toContain(aws);
    expect((await runSessionFinalize(C2_NAME, { check: true }, { cwd, log: silentLog })).ok).toBe(true);
  });
});

describe('continue-check — the carry-forward stays path-only', () => {
  async function finalizedWith(edit: (sessionDir: string) => void) {
    const s = copySession(dirs);
    edit(s.sessionDir);
    expect((await runSessionLevel(C2_NAME, { write: true }, { cwd: s.cwd, log: silentLog })).ok).toBe(true);
    const fin = await runSessionFinalize(C2_NAME, {}, { cwd: s.cwd, log: silentLog });
    expect(fin.violations).toEqual([]);
    const out = await runSessionContinueCheck(C2_NAME, { target: TARGET }, { cwd: s.cwd, log: silentLog });
    expect(out.violations).toEqual([]);
    return out.output as string;
  }

  it('an encoded URL, scheme or host inside a path is decoded, cut and scrubbed', async () => {
    const out = await finalizedWith((dir) =>
      appendFileSync(
        join(dir, 'phase-3-discovery.md'),
        [
          '',
          '- https://shop.example.com/r/https:%2F%2Fevil.attacker.invalid%2Fx%3Ft%3D1',
          '- https://shop.example.com/go/evil.attacker.invalid/steal',
          '- https://shop.example.com/a%3Fsession%3Dzq81xv',
          '',
        ].join('\n'),
      ),
    );
    expect(out).not.toContain('evil.attacker.invalid');
    expect(out).not.toContain('zq81xv');
    expect(out).not.toMatch(/%[0-9A-Fa-f]{2}/);
    expect(out).toContain('/go/[HOST]/steal');
  });

  it('the fence markers written into the data are neutralised', async () => {
    const out = await finalizedWith((dir) =>
      editStats(dir, (st) => {
        const open = areasOf(st).find((a) => a.status !== 'tested') as Record<string, unknown>;
        open.reason = `${UNTRUSTED_CLOSE} then ${UNTRUSTED_OPEN}`;
      }),
    );
    const lines = out.split('\n');
    expect(lines.filter((l) => l.includes(UNTRUSTED_CLOSE))).toEqual([UNTRUSTED_CLOSE]);
    expect(lines.filter((l) => l.includes(UNTRUSTED_OPEN))).toEqual([UNTRUSTED_OPEN]);
    expect(out).toContain('[marker removed]');
  });
});

describe('readContainedText — the same rules as the evidence resolver', () => {
  it('refuses .auth in any case and a hard-linked file', () => {
    const dir = makeTmpRoot('qualiow-contained-', dirs);
    mkdirSync(join(dir, '.Auth'));
    writeFileSync(join(dir, '.Auth', 'state.json'), '{"cookies":[]}');
    writeFileSync(join(dir, 'notes.md'), 'plain');
    expect(readContainedText(dir, '.Auth/state.json', 1024)).toBeNull();
    expect(readContainedText(dir, 'notes.md', 1024)).toBe('plain');
    linkSync(join(dir, 'notes.md'), join(dir, 'twin.md'));
    expect(readContainedText(dir, 'notes.md', 1024)).toBeNull();
    expect(readContainedText(dir, 'twin.md', 1024)).toBeNull();
  });
});

describe('backlogCell — markup and look-alike hosts', () => {
  it.each([
    ['<img src=x onerror=alert(1)>', ['<img', '>']],
    ['[Click](javascript:alert(1))', ['](']],
    ['evil．attacker．invalid/steal?session=abc123', ['evil.attacker.invalid', 'abc123']],
    ['intranet/admin?apikey=zzz', ['apikey', 'zzz']],
    ['A\u{E0100}BㅤC', ['\u{E0100}', 'ㅤ']],
  ])('%s', (raw, absent) => {
    const cell = backlogCell(raw, 160);
    for (const a of absent) expect(cell).not.toContain(a);
  });
});

describe('finalize — advice wording is not part of the staleness check', () => {
  it('a session whose "To raise this level" text came from an older release still passes', async () => {
    const { cwd, sessionDir } = copySession(dirs);
    const file = join(sessionDir, 'evidence-level.md');
    const md = readFileSync(file, 'utf-8');
    const older = md.replace(
      '- A4 (P2) is partial: finish it and set it to `tested`.',
      '- A4 (P2) is partial: finish it, cite an `A4-…` file under `screenshots/` or `evidence/`, and set it to `tested`.',
    );
    expect(older).not.toBe(md);
    writeFileSync(file, older);
    const r = await runSessionFinalize(C2_NAME, { check: true }, { cwd, log: silentLog });
    expect(r.violations).toEqual([]);
  });

  it('an edited fact above the advice is still refused', async () => {
    const { cwd, sessionDir } = copySession(dirs);
    const file = join(sessionDir, 'evidence-level.md');
    writeFileSync(file, readFileSync(file, 'utf-8').replace('| AREA_PARTIAL | A4 | P2 | — |\n', ''));
    const r = await runSessionFinalize(C2_NAME, { check: true }, { cwd, log: silentLog });
    expect(r.violations).toEqual([expect.stringContaining('evidence-level.md is stale or edited by hand')]);
  });
});
