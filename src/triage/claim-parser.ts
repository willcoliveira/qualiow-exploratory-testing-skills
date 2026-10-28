/**
 * Parsers for the two Phase 7 verification artefacts: the claim card the judge
 * sees (`verification/claims/CLAIM-NNN.md`) and the verdict block it returns
 * (`verification/VERDICT-NNN.md`). Both formats are defined in
 * `.claude/skills/qa-explore/phases/07-reporting.md` and `qa-bug-judge.md`.
 */

import { extractSection, extractNumberedList } from '../utils/parse-session.js';
import type { JudgeVerdict, ParsedClaim, ParsedVerdict } from './types.js';

const PATH_TOKEN_RE =
  /(?:[A-Za-z]:\\|\/|\.{1,2}\/)?[\w.\-/\\]+\.(?:png|jpe?g|gif|webp|webm|mp4|json|md|ya?ml|log|txt|zip|csv)\b/gi;
const LABEL_ONLY_RE = /^(?:screenshots?|videos?|logs?|snapshots?|evidence|trace)$/i;

function field(content: string, name: string): string {
  const re = new RegExp(`^\\*\\*${name}:\\*\\*\\s*(.*)$`, 'mi');
  const m = re.exec(content);
  return m ? m[1].trim() : '';
}

function bullets(text: string): string[] {
  return text
    .split('\n')
    .map((l) => /^\s*[-*]\s+(.*)$/.exec(l)?.[1]?.trim() ?? '')
    .filter(Boolean);
}

export function parseClaimCard(content: string): ParsedClaim {
  const id = /^#\s+(CLAIM-\d+)\s*$/m.exec(content)?.[1] ?? '';
  const title = field(content, 'Title');
  const url = field(content, 'URL');
  const claimedSeverity = field(content, 'Claimed severity');
  const environment = field(content, 'Environment');
  const reproductionRate = field(content, 'Reproduction rate');
  const expected = extractSection(content, 'Expected Behavior');
  const actual = extractSection(content, 'Actual Behavior');
  const steps = extractNumberedList(extractSection(content, 'Steps to Reproduce'));

  const evidenceLines = bullets(extractSection(content, 'Evidence'));
  const evidencePaths: string[] = [];
  const inline: string[] = [];
  for (const rawLine of evidenceLines) {
    const line = rawLine.replace(/`/g, '');
    const tokens = line.match(PATH_TOKEN_RE) ?? [];
    for (const t of tokens) if (!evidencePaths.includes(t)) evidencePaths.push(t);
    let rest = line;
    for (const t of tokens) rest = rest.replace(t, ' ');
    rest = rest.replace(/\s+/g, ' ').trim();
    const stripped = rest.replace(/^[\s:\-–—()]+|[\s:\-–—()]+$/g, '');
    if (!stripped || LABEL_ONLY_RE.test(stripped)) continue;
    inline.push(rest);
  }

  return {
    id,
    complete: Boolean(id && title && actual && steps.length),
    title,
    url,
    claimedSeverity,
    environment,
    reproductionRate,
    expected,
    actual,
    steps,
    evidenceLines,
    evidencePaths,
    evidenceInline: inline.join('\n'),
  };
}

const SEVERITIES = ['Critical', 'High', 'Medium', 'Low'] as const;

function capSeverity(raw: string): string {
  const lower = raw.toLowerCase();
  return SEVERITIES.find((s) => s.toLowerCase() === lower) ?? raw;
}

export function normaliseJudgeVerdict(raw: string): JudgeVerdict | 'UNKNOWN' {
  const u = raw.trim().toUpperCase();
  if (u.startsWith('CONFIRMED-ADJUSTED')) return 'CONFIRMED-ADJUSTED';
  if (u.startsWith('CONFIRMED')) return 'CONFIRMED';
  if (u.startsWith('REFUTED')) return 'REFUTED';
  if (u.startsWith('UNREPRODUCIBLE')) return 'UNREPRODUCIBLE';
  if (u.startsWith('UNVERIFIED')) return 'UNVERIFIED';
  return 'UNKNOWN';
}

/** `agree with claimed High` → High; `adjusted to Medium — …` → Medium; `n/a` → null. */
export function parseSeverityField(raw: string | undefined): string | null | undefined {
  if (raw === undefined) return undefined;
  if (/^\s*n\/a/i.test(raw)) return null;
  const adjusted = /adjusted\s+to\s+(critical|high|medium|low)/i.exec(raw);
  if (adjusted) return capSeverity(adjusted[1]);
  const agree = /agree\w*\s+with\s+(?:the\s+)?claimed\s+(critical|high|medium|low)/i.exec(raw);
  if (agree) return capSeverity(agree[1]);
  const any = /\b(critical|high|medium|low)\b/i.exec(raw);
  return any ? capSeverity(any[1]) : null;
}

/**
 * `REPRO_COMMANDS:` — the one multi-line field: a command written on the key's own line,
 * then every following line indented by whitespace, up to the first line that is not
 * (the next `KEY:`, or the end of the block). Blank lines between commands are skipped.
 * Fields are looked up by name, never by position, so the block parses in any order.
 */
function multiLineField(body: string, key: string): string[] | undefined {
  const lines = body.split(/\r?\n/);
  const start = lines.findIndex((l) => l.startsWith(`${key}:`));
  if (start === -1) return undefined;
  const out: string[] = [];
  const inline = lines[start].slice(key.length + 1).trim();
  if (inline) out.push(inline);
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === '') continue;
    if (!/^[ \t]/.test(line)) break;
    out.push(line.trim());
  }
  return out;
}

export function parseVerdictBlock(content: string): ParsedVerdict {
  const fence = /```[a-z]*\r?\n([\s\S]*?)```/.exec(content);
  const body = fence ? fence[1] : content;
  const get = (key: string): string | undefined => {
    const m = new RegExp(`^${key}:\\s*(.*)$`, 'm').exec(body);
    return m ? m[1].trim() : undefined;
  };
  const verdictRaw = get('VERDICT') ?? '';
  const severityRaw = get('SEVERITY');
  const reproCommands = multiLineField(body, 'REPRO_COMMANDS');
  return {
    verdict: normaliseJudgeVerdict(verdictRaw),
    verdictRaw,
    fenced: Boolean(fence),
    method: get('METHOD'),
    confidence: get('CONFIDENCE'),
    severityRaw,
    severity: parseSeverityField(severityRaw),
    reproResult: get('REPRO_RESULT'),
    reasoning: get('REASONING'),
    falsePositivePattern: get('FALSE_POSITIVE_PATTERN'),
    ...(reproCommands === undefined ? {} : { reproCommands }),
  };
}
