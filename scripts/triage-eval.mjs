#!/usr/bin/env node
// Evaluation harness for the opt-in, advisory decision-model triage — repository
// tooling, never shipped. Scores each provider's per-claim prediction against the
// opus judge's verdict for one or more finished sessions and writes a summary.
//
//   node scripts/triage-eval.mjs <session-dir>... [--target <id>] [--reuse] [--repeat N]
//                                [--out <dir>] [--mock <json>] [--thresholds <json>]
//
// --reuse       read each session's existing verification/<STEM>-NNN.json instead of calling
// --repeat N    call N times per claim (self-consistency); ignored with --reuse
// --thresholds  a JSON object overriding DEFAULT_THRESHOLDS for the recorded reading
// --provider    typesafe | laya — run only this one of the providers the target lists
// --endpoint    override the Laya endpoint (loopback only)
//
// Output: <out>/results.jsonl (one line per claim × repeat, ids and numbers only — no claim
// text) and <out>/summary.md. Default <out> is output/review/triage-eval/<YYYY-MM-DD>/.
// Requires `npm run build` first. Live calls obey the same gate as `qualiow judge triage`.

import { resolve, dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync, readdirSync, mkdirSync, mkdtempSync, writeFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist', 'index.js');
if (!existsSync(dist)) {
  console.error('dist/index.js not found — run `npm run build` first');
  process.exit(1);
}
const {
  runJudgeTriage,
  parseVerdictBlock,
  parseClaimCard,
  route,
  DEFAULT_THRESHOLDS,
  CONFIDENTIALITY_HEADER_MD,
} = await import(dist);

// ─── args ────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const sessions = [];
const opts = { reuse: false, repeat: 1 };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--reuse') opts.reuse = true;
  else if (a === '--repeat') opts.repeat = Math.max(1, parseInt(args[++i], 10) || 1);
  else if (a === '--out') opts.out = args[++i];
  else if (a === '--target') opts.target = args[++i];
  else if (a === '--mock') opts.mock = args[++i];
  else if (a === '--thresholds') opts.thresholds = args[++i];
  else if (a === '--provider') opts.provider = args[++i];
  else if (a === '--endpoint') opts.endpoint = args[++i];
  else if (a === '--help' || a === '-h') {
    console.log(readFileSync(fileURLToPath(import.meta.url), 'utf-8').split('\n').slice(1, 17).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
    process.exit(0);
  } else sessions.push(a);
}
if (!sessions.length) {
  console.error('usage: node scripts/triage-eval.mjs <session-dir>... [--target <id>] [--reuse] [--repeat N] [--out <dir>] [--mock <json>] [--thresholds <json>] [--provider typesafe|laya] [--endpoint <url>]');
  process.exit(1);
}
const thresholds = opts.thresholds
  ? { ...DEFAULT_THRESHOLDS, ...JSON.parse(readFileSync(resolve(opts.thresholds), 'utf-8')) }
  : DEFAULT_THRESHOLDS;
const today = new Date().toISOString().slice(0, 10);
const outDir = resolve(opts.out ?? join(root, 'output', 'review', 'triage-eval', today));
mkdirSync(outDir, { recursive: true });
const resultsPath = join(outDir, 'results.jsonl');
writeFileSync(resultsPath, '');

// ─── collect ─────────────────────────────────────────────────────────

const CONFIRM = new Set(['CONFIRMED', 'CONFIRMED-ADJUSTED']);
const REFUTE = new Set(['REFUTED', 'UNREPRODUCIBLE']);
const SEV_RANK = { Critical: 3, High: 2, Medium: 1, Low: 0 };
const STEMS = ['JEV', 'LAYA'];

function toRow(session, nnn, rep, claim, verdict, triage) {
  const answers = triage.response?.answers ?? null;
  let decision = null;
  if (answers) {
    try {
      decision = route(answers, thresholds);
    } catch {
      decision = null;
    }
  }
  const pv = answers?.predicted_verdict;
  const nouls = answers
    ? Object.fromEntries(Object.entries(answers).filter(([, v]) => v.type === 'noul').map(([k, v]) => [k, v.noul]))
    : null;
  return {
    session,
    claim: `CLAIM-${nnn}`,
    provider: triage.provider ?? 'typesafe',
    rep,
    claimed_severity: claim.claimedSeverity,
    judge: verdict
      ? { verdict: verdict.verdict, method: verdict.method ?? null, confidence: verdict.confidence ?? null, severity: verdict.severity ?? null }
      : null,
    triage:
      answers && decision
        ? {
            verdict: decision.predictedVerdict,
            choice: pv.choice,
            probabilities: pv.probabilities,
            confidence: pv.confidence,
            nouls,
            severity_fit: answers.severity_fit?.choice ?? null,
            severity_confidence: answers.severity_fit?.confidence ?? null,
            route: decision.route,
            reasons: decision.reasons,
            refute_mass: decision.refuteMass,
          }
        : null,
    unavailable: triage.unavailable ?? null,
    usage: triage.usage ?? null,
    cost_usd: triage.costUsd ?? null,
    ms: triage.ms ?? null,
    model: triage.model ?? null,
  };
}

const rows = [];
let calls = 0;
for (const sessionArg of sessions) {
  const sessionDir = resolve(sessionArg);
  const claimsDir = join(sessionDir, 'verification', 'claims');
  if (!existsSync(claimsDir)) {
    console.warn(`skip ${sessionArg}: no verification/claims`);
    continue;
  }
  const sessionName = basename(sessionDir);
  for (const file of readdirSync(claimsDir).filter((f) => /^CLAIM-\d+\.md$/.test(f)).sort()) {
    const nnn = /(\d+)/.exec(file)[1];
    const claimFile = join(claimsDir, file);
    const claim = parseClaimCard(readFileSync(claimFile, 'utf-8'));
    if (!claim.complete) {
      console.warn(`skip ${sessionName}/${file}: stub card`);
      continue;
    }
    const verdictFile = join(sessionDir, 'verification', `VERDICT-${nnn}.md`);
    const verdict = existsSync(verdictFile) ? parseVerdictBlock(readFileSync(verdictFile, 'utf-8')) : null;
    const repeats = opts.reuse ? 1 : opts.repeat;
    for (let rep = 1; rep <= repeats; rep++) {
      const results = [];
      if (opts.reuse) {
        for (const stem of STEMS) {
          const p = join(sessionDir, 'verification', `${stem}-${nnn}.json`);
          if (existsSync(p)) results.push(JSON.parse(readFileSync(p, 'utf-8')));
        }
        if (!results.length) {
          console.warn(`skip ${sessionName}/${file}: no triage file (drop --reuse to call)`);
          continue;
        }
      } else {
        const scratch = mkdtempSync(join(tmpdir(), 'triage-eval-'));
        const r = await runJudgeTriage(
          claimFile,
          { target: opts.target, out: scratch, mock: opts.mock, provider: opts.provider, endpoint: opts.endpoint },
          { cwd: root },
        );
        calls++;
        for (const p of r.providers ?? []) results.push(JSON.parse(readFileSync(p.jsonPath, 'utf-8')));
        process.stderr.write(`${sessionName}/${file} rep ${rep}: ${r.predictedVerdict} ${r.route ?? ''} ${r.ms ?? '?'} ms\n`);
      }
      for (const triage of results) {
        const row = toRow(sessionName, nnn, rep, claim, verdict, triage);
        rows.push(row);
        appendFileSync(resultsPath, `${JSON.stringify(row)}\n`);
      }
    }
  }
}

// ─── score ───────────────────────────────────────────────────────────

const pct = (n, d) => (d ? `${((100 * n) / d).toFixed(0)}% (${n}/${d})` : 'n/a');
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const median = (xs) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const stddev = (xs) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};
function wilson(k, n, z = 1.96) {
  if (!n) return 'n/a';
  const p = k / n;
  const denom = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return `${(100 * p).toFixed(0)}% [${(100 * Math.max(0, centre - half)).toFixed(0)}–${(100 * Math.min(1, centre + half)).toFixed(0)}]`;
}
const fmt = (n, d = 2) => (Number.isFinite(n) ? n.toFixed(d) : 'n/a');
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s);

