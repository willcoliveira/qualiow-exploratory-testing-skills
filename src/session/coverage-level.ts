/**
 * The coverage level of a contract-2 session: computed, rendered, digested.
 * No I/O — `src/session/assess.ts` loads the inputs, the CLI writes the output.
 *
 * Two axes, kept apart. The **level** measures coverage only — how much of the
 * charter's risk ranking was tested with evidence, and whether what shipped is
 * verified and mapped. The **findings** line beside it (highest shipped
 * severity, how many unverified, how many on P0 areas) is the product state; it
 * is rendered, never folded into the level. Neither is a ship probability or a
 * release verdict.
 *
 * Ladder, first match wins, overall and per tier:
 *   1. unassessed — no area `tested`;
 *   2. incomplete — a P0 or P1 area not `tested`;
 *   3. qualified  — any gap, or a quick session (always capped here);
 *   4. complete   — otherwise.
 *
 * Everything rendered into `evidence-level.md` is a validated ID, tier,
 * severity or count filled into a fixed template: no free text written by the
 * session crosses into it. `backlog.md` carries the feature name and reason of
 * each untested area, scrubbed and capped.
 */

import { createHash } from 'node:crypto';
import { CONFIDENTIALITY_HEADER_MD } from '../utils/confidentiality.js';
import { escapeTableCell } from '../utils/index-files.js';
import { redact } from '../utils/redact.js';
import { scrubForTransmission } from '../triage/scrub.js';
import { RISK_TIERS } from '../schemas/session-metrics.schema.js';
import type {
  AreaStatus,
  BugSeverity,
  CoverageGap,
  CoverageLevel,
  CoverageLevelName,
  GapCode,
  RiskTier,
} from '../types/index.js';

export const LEVEL_DISCLAIMER =
  'A computed coverage fact for the tested scope — not a ship probability or release verdict.';

export const MAX_BACKLOG_FEATURE_CHARS = 80;
export const MAX_BACKLOG_REASON_CHARS = 160;

/** One charter risk row joined with its `coverage.areas` entry, in charter order. */
export interface LevelArea {
  id: string;
  tier: RiskTier;
  status: AreaStatus;
  /** The charter's Feature cell, raw — rendered only into `backlog.md`, scrubbed. */
  feature: string;
  /** The area's reason, raw — rendered only into `backlog.md`, scrubbed. */
  reason?: string;
}

/** One shipped bug (top-level `bugs/BUG-*.md`; refuted ones never count). */
export interface LevelBug {
  id: string;
  severity: BugSeverity;
  /** The area id it maps to, or null for `**Area:** none`. */
  area: string | null;
  verified: boolean;
}

export interface LevelInput {
  /** A quick session: the level is capped at `qualified`. */
  quick: boolean;
  areas: LevelArea[];
  bugs: LevelBug[];
}

const STATUS_GAP: Record<AreaStatus, GapCode | null> = {
  tested: null,
  partial: 'AREA_PARTIAL',
  blocked: 'AREA_BLOCKED',
  'not-tested': 'AREA_NOT_TESTED',
  deferred: 'AREA_DEFERRED',
};

const SEVERITY_ORDER: BugSeverity[] = ['critical', 'high', 'medium', 'low'];
const SEVERITY_LABEL: Record<BugSeverity, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

/** Code-unit order, the same on every machine (no locale). */
function byId<T extends { id: string }>(a: T, b: T): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function areaNumber(id: string): number {
  return Number(id.slice(1));
}

/** A gap with its keys always in the same order: code, area, bug, tier. */
function gap(code: GapCode, parts: { area?: string; bug?: string; tier?: RiskTier } = {}): CoverageGap {
  const g: CoverageGap = { code };
  if (parts.area !== undefined) g.area = parts.area;
  if (parts.bug !== undefined) g.bug = parts.bug;
  if (parts.tier !== undefined) g.tier = parts.tier;
  return g;
}

function ladder(areas: LevelArea[], gapCount: number, quick: boolean): CoverageLevelName {
  if (!areas.some((a) => a.status === 'tested')) return 'unassessed';
  if (areas.some((a) => (a.tier === 'P0' || a.tier === 'P1') && a.status !== 'tested')) return 'incomplete';
  if (gapCount > 0 || quick) return 'qualified';
  return 'complete';
}

/**
 * sha256 over the parsed inputs only — area id, tier and status, bug id,
 * severity, area and verification, and the quick cap — as canonical JSON
 * (arrays, sorted). Area reasons, feature names and raw bug text are left
 * out, so `finalize --redact` rewriting a file never makes the level stale.
 */
