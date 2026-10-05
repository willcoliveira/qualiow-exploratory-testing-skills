/**
 * Session contract 2 — the checks a `/qa-explore` or `/qa-explore-quick`
 * session opts into with `"contract": 2` in `stats.json`.
 *
 * Pure: the charter text, the raw stats object and the parsed bugs come in;
 * the only disk access is through the `resolveEvidence` callback the caller
 * passes (`src/utils/session-paths.ts` in the CLI, a stub in tests). Fail
 * closed: anything thrown while evaluating becomes a violation, never a pass.
 *
 * The contract, in one place:
 * - charter.md `## Feature Risk Ranking`: `| ID | Feature | Risk | … |`, IDs
 *   `A1`, `A2`, … unique, Risk starting P0–P3 (bold and backticks allowed),
 *   1–40 rows, one contiguous table;
 * - stats.json `coverage.areas`: exactly one entry per risk row
 *   `{ id, status, evidence, reason? }`; every status but `tested` gives a
 *   reason (≤ 160 chars, one line, no URL); `tested` and `partial` cite an
 *   `A<N>-…` file under `screenshots/` or `evidence/`; every evidence path
 *   resolves (`resolveEvidence`); at most 40 areas, 20 paths each, 400 in all;
 * - every shipped bug (`bugs/BUG-*.md`) carries `**Area:** A<N>` or
 *   `**Area:** none`, and never maps to an area that was not tested.
 */

import { extractSection } from '../utils/parse-session.js';
import { parseMarkdownTable, splitTableRow } from '../utils/markdown-table.js';
import {
  AREA_EVIDENCE_DIRS,
  MAX_AREAS,
  MAX_EVIDENCE_PER_AREA,
  MAX_EVIDENCE_TOTAL,
  type EvidenceResult,
} from '../utils/session-paths.js';
import {
  AREA_ID_RE,
  AREA_STATUSES,
  BUG_ID_RE,
  MAX_AREA_REASON_CHARS,
} from '../schemas/session-metrics.schema.js';
import type { AreaStatus, BugSeverity, CoverageArea, RiskTier } from '../types/index.js';
import type { LevelArea, LevelBug, LevelInput } from './coverage-level.js';

export const RISK_TABLE_HEADING = 'Feature Risk Ranking';
export const MAX_RISK_ROWS = MAX_AREAS;
/** Session kinds that may write `"contract": 2`. */
export const CONTRACT2_KINDS = ['explore', 'quick'] as const;

export interface RiskRow {
  id: string;
  tier: RiskTier;
  /** The Feature cell as written. */
  feature: string;
}

/** What contract 2 reads of one shipped bug. */
export interface ContractBug {
  id: string;
  severity: BugSeverity;
  /** The `**Area:**` value as written, or null when the line is absent. */
  area: string | null;
  verification: 'verified' | 'unverified';
}

export interface Contract2Input {
  /** `stats.kind`, else the kind in the directory name. */
  kind: string | undefined;
  /** charter.md, or null when it is missing. */
  charter: string | null;
  /** stats.json as parsed JSON — never the schema output. */
  stats: Record<string, unknown>;
  bugs: ContractBug[];
}

export interface Contract2Evaluation {
  violations: string[];
  rows: RiskRow[];
  areas: CoverageArea[];
  /** The level's inputs, present only when there is no violation. */
  input?: LevelInput;
}

export type EvidenceResolver = (path: unknown) => EvidenceResult;

/** A short, quoted rendering of a value the session wrote, for a violation message. */
function show(value: unknown): string {
  const s = typeof value === 'string' ? value : JSON.stringify(value) ?? String(value);
  return JSON.stringify(s.length > 40 ? `${s.slice(0, 40)}…` : s);
}