function scoreProvider(provider, providerRows) {
  const scored = providerRows.filter((r) => r.triage);
  const labelled = scored.filter((r) => r.judge && (CONFIRM.has(r.judge.verdict) || REFUTE.has(r.judge.verdict)));
  const firstRep = (list) => list.filter((r) => r.rep === 1);
  const L = firstRep(labelled);

  const twoClass = L.map((r) => ({ judgeRefute: REFUTE.has(r.judge.verdict), triageRefute: REFUTE.has(r.triage.verdict), r }));
  const agree2 = twoClass.filter((x) => x.judgeRefute === x.triageRefute).length;
  const agree4 = L.filter((r) => r.triage.verdict === r.judge.verdict).length;
  const tp = twoClass.filter((x) => x.judgeRefute && x.triageRefute).length;
  const fp = twoClass.filter((x) => !x.judgeRefute && x.triageRefute).length;
  const fn = twoClass.filter((x) => x.judgeRefute && !x.triageRefute).length;
  const tn = twoClass.filter((x) => !x.judgeRefute && !x.triageRefute).length;

  const sweep = [];
  for (let thr = 0.2; thr <= 0.6001; thr += 0.05) {
    const t = Number(thr.toFixed(2));
    const pred = twoClass.map((x) => ({ ...x, predRefute: x.r.triage.refute_mass >= t }));
    const stp = pred.filter((x) => x.judgeRefute && x.predRefute).length;
    const sfp = pred.filter((x) => !x.judgeRefute && x.predRefute).length;
    const sfn = pred.filter((x) => x.judgeRefute && !x.predRefute).length;
    sweep.push({ t, tp: stp, fp: sfp, fn: sfn, precision: wilson(stp, stp + sfp), recall: wilson(stp, stp + sfn) });
  }

  const sevRows = L.filter((r) => r.judge.severity && r.triage.severity_fit);
  const sevExact = sevRows.filter((r) => cap(r.triage.severity_fit) === r.judge.severity).length;
  const sevNear = sevRows.filter((r) => Math.abs(SEV_RANK[cap(r.triage.severity_fit)] - SEV_RANK[r.judge.severity]) <= 1).length;

  const buckets = [
    [0.0, 0.5],
    [0.5, 0.6],
    [0.6, 0.7],
    [0.7, 0.8],
    [0.8, 0.9],
    [0.9, 1.01],
  ].map(([lo, hi]) => {
    const inB = twoClass.filter((x) => x.r.triage.confidence >= lo && x.r.triage.confidence < hi);
    const ok = inB.filter((x) => x.judgeRefute === x.triageRefute).length;
    return { range: `${lo.toFixed(1)}–${Math.min(hi, 1).toFixed(1)}`, n: inB.length, accuracy: pct(ok, inB.length) };
  });

  const msList = scored.map((r) => r.ms).filter((x) => typeof x === 'number');
  const tokList = scored.map((r) => r.usage?.input_tokens).filter((x) => typeof x === 'number');
  const costList = scored.map((r) => r.cost_usd).filter((x) => typeof x === 'number');

  const groups = new Map();
  for (const r of scored) {
    const k = `${r.session}/${r.claim}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  const consistency = [];
  for (const [k, list] of groups) {
    if (list.length < 2) continue;
    const perQuestion = {};
    for (const id of Object.keys(list[0].triage.nouls)) perQuestion[id] = stddev(list.map((r) => r.triage.nouls[id] ?? 0));
    perQuestion.refute_mass = stddev(list.map((r) => r.triage.refute_mass));
    const values = Object.values(perQuestion);
    consistency.push({ k, n: list.length, mean: mean(values), max: Math.max(...values), worst: Object.entries(perQuestion).sort((a, b) => b[1] - a[1])[0] });
  }

  const readings = { 'refute-risk': 0, unclear: 0, 'likely-confirmed': 0 };
  for (const r of firstRep(scored)) readings[r.triage.route] = (readings[r.triage.route] ?? 0) + 1;
  const unflagged = L.filter((r) => r.triage.route !== 'refute-risk' && REFUTE.has(r.judge.verdict));
  const unavailable = providerRows.filter((r) => r.unavailable).length;

  return [
    `## Provider: ${provider}`,
    '',
    `Rows: ${providerRows.length} (${scored.length} answered, ${unavailable} unavailable, ${labelled.length} labelled by a judge verdict)`,
    '',
    '### Agreement with the judge (first repetition, labelled claims)',
    '',
    `- 2-class (confirm vs refute/unreproducible): ${pct(agree2, L.length)}`,
    `- 4-class (exact verdict): ${pct(agree4, L.length)}`,
    '',
    '| | judge refutes | judge confirms |',
    '|---|---|---|',
    `| triage predicts refute | ${tp} | ${fp} |`,
    `| triage predicts confirm | ${fn} | ${tn} |`,
    '',
    `- "refuted" at argmax: precision ${wilson(tp, tp + fp)} · recall ${wilson(tp, tp + fn)} (Wilson 95%; counts are small — read the raw numbers)`,
    '',
    '#### refuteMass sweep',
    '',
    '| threshold | tp | fp | fn | precision | recall |',
    '|---|---|---|---|---|---|',
    ...sweep.map((s) => `| ${s.t.toFixed(2)} | ${s.tp} | ${s.fp} | ${s.fn} | ${s.precision} | ${s.recall} |`),
    '',
    '### Severity',
    '',
    `- vs the judge's final severity: exact ${pct(sevExact, sevRows.length)} · within one level ${pct(sevNear, sevRows.length)}`,
    '',
    '### Confidence vs accuracy (predicted_verdict, 2-class)',
    '',
    '| confidence | n | accuracy |',
    '|---|---|---|',
    ...buckets.map((b) => `| ${b.range} | ${b.n} | ${b.accuracy} |`),
    '',
    '### Cost and latency per claim',
    '',
    `- latency ms: mean ${fmt(mean(msList), 0)} · median ${fmt(median(msList), 0)} · total ${fmt(msList.reduce((a, b) => a + b, 0), 0)}`,
    `- input tokens: mean ${fmt(mean(tokList), 0)} · total ${tokList.reduce((a, b) => a + b, 0)}`,
    `- cost USD: mean ${fmt(mean(costList), 6)} · total ${fmt(costList.reduce((a, b) => a + b, 0), 6)}`,
    '',
    '### Self-consistency (repeats)',
    '',
    consistency.length
      ? [
          '| claim | n | mean std dev | max std dev | most volatile |',
          '|---|---|---|---|---|',
          ...consistency.map((c) => `| ${c.k} | ${c.n} | ${fmt(c.mean, 4)} | ${fmt(c.max, 4)} | ${c.worst[0]} (${fmt(c.worst[1], 4)}) |`),
          '',
          `Overall mean per-question std dev: ${fmt(mean(consistency.map((c) => c.mean)), 4)}`,
        ].join('\n')
      : '_One repetition only — run without --reuse and with --repeat N to measure it._',
    '',
    '### Recorded readings (first repetition)',
    '',
    `- refute-risk: ${readings['refute-risk']} · unclear: ${readings.unclear} · likely-confirmed: ${readings['likely-confirmed']}`,
    `- judge refutations the triage did not flag as refute-risk: ${unflagged.length}${unflagged.length ? ' — ' + unflagged.map((r) => `${r.session}/${r.claim}`).join(', ') : ''}`,
    '',
  ];
}

// ─── summary.md ──────────────────────────────────────────────────────

const byProvider = new Map();
for (const r of rows) {
  if (!byProvider.has(r.provider)) byProvider.set(r.provider, []);
  byProvider.get(r.provider).push(r);
}

const lines = [
  CONFIDENTIALITY_HEADER_MD,
  '',
  `# Decision-model triage evaluation — ${today}`,
  '',
  `Sessions: ${sessions.map((s) => basename(resolve(s))).join(', ')}`,
  `Rows: ${rows.length} (${opts.reuse ? 'reused' : `${calls} triage runs`}, repeat ${opts.reuse ? 1 : opts.repeat})`,
  `Thresholds: ${JSON.stringify(thresholds)}`,
  '',
  ...[...byProvider].flatMap(([provider, list]) => scoreProvider(provider, list)),
  `Rows: \`${resultsPath}\` (ids and numbers only; no claim text).`,
  '',
];
writeFileSync(join(outDir, 'summary.md'), lines.join('\n'));
console.log(lines.slice(2).join('\n'));
console.log(`\nwritten: ${join(outDir, 'summary.md')}`);