export function inputsDigest(input: LevelInput): string {
  const canonical = JSON.stringify({
    v: 1,
    quick: input.quick,
    areas: [...input.areas]
      .sort((a, b) => areaNumber(a.id) - areaNumber(b.id) || byId(a, b))
      .map((a) => [a.id, a.tier, a.status]),
    bugs: [...input.bugs]
      .sort(byId)
      .map((b) => [b.id, b.severity, b.area ?? 'none', b.verified ? 'verified' : 'unverified']),
  });
  return `sha256:${createHash('sha256').update(canonical).digest('hex')}`;
}

export function computeLevel(input: LevelInput): CoverageLevel {
  const tierOf = new Map(input.areas.map((a) => [a.id, a.tier] as const));
  const bugs = [...input.bugs].sort(byId);

  const gaps: CoverageGap[] = [];
  for (const a of input.areas) {
    const code = STATUS_GAP[a.status];
    if (code) gaps.push(gap(code, { area: a.id, tier: a.tier }));
  }
  for (const b of bugs) {
    const tier = b.area ? tierOf.get(b.area) : undefined;
    if (!b.area) gaps.push(gap('BUG_UNMAPPED', { bug: b.id }));
    if (!b.verified) {
      gaps.push(gap('BUG_UNVERIFIED', b.area && tier ? { area: b.area, bug: b.id, tier } : { bug: b.id }));
    }
  }

  const tiers = {} as CoverageLevel['tiers'];
  for (const t of RISK_TIERS) {
    const rows = input.areas.filter((a) => a.tier === t);
    // A bug with no area (BUG_UNMAPPED, and its BUG_UNVERIFIED) counts overall only.
    tiers[t] = rows.length ? ladder(rows, gaps.filter((g) => g.tier === t).length, input.quick) : 'n/a';
  }

  const highest = SEVERITY_ORDER.find((s) => bugs.some((b) => b.severity === s)) ?? null;
  return {
    level: ladder(input.areas, gaps.length, input.quick),
    tiers,
    findings: {
      highest_shipped: highest,
      unverified: bugs.filter((b) => !b.verified).length,
      on_p0: bugs.filter((b) => b.area !== null && tierOf.get(b.area) === 'P0').length,
    },
    gaps,
    inputs_digest: inputsDigest(input),
  };
}

// ─── Rendering ───────────────────────────────────────────────────────

function describeLevel(level: CoverageLevel, quick: boolean): string {
  switch (level.level) {
    case 'unassessed':
      return 'no charter area has been fully tested yet (a `partial` area does not count).';
    case 'incomplete':
      return 'at least one P0 or P1 area is not fully tested.';
    case 'qualified':
      return level.gaps.length
        ? `every P0 and P1 area is tested; the gaps below remain.${quick ? ' A quick session is capped here.' : ''}`
        : 'a quick session is capped here.';
    case 'complete':
      return 'every charter area is tested with evidence, and every shipped bug is verified and mapped to an area.';
  }
}

function raiseLine(g: CoverageGap, input: LevelInput): string {
  const where = g.area && g.tier ? `${g.area} (${g.tier})` : '';
  const cite = g.area ? `cite an \`${g.area}-…\` file under \`screenshots/\` or \`evidence/\`` : '';
  const bug = g.bug ? input.bugs.find((b) => b.id === g.bug) : undefined;
  const severity = bug ? SEVERITY_LABEL[bug.severity] : '';
  switch (g.code) {
    case 'AREA_PARTIAL':
      return `${where} is partial: finish it, ${cite}, and set it to \`tested\`.`;
    case 'AREA_BLOCKED':
      return `${where} is blocked: clear the blocker, test it, and ${cite}.`;
    case 'AREA_NOT_TESTED':
      return `${where} was not tested: test it and ${cite}.`;
    case 'AREA_DEFERRED':
      return input.quick
        ? `${where} was deferred by the time box: test it in a follow-up session.`
        : `${where} was deferred by the time box: test it in a follow-up session (\`/qa-explore --continue\` carries it forward).`;
    case 'BUG_UNVERIFIED':
      return `${g.bug} (${severity}${g.area ? `, ${g.area}` : ''}) is unverified: have the bug judge confirm it (a session with verification on).`;
    case 'BUG_UNMAPPED':
      return `${g.bug} (${severity}) maps to no area: give it \`**Area:** A<N>\`, adding a charter row for where it was found if there is none.`;
  }
}