/** A cell with bold markers and backticks removed. */
function stripCell(cell: string | undefined): string {
  return (cell ?? '').replace(/[*`]/g, '').trim();
}

function isSeparatorLine(line: string): boolean {
  const t = line.trim();
  return t.startsWith('|') && /^[|\s:-]+$/.test(t) && t.includes('--');
}

/** A template placeholder row: every cell `...`, `…` or empty. */
function isEllipsisRow(cells: string[]): boolean {
  return cells.some((c) => c !== '') && cells.every((c) => c === '' || /^(?:\.{3}|…)$/.test(stripCell(c)));
}

// ─── Charter ─────────────────────────────────────────────────────────

/**
 * The charter's `## Feature Risk Ranking` table, one row per area. Rows may
 * be appended in any phase; a row is never renumbered or removed.
 */
export function parseRiskTable(charter: string): { rows: RiskRow[]; ids: string[]; violations: string[] } {
  const violations: string[] = [];
  const rows: RiskRow[] = [];
  /** Every well-formed ID in the table, including a row whose Risk cell is wrong. */
  const ids: string[] = [];
  const table = parseMarkdownTable(charter, { headingPrefix: RISK_TABLE_HEADING });
  if (!table) {
    violations.push(
      'charter.md has no `## Feature Risk Ranking` table — add one: `| ID | Feature | Risk | Why | Time |` ' +
        '(quick: `| ID | Feature | Risk |`)',
    );
    return { rows, ids, violations };
  }

  // Row objects are keyed by the lower-cased header as written; find each
  // column by its text with any bold or backticks removed.
  const keyOf = (name: string): string | undefined => {
    const i = table.headers.findIndex((h) => stripCell(h).toLowerCase() === name);
    return i === -1 ? undefined : table.headers[i].toLowerCase();
  };
  const idKey = keyOf('id');
  const featureKey = keyOf('feature');
  const riskKey = keyOf('risk');
  if (!idKey) violations.push('charter.md: the Feature Risk Ranking table has no ID column — add `ID` as its first column (A1, A2, …)');
  if (!featureKey) violations.push('charter.md: the Feature Risk Ranking table has no Feature column');
  if (!riskKey) violations.push('charter.md: the Feature Risk Ranking table has no Risk column');
  if (!idKey || !featureKey || !riskKey) return { rows, ids, violations };

  const dataRows = table.rows.filter((r) => !isEllipsisRow(table.headers.map((h) => r[h.toLowerCase()] ?? '')));
  if (dataRows.length === 0) {
    violations.push('charter.md: the Feature Risk Ranking table has no rows');
    return { rows, ids, violations };
  }
  if (dataRows.length > MAX_RISK_ROWS) {
    violations.push(`charter.md: the Feature Risk Ranking table has ${dataRows.length} rows — at most ${MAX_RISK_ROWS}`);
  }

  // The parser stops at the first line that is not a table line; a row below
  // a blank line would silently drop out of the contract. Counted up to the
  // next heading of any level, where the parser stops looking too.
  const sectionLines = extractSection(charter, RISK_TABLE_HEADING).split('\n');
  const nextHeading = sectionLines.findIndex((l) => /^#{1,6}\s/.test(l));
  const sectionRows = (nextHeading === -1 ? sectionLines : sectionLines.slice(0, nextHeading))
    .filter((l) => l.trim().startsWith('|') && !isSeparatorLine(l) && splitTableRow(l).some((c) => c !== ''));
  // A prose line with a `|` directly under the table is read as one more row; name
  // that cause, or its bogus "ID" sends the fix to the wrong place.
  const block = nextHeading === -1 ? sectionLines : sectionLines.slice(0, nextHeading);
  const first = block.findIndex((l) => l.trim().startsWith('|'));
  for (let i = first; first !== -1 && i < block.length && block[i].includes('|'); i++) {
    if (!block[i].trim().startsWith('|')) {
      violations.push(
        'charter.md: a line directly under the Feature Risk Ranking table contains `|` but is not a table row — ' +
          'leave a blank line between the table and any text',
      );
      break;
    }
  }
  const unread = sectionRows.length - 1 - table.rows.length;
  if (unread > 0) {
    violations.push(
      `charter.md: the Feature Risk Ranking table is split — ${unread} row(s) below a blank or non-table line are not read; ` +
        'keep the table in one block',
    );
  }

  const seen = new Set<string>();
  dataRows.forEach((r, i) => {
    const id = stripCell(r[idKey]);
    if (!AREA_ID_RE.test(id)) {
      violations.push(`charter.md: risk row ${i + 1} has ID ${show(id)} — IDs are A1, A2, …`);
      return;
    }
    if (seen.has(id)) {
      violations.push(`charter.md: risk row ID ${id} appears more than once — an ID names one area`);
      return;
    }
    seen.add(id);
    ids.push(id);
    const risk = stripCell(r[riskKey]);
    const m = /^P([0-3])(?![0-9])/i.exec(risk);
    if (!m) {
      violations.push(`charter.md: ${id} has risk ${show(risk)} — the Risk cell starts with P0, P1, P2 or P3`);
      return;
    }
    rows.push({ id, tier: `P${m[1]}` as RiskTier, feature: r[featureKey] ?? '' });
  });

  return { rows, ids, violations };
}

// ─── stats.json coverage.areas ───────────────────────────────────────

const AREA_KEYS = new Set(['id', 'status', 'evidence', 'reason']);

/** `stats.coverage.areas`, validated entry by entry. */
export function parseAreas(coverage: unknown): { areas: CoverageArea[]; violations: string[] } {
  const violations: string[] = [];
  const areas: CoverageArea[] = [];
  const list =
    coverage && typeof coverage === 'object' && !Array.isArray(coverage)
      ? (coverage as Record<string, unknown>).areas
      : undefined;
  if (!Array.isArray(list)) {
    violations.push(
      'stats.json: coverage.areas is missing — a contract-2 session lists one { id, status, evidence, reason } per charter risk row',
    );
    return { areas, violations };
  }
  if (list.length > MAX_AREAS) {
    violations.push(`stats.json: coverage.areas has ${list.length} entries — at most ${MAX_AREAS}`);
  }

  const seen = new Set<string>();
  let total = 0;
  list.forEach((entry, i) => {
    const at = `stats.json: coverage.areas[${i}]`;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      violations.push(`${at} is not an object`);
      return;
    }
    const e = entry as Record<string, unknown>;
    const id = e.id;
    if (typeof id !== 'string' || !AREA_ID_RE.test(id)) {
      violations.push(`${at} has id ${show(id)} — area IDs are the charter's A1, A2, …`);
      return;
    }
    const where = `stats.json: area ${id}`;
    if (seen.has(id)) {
      violations.push(`${where} appears more than once in coverage.areas`);
      return;
    }
    seen.add(id);
    let ok = true;
    for (const key of Object.keys(e)) {
      if (!AREA_KEYS.has(key)) {
        violations.push(`${where} has unknown key ${show(key)} — allowed: id, status, evidence, reason`);
        ok = false;
      }
    }
    const status = e.status;
    if (typeof status !== 'string' || !(AREA_STATUSES as readonly string[]).includes(status)) {
      violations.push(`${where} has status ${show(status)} — one of ${AREA_STATUSES.join(', ')}`);
      ok = false;
    }
    const evidence = e.evidence;
    if (!Array.isArray(evidence) || evidence.some((p) => typeof p !== 'string')) {
      violations.push(`${where}: evidence must be a list of paths ([] when there is none)`);
      ok = false;
    } else {
      total += evidence.length;
      if (evidence.length > MAX_EVIDENCE_PER_AREA) {
        violations.push(`${where} cites ${evidence.length} evidence files — at most ${MAX_EVIDENCE_PER_AREA}`);
        ok = false;
      }
    }
    const reason = e.reason;
    if (reason !== undefined) {
      if (typeof reason !== 'string') {
        violations.push(`${where}: reason must be a string`);
        ok = false;
      } else if (reason.length > MAX_AREA_REASON_CHARS) {
        violations.push(`${where}: reason is ${reason.length} characters — at most ${MAX_AREA_REASON_CHARS}`);
        ok = false;
      } else if (reason.includes('://')) {
        violations.push(`${where}: reason contains a URL — describe it without one`);
        ok = false;
      } else if (/[\p{Cc}]/u.test(reason)) {
        violations.push(`${where}: reason must be one line of text`);
        ok = false;
      }
    }
    if (typeof status === 'string' && status !== 'tested' && (typeof reason !== 'string' || reason.trim() === '')) {
      violations.push(`${where} is ${status} without a reason — say why in at most ${MAX_AREA_REASON_CHARS} characters`);
      ok = false;
    }
    if (ok) {
      areas.push({
        id,
        status: status as AreaStatus,
        evidence: evidence as string[],
        ...(typeof reason === 'string' ? { reason } : {}),
      });
    }
  });
  if (total > MAX_EVIDENCE_TOTAL) {
    violations.push(`stats.json: coverage.areas cites ${total} evidence files in all — at most ${MAX_EVIDENCE_TOTAL}`);
  }
  return { areas, violations };
}

// ─── Whole session ───────────────────────────────────────────────────

const UNTESTED_FOR_BUGS = new Set<AreaStatus>(['not-tested', 'blocked', 'deferred']);

function evaluate(input: Contract2Input, resolveEvidence: EvidenceResolver): Contract2Evaluation {
  const violations: string[] = [];
  const kind = input.kind ?? '';
  if (!(CONTRACT2_KINDS as readonly string[]).includes(kind)) {
    violations.push(
      `stats.json: contract 2 is explore/quick only — a ${kind || 'session without a kind'} session never writes "contract": 2`,
    );
    return { violations, rows: [], areas: [] };
  }

  let rows: RiskRow[] = [];
  let charterIds: string[] = [];
  if (input.charter === null) {
    violations.push('charter.md is missing — contract 2 reads the areas from its Feature Risk Ranking table');
  } else {
    const parsed = parseRiskTable(input.charter);
    rows = parsed.rows;
    charterIds = parsed.ids;
    violations.push(...parsed.violations);
  }

  const { areas, violations: areaViolations } = parseAreas(input.stats.coverage);
  violations.push(...areaViolations);

  // Rows and areas, one to one. Only cross-checked when both parsed cleanly
  // enough to have content, so a missing table is not reported twice per row.
  const rowIds = new Set(charterIds);
  const areaById = new Map(areas.map((a) => [a.id, a] as const));
  if (rowIds.size && Array.isArray((input.stats.coverage as Record<string, unknown> | undefined)?.areas)) {
    const listed = new Set(
      ((input.stats.coverage as Record<string, unknown>).areas as unknown[]).map((e) =>
        e && typeof e === 'object' ? (e as Record<string, unknown>).id : undefined,
      ),
    );
    for (const id of charterIds) {
      if (!listed.has(id)) violations.push(`charter row ${id} has no coverage.areas entry in stats.json`);
    }
    for (const a of areas) {
      if (!rowIds.has(a.id)) violations.push(`stats.json: area ${a.id} is not a row of the charter's Feature Risk Ranking`);
    }
  }

  // Evidence — skipped entirely past the caps, which are violations already.
  const total = areas.reduce((n, a) => n + a.evidence.length, 0);
  if (areas.length <= MAX_AREAS && total <= MAX_EVIDENCE_TOTAL) {
    for (const a of areas) {
      let hasAreaFile = false;
      for (const p of a.evidence) {
        const r = resolveEvidence(p);
        if (!r.ok) {
          violations.push(`stats.json: area ${a.id} evidence ${show(p)} ${r.reason}`);
          continue;
        }
        if ((AREA_EVIDENCE_DIRS as readonly string[]).includes(r.top) && r.base.startsWith(`${a.id}-`)) {
          hasAreaFile = true;
        }
      }
      if ((a.status === 'tested' || a.status === 'partial') && !hasAreaFile) {
        violations.push(
          `stats.json: area ${a.id} is ${a.status} but cites no \`${a.id}-…\` file under screenshots/ or evidence/ — ` +
            `take \`screenshots/${a.id}-<slug>.png\` when the area is done and list it`,
        );
      }
    }
  }

  // Shipped bugs.
  const bugs: LevelBug[] = [];
  for (const b of [...input.bugs].sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0))) {
    const file = `bugs/${b.id}.md`;
    if (!BUG_ID_RE.test(b.id)) {
      violations.push(`${show(file)}: the file name is not BUG-<id> (letters, digits and dashes)`);
      continue;
    }
    if (b.area === null) {
      violations.push(
        `${file} has no **Area:** line — add \`**Area:** A<N>\` (the risk row it was found in) or \`**Area:** none\``,
      );
      continue;
    }
    if (b.area.toLowerCase() === 'none') {
      bugs.push({ id: b.id, severity: b.severity, area: null, verified: b.verification === 'verified' });
      continue;
    }
    if (!AREA_ID_RE.test(b.area)) {
      violations.push(`${file}: **Area:** ${show(b.area)} is not an area ID — write exactly A<N> or none`);
      continue;
    }
    if (!rowIds.has(b.area)) {
      violations.push(`${file} maps to ${b.area}, which is not a row of the charter's Feature Risk Ranking`);
      continue;
    }
    const area = areaById.get(b.area);
    if (area && UNTESTED_FOR_BUGS.has(area.status)) {
      violations.push(
        `${file} maps to ${b.area}, which is ${area.status} — a bug found there means the area was at least ` +
          'partially tested: set it to partial or tested, with its evidence',
      );
      continue;
    }
    bugs.push({ id: b.id, severity: b.severity, area: b.area, verified: b.verification === 'verified' });
  }

  if (violations.length) return { violations, rows, areas };

  const levelAreas: LevelArea[] = rows.map((r) => {
    const a = areaById.get(r.id) as CoverageArea;
    return {
      id: r.id,
      tier: r.tier,
      status: a.status,
      feature: r.feature,
      ...(a.reason !== undefined ? { reason: a.reason } : {}),
    };
  });
  return { violations, rows, areas, input: { quick: kind === 'quick', areas: levelAreas, bugs } };
}

/**
 * Runs every contract-2 check over one session's parsed inputs. On success
 * the result carries the level's inputs; on any violation, or anything
 * thrown, it carries none — a session is never passed by an error.
 */
export function evaluateContract2(input: Contract2Input, resolveEvidence: EvidenceResolver): Contract2Evaluation {
  try {
    return evaluate(input, resolveEvidence);
  } catch (err) {
    return {
      violations: [`contract 2 could not be evaluated: ${err instanceof Error ? err.message : String(err)}`],
      rows: [],
      areas: [],
    };
  }
}