/**
 * `evidence-level.md`: the confidentiality header, then the body the report
 * copies verbatim under `## Coverage Level` — the disclaimer, the level, the
 * tier table, the findings line, the gaps and the "To raise this level" list.
 * `###` headings at most, so the body sits under the report's own `##`.
 */
export function renderLevel(level: CoverageLevel, input: LevelInput): string {
  const lines: string[] = [CONFIDENTIALITY_HEADER_MD, '', LEVEL_DISCLAIMER, ''];
  lines.push(`**Coverage level: ${level.level}** — ${describeLevel(level, input.quick)}`, '');

  lines.push('### By risk tier', '', '| Tier | Level | Areas | Tested |', '|---|---|---|---|');
  for (const t of RISK_TIERS) {
    const rows = input.areas.filter((a) => a.tier === t);
    const tested = rows.filter((a) => a.status === 'tested').length;
    lines.push(`| ${t} | ${level.tiers[t]} | ${rows.length} | ${tested} |`);
  }
  lines.push('');

  const f = level.findings;
  const highest = f.highest_shipped ? SEVERITY_LABEL[f.highest_shipped] : 'none';
  lines.push(
    '### Findings',
    '',
    'Reported beside the level, never folded into it: ' +
      `highest shipped severity ${highest} · ${f.unverified} unverified · ${f.on_p0} on P0 areas.`,
    '',
  );

  lines.push('### Gaps', '');
  if (level.gaps.length === 0) {
    lines.push('None.', '');
  } else {
    lines.push('| Code | Area | Tier | Bug |', '|---|---|---|---|');
    for (const g of level.gaps) {
      lines.push(`| ${g.code} | ${g.area ?? '—'} | ${g.tier ?? '—'} | ${g.bug ?? '—'} |`);
    }
    lines.push('');
  }

  lines.push('### To raise this level', '');
  if (level.level === 'complete') {
    lines.push('Nothing — `complete` is the highest level.');
  } else {
    for (const g of level.gaps) lines.push(`- ${raiseLine(g, input)}`);
    if (input.quick) {
      lines.push('- A quick session is capped at `qualified`: run a full `/qa-explore` session to reach `complete`.');
    }
  }
  lines.push('');
  return lines.join('\n');
}

/**
 * Session-written text made safe for one backlog cell: NFKC-normalised (so a
 * full-width dot cannot hide a host), format, control and filler characters
 * dropped, whitespace collapsed, every URL cut to its path and every host and
 * secret replaced (`scrubForTransmission`), the query cut from a host-less path,
 * HTML angle brackets and markdown link syntax defused, capped, pipes escaped.
 */
export function backlogCell(raw: string, max: number): string {
  const flat = raw
    .normalize('NFKC')
    .replace(/[。．｡]/g, '.')
    .replace(/[\p{Cc}\p{Cf}︀-️\u{E0100}-\u{E01EF}ᅟᅠㅤﾠ]+/gu, ' ')
    .replace(/`/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 2000);
  let text = redact(scrubForTransmission(flat).text).text;
  text = text
    .replace(/([^\s?]*\/[^\s?]*)\?\S*/g, '$1')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\]\(/g, '] (');
  if (text.length > max) text = `${text.slice(0, max - 1).trimEnd()}…`;
  return escapeTableCell(text) || '—';
}

const BACKLOG_PREAMBLE = [
  CONFIDENTIALITY_HEADER_MD,
  '',
  '# Backlog',
  '',
  '_The charter areas this session did not test, rendered from `stats.json` by ' +
    '`qualiow session level --write`. Do not edit: re-run the command._',
  '',
].join('\n');

/** `backlog.md`: every charter area not `tested`, rendered from `coverage.areas`. */
export function renderBacklog(input: LevelInput): string {
  const lines: string[] = [BACKLOG_PREAMBLE];
  const open = input.areas.filter((a) => a.status !== 'tested');
  if (open.length === 0) {
    lines.push('Every charter area was tested.', '');
    return lines.join('\n');
  }
  lines.push('| ID | Tier | Feature | Status | Reason |', '|---|---|---|---|---|');
  for (const a of open) {
    lines.push(
      `| ${a.id} | ${a.tier} | ${backlogCell(a.feature, MAX_BACKLOG_FEATURE_CHARS)} | ${a.status} | ` +
        `${backlogCell(a.reason ?? '', MAX_BACKLOG_REASON_CHARS)} |`,
    );
  }
  lines.push('');
  return lines.join('\n');
}
