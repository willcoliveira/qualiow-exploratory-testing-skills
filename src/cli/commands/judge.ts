/**
 * `qualiow judge triage <claim-file>` — opt-in, advisory decision-model triage
 * of ONE claim card, run by Phase 7 of /qa-explore before the adversarial
 * judge. The judge still sees every claim and never reads what this writes.
 *
 * Off by default. A live run sends nothing unless the resolved target config
 * sets `verification.mode: triage-shadow` and lists the provider:
 * - `typesafe` (hosted) also needs its API key under the env var the config
 *   names (default `TYPESAFE_API_KEY`, read from the environment, `qa/.env`,
 *   then `.env`);
 * - `laya` (self-hosted) must point at a loopback endpoint.
 * `--provider` only narrows the target's own list; it can never add a provider
 * the target did not name. The card must resolve (symlinks included) to
 * `<cwd>/output/sessions/<dir>/verification/claims/CLAIM-NNN.md` in a real
 * session directory. What leaves the machine is written verbatim to
 * `verification/<STEM>-NNN.json`; the human block goes to `<STEM>-NNN.md`.
 *
 * Exit codes: 0 triaged (or --dry-run) · 1 usage / unparseable card ·
 * 2 not enabled for this target or key missing (nothing sent) ·
 * 3 every provider unavailable after retries (files written with `UNAVAILABLE`).
 */

import { Command } from 'commander';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import chalk from 'chalk';
import { parse as parseYaml } from 'yaml';
import { TargetConfigSchema } from '../../schemas/target.schema.js';
import { readEnvVar, resolveTargetPath } from '../../utils/paths.js';
import { CONFIDENTIALITY_HEADER_MD } from '../../utils/confidentiality.js';
import { parseClaimCard } from '../../triage/claim-parser.js';
import {
  JEV_ENDPOINT,
  JEV_MODEL,
  LAYA_DEFAULT_ENDPOINT,
  LAYA_DEFAULT_MAX_LEN,
  LAYA_DEFAULT_MODEL,
  TriageApiError,
  assertResponse,
  callSystemOne,
  estimateCostUsd,
  isLoopbackEndpoint,
} from '../../triage/client.js';
import {
  DEFAULT_EVIDENCE_MAX_LINES,
  DEFAULT_THRESHOLDS,
  buildQuestionSet,
  buildTriageState,
  collectEvidence,
  fitStateToBudget,
  loadFalsePositivePatterns,
  MAX_SESSION_TEXT_BYTES,
  describeSent,
  readCapped,
  renderTriageBlock,
  resolveClaimLocation,
  route,
} from '../../triage/triage.js';
import type {
  EvidenceFile,
  EvidenceSkipped,
  Route,
  RouteDecision,
  SystemOneRequest,
  SystemOneResponse,
  TriageMode,
  TriageQuestion,
  TriageResult,
  TriageState,
  TriageUsage,
} from '../../triage/types.js';
import type { TriageProvider, VerificationConfig } from '../../types/index.js';

export const EXIT_NOT_ENABLED = 2;
export const EXIT_UNAVAILABLE = 3;
export const DEFAULT_KEY_ENV = 'TYPESAFE_API_KEY';
const MODE: TriageMode = 'triage-shadow';

/** The target does not opt in, or the key is missing. Nothing was sent. */
export class TriageNotEnabledError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TriageNotEnabledError';
  }
}

export interface JudgeTriageOptions {
  target?: string;
  out?: string;
  evidenceMaxLines?: number;
  dryRun?: boolean;
  mock?: string;
  /** Run only this one of the providers the target lists. Never adds a provider. */
  provider?: TriageProvider;
  /** Overrides `verification.laya.endpoint` (loopback only). */
  endpoint?: string;
}

export interface JudgeTriageResult {
  ok: boolean;
  exitCode: 0 | typeof EXIT_UNAVAILABLE;
  claimId: string;
  mode: TriageMode;
  route: Route | null;
  predictedVerdict: string;
  block: string;
  /** What the command prints: the block and the `<STEM>_FILE:` line, or the dry-run summary. */
  stdout: string;
  mdPath?: string;
  jsonPath?: string;
  usage?: TriageUsage;
  costUsd?: number;
  ms?: number;
  evidenceSent: Array<Omit<EvidenceFile, 'text'>>;
  evidenceNotSent: EvidenceSkipped[];
  redactions: string[];
  stateChars: number;
  /** One entry per provider that ran (in config order); the top-level fields mirror the first that answered. */
  providers?: Array<{
    provider: TriageProvider;
    verdict: string;
    route: Route | null;
    mdPath: string;
    jsonPath: string;
    ms?: number;
  }>;
  /** Providers the config lists that could not run here, with the reason. */
  skipped?: Array<{ provider: TriageProvider; reason: string }>;
}

export interface JudgeTriageContext {
  cwd: string;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

// ─── Command ─────────────────────────────────────────────────────────

export function judgeCommand(): Command {
  const cmd = new Command('judge').description(
    'Candidate-bug verification helpers for Phase 7 of /qa-explore (opt-in decision-model triage)',
  );

  cmd
    .command('triage')
    .description(
      'Ask a decision model typed questions about ONE claim card and its text evidence. Advisory only. ' +
        'Off unless the target config sets verification.mode: triage-shadow and lists the provider. ' +
        'Exit 2 = not enabled (nothing sent), 3 = unavailable.',
    )
    .argument('<claim-file>', 'verification/claims/CLAIM-NNN.md')
    .option('--target <id>', 'Target whose verification block gates the send (default: qa/target.yml)')
    .option('--out <dir>', 'Where <STEM>-NNN.md/.json are written (default: the verification/ directory)')
    .option(
      '--evidence-max-lines <n>',
      `Lines sent per evidence file (default: verification.evidence_max_lines or ${DEFAULT_EVIDENCE_MAX_LINES})`,
      (v: string) => parseInt(v, 10),
    )
    .option('--dry-run', 'Build the state, print what would be sent, send nothing, write nothing', false)
    .option('--mock <json>', 'Use this file as the response instead of calling any provider (sends nothing)')
    .option('--provider <name>', 'typesafe | laya — run only this one of the providers the target lists')
    .option('--endpoint <url>', 'Override verification.laya.endpoint (loopback only)')
    .action(async (claimFile: string, options: JudgeTriageOptions) => {
      try {
        const result = await runJudgeTriage(claimFile, options, { cwd: process.cwd() });
        console.log(result.stdout);
        if (result.exitCode !== 0) {
          console.error(chalk.yellow(`triage: unavailable — ${result.predictedVerdict}`));
          process.exit(result.exitCode);
        }
      } catch (err) {
        if (err instanceof TriageNotEnabledError) {
          console.error(chalk.yellow(`triage: not enabled — ${err.message}`));
          process.exit(EXIT_NOT_ENABLED);
        }
        console.error(chalk.red('Error:'), err instanceof Error ? err.message : err);
        process.exit(1);
      }
    });

  return cmd;
}

// ─── Gate ────────────────────────────────────────────────────────────

interface ProviderGate {
  provider: TriageProvider;
  endpoint: string;
  model: string;
  maxLen?: number;
  apiKey: string;
}

interface Gate {
  providers: ProviderGate[];
  /** Providers the config lists but that cannot run here (missing key, non-loopback endpoint). */
  skipped: Array<{ provider: TriageProvider; reason: string }>;
  evidenceMaxLines: number;
}

/**
 * The providers the target lists (`triage_providers`, else `triage_provider`),
 * deduplicated, order kept. `--provider` narrows that list to one entry and is
 * refused when the target does not list it. Only a run that sends nothing
 * (`--dry-run`, `--mock`) with no list at all falls back to the flag or to
 * `typesafe`.
 */
export function resolveProviders(
  verification: VerificationConfig | undefined,
  forced?: TriageProvider,
): TriageProvider[] {
  const listed = verification?.triage_providers ?? (verification?.triage_provider ? [verification.triage_provider] : []);
  const unique = [...new Set(listed)];
  if (!forced) return unique.length ? unique : ['typesafe'];
  if (unique.length && !unique.includes(forced)) {
    throw new TriageNotEnabledError(
      `--provider ${forced} is not one of the providers this target lists (${unique.join(', ')})`,
    );
  }
  return [forced];
}

function providerGate(
  provider: TriageProvider,
  verification: VerificationConfig | undefined,
  options: JudgeTriageOptions,
  cwd: string,
  live: boolean,
): ProviderGate {
  if (provider === 'laya') {
    const laya = verification?.laya ?? {};
    const endpoint = options.endpoint ?? laya.endpoint ?? LAYA_DEFAULT_ENDPOINT;
    if (!isLoopbackEndpoint(endpoint)) {
      throw new TriageNotEnabledError(`laya endpoint ${describeEndpoint(endpoint)} is not loopback — only a local server is allowed`);
    }
    // A local server may still require a key; only read one when the config names it.
    let apiKey = '';
    if (live && laya.api_key_env) {
      apiKey = readEnvVar(cwd, laya.api_key_env) ?? '';
      if (!apiKey) throw new TriageNotEnabledError(`${laya.api_key_env} is not set`);
    }
    return {
      provider,
      endpoint,
      model: laya.model ?? LAYA_DEFAULT_MODEL,
      maxLen: laya.max_len ?? LAYA_DEFAULT_MAX_LEN,
      apiKey,
    };
  }
  let apiKey = '';
  if (live) {
    const keyName = verification?.triage_api_key_env ?? DEFAULT_KEY_ENV;
    apiKey = readEnvVar(cwd, keyName) ?? '';
    if (!apiKey) throw new TriageNotEnabledError(`${keyName} is not set (looked in the environment, qa/.env, .env)`);
  }
  return { provider, endpoint: JEV_ENDPOINT, model: JEV_MODEL, apiKey };
}

/** Host and port only: an endpoint can carry credentials, and this text reaches logs. */
function describeEndpoint(endpoint: string): string {
  try {
    return new URL(endpoint).host || '[endpoint]';
  } catch {
    return '[endpoint]';
  }
}

function loadVerificationBlock(
  cwd: string,
  targetName: string | undefined,
  required: boolean,
): { id: string; verification?: VerificationConfig } | undefined {
  const path = resolveTargetPath(cwd, targetName);
  if (!existsSync(path)) {
    if (required) throw new TriageNotEnabledError(`no target config at ${path}`);
    return undefined;
  }
  const parsed = TargetConfigSchema.safeParse(parseYaml(readFileSync(path, 'utf-8')));
  if (!parsed.success) {
    if (required) throw new Error(`target config ${basename(path)} is invalid: ${parsed.error.issues[0]?.message}`);
    return undefined;
  }
  const data = parsed.data as { id: string; verification?: VerificationConfig };
  return { id: data.id, verification: data.verification };
}

function resolveGate(cwd: string, options: JudgeTriageOptions, live: boolean): Gate {
  if (options.provider !== undefined && options.provider !== 'typesafe' && options.provider !== 'laya') {
    throw new Error(`--provider must be typesafe or laya, got "${String(options.provider)}"`);
  }
  const target = loadVerificationBlock(cwd, options.target, live);
  const verification = target?.verification;
  if (live && verification?.mode !== MODE) {
    throw new TriageNotEnabledError(
      `target "${target?.id ?? options.target ?? 'default'}" has verification.mode "${verification?.mode ?? 'judge'}" — ` +
        'set verification.mode: triage-shadow and verification.triage_provider(s) to opt in',
    );
  }
  if (live && !verification?.triage_provider && !verification?.triage_providers) {
    throw new TriageNotEnabledError('the target lists no triage provider');
  }

  const resolved = resolveProviders(verification, options.provider);
  if (options.endpoint !== undefined && !resolved.includes('laya')) {
    throw new Error('--endpoint applies to the laya provider only, and laya is not among the providers for this run');
  }
  const providers: ProviderGate[] = [];
  const skipped: Gate['skipped'] = [];
  for (const provider of resolved) {
    try {
      providers.push(providerGate(provider, verification, options, cwd, live));
    } catch (err) {
      if (!(err instanceof TriageNotEnabledError)) throw err;
      skipped.push({ provider, reason: err.message });
    }
  }
  if (!providers.length) {
    throw new TriageNotEnabledError(skipped.map((s) => `${s.provider}: ${s.reason}`).join('; '));
  }
  return {
    providers,
    skipped,
    evidenceMaxLines: options.evidenceMaxLines ?? verification?.evidence_max_lines ?? DEFAULT_EVIDENCE_MAX_LINES,
  };
}

/**
 * What a live run of the same command would do, for `--dry-run`: the real gate,
 * key lookups included, run in report mode. Sends nothing.
 */
function liveRunVerdict(cwd: string, options: JudgeTriageOptions): string {
  try {
    const live = resolveGate(cwd, options, true);
    const skipped = live.skipped.map((s) => `; skipped ${s.provider}: ${s.reason}`).join('');
    return `live run: would send to ${live.providers.map((p) => p.provider).join(', ')}${skipped}`;
  } catch (err) {
    return `live run: would NOT send — ${err instanceof Error ? err.message : String(err)}`;
  }
}

/** A mock file may carry `fp_default` instead of one answer per fp_* question. */
function expandMock(raw: unknown, questions: Record<string, TriageQuestion>): unknown {
  if (typeof raw !== 'object' || raw === null) return raw;
  const obj = { ...(raw as Record<string, unknown>) };
  const answers = { ...((obj.answers as Record<string, unknown>) ?? {}) };
  const fpDefault = typeof obj.fp_default === 'number' ? obj.fp_default : undefined;
  if (fpDefault !== undefined) {
    for (const id of Object.keys(questions)) {
      if (id.startsWith('fp_') && answers[id] === undefined) {
        answers[id] = { type: 'noul', noul: fpDefault };
      }
    }
    delete obj.fp_default;
  }
  obj.answers = answers;
  return obj;
}

// ─── Runner ──────────────────────────────────────────────────────────

export async function runJudgeTriage(
  claimFileArg: string,
  options: JudgeTriageOptions,
  ctx: JudgeTriageContext,
): Promise<JudgeTriageResult> {
  const cwd = ctx.cwd;
  if (options.evidenceMaxLines !== undefined && !(options.evidenceMaxLines > 0)) {
    throw new Error('--evidence-max-lines must be a positive integer');
  }

  // The session directory, and with it the never-send list, is the real
  // `<cwd>/output/sessions/<dir>` the card sits in — checked before anything
  // is read, gated or sent.
  const { claimFile, sessionDir, sessionName } = resolveClaimLocation(cwd, claimFileArg);
  const claim = parseClaimCard(readCapped(claimFile, MAX_SESSION_TEXT_BYTES)?.text ?? '');
  if (!claim.complete) {
    throw new Error(
      `Claim card ${basename(claimFile)} is incomplete — it needs a "# CLAIM-NNN" heading, a **Title:** line, ` +
        'an "## Actual Behavior" section and a numbered "## Steps to Reproduce" list',
    );
  }

  const live = !options.dryRun && !options.mock;
  const gate = resolveGate(cwd, options, live);
  // Same directory as the real one, spelled under cwd as the session knows it.
  const outDir = options.out
    ? resolve(cwd, options.out)
    : join(resolve(cwd, 'output', 'sessions'), sessionName, 'verification');
  const nnn = claim.id.replace(/^CLAIM-/, '');

  const patterns = loadFalsePositivePatterns(cwd, sessionDir);
  const evidence = collectEvidence(claim, claimFile, gate.evidenceMaxLines, sessionDir);
  const built = buildTriageState(claim, evidence);
  const { state } = built;
  const budget = fitStateToBudget(state, evidence);
  const questionSet = buildQuestionSet(patterns);
  const { questions, patternIds } = questionSet;
  const redactions = [...new Set([...built.redactions, ...questionSet.redactions])];
  const stateChars = JSON.stringify(state).length;

  if (options.dryRun) {
    const lines = [
      'DRY-RUN — nothing sent, nothing written',
      `claim: ${claim.id} (${claim.claimedSeverity || 'no severity'})`,
      liveRunVerdict(cwd, options),
      `providers (as built here): ${gate.providers.map((g) => `${g.provider} (${g.endpoint})`).join(', ')}`,
      ...gate.skipped.map((sk) => `skipped: ${sk.provider} — ${sk.reason}`),
      `state: ${stateChars.toLocaleString('en-US')} chars (~${Math.ceil(stateChars / 4).toLocaleString('en-US')} tokens est.)`,
      `questions (${Object.keys(questions).length}): ${Object.keys(questions).join(', ')}`,
      `evidence sent: ${budget.sent.map(describeSent).join('; ') || 'none'}`,
      `evidence not sent: ${budget.notSent.map((e) => `${e.file} (${e.reason})`).join('; ') || 'none'}`,
      `redactions: ${redactions.join(', ') || 'none'}`,
    ];
    return {
      ok: true,
      exitCode: 0,
      claimId: claim.id,
      mode: MODE,
      route: null,
      predictedVerdict: 'DRY-RUN',
      block: '',
      stdout: lines.join('\n'),
      evidenceSent: budget.sent,
      evidenceNotSent: budget.notSent,
      redactions,
      stateChars,
    };
  }

  const runs: ProviderRun[] = [];
  for (const pg of gate.providers) {
    runs.push(
      await triageWithProvider(pg, {
        ctx,
        cwd,
        mock: options.mock,
        claim,
        nnn,
        outDir,
        state,
        questions,
        patternIds,
        budget,
        redactions,
      }),
    );
  }

  const answered = runs.filter((r) => r.decision);
  const primary = answered[0] ?? runs[0];
  const combined = answered.length ? combineRoutes(answered.map((r) => r.decision!.route)) : null;
  const single = runs.length === 1 && !gate.skipped.length;
  const parts = runs.map((r) => `${r.block}\n${FILE_KEY[r.provider]}: ${r.mdPath}`);
  if (!single) {
    parts.push(
      [
        `ROUTE: ${combined ?? 'n/a'}`,
        `ROUTE_SOURCE: most cautious of ${runs.map((r) => `${r.provider}=${r.decision?.route ?? 'unavailable'}`).join(', ')}`,
        ...gate.skipped.map((sk) => `SKIPPED: ${sk.provider} (${sk.reason})`),
      ].join('\n'),
    );
  }

  const ok = answered.length > 0;
  return {
    ok,
    exitCode: ok ? 0 : EXIT_UNAVAILABLE,
    claimId: claim.id,
    mode: MODE,
    route: combined,
    predictedVerdict: primary.decision?.predictedVerdict ?? `UNAVAILABLE (${primary.unavailable ?? 'no answer'})`,
    block: primary.block,
    stdout: parts.join('\n\n'),
    mdPath: primary.mdPath,
    jsonPath: primary.jsonPath,
    usage: primary.usage ?? undefined,
    costUsd: primary.costUsd ?? undefined,
    ms: primary.ms ?? undefined,
    evidenceSent: budget.sent,
    evidenceNotSent: budget.notSent,
    redactions,
    stateChars,
    providers: runs.map((r) => ({
      provider: r.provider,
      verdict: r.decision?.predictedVerdict ?? `UNAVAILABLE (${r.unavailable ?? 'no answer'})`,
      route: r.decision?.route ?? null,
      mdPath: r.mdPath,
      jsonPath: r.jsonPath,
      ms: r.ms ?? undefined,
    })),
    skipped: gate.skipped,
  };
}

// ─── One provider ────────────────────────────────────────────────────

/** File stem and stdout key per provider. */
const FILE_STEM: Record<TriageProvider, string> = { typesafe: 'JEV', laya: 'LAYA' };
const FILE_KEY: Record<TriageProvider, string> = { typesafe: 'JEV_FILE', laya: 'LAYA_FILE' };

const ROUTE_RANK: Record<Route, number> = { 'likely-confirmed': 0, unclear: 1, 'refute-risk': 2 };

/** The most cautious reading of the providers that answered. */
export function combineRoutes(routes: Route[]): Route {
  if (!routes.length) throw new Error('combineRoutes(): no routes');
  return routes.reduce((a, b) => (ROUTE_RANK[b] > ROUTE_RANK[a] ? b : a));
}

interface ProviderRun {
  provider: TriageProvider;
  decision: RouteDecision | null;
  unavailable?: string;
  block: string;
  mdPath: string;
  jsonPath: string;
  usage: TriageUsage | null;
  costUsd: number | null;
  ms: number | null;
}

interface ProviderInput {
  ctx: JudgeTriageContext;
  cwd: string;
  mock?: string;
  claim: ReturnType<typeof parseClaimCard>;
  nnn: string;
  outDir: string;
  state: TriageState;
  questions: Record<string, TriageQuestion>;
  patternIds: Record<string, string>;
  budget: ReturnType<typeof fitStateToBudget>;
  redactions: string[];
}

async function triageWithProvider(pg: ProviderGate, input: ProviderInput): Promise<ProviderRun> {
  const { ctx, cwd, claim, nnn, outDir, state, questions, patternIds, budget, redactions } = input;
  const request: SystemOneRequest & { state: TriageState } =
    pg.provider === 'laya'
      ? { state, model: pg.model, questions, max_len: pg.maxLen }
      : { state, model: pg.model, questions };
  let response: SystemOneResponse | null = null;
  let ms: number | null = null;
  let unavailable: string | undefined;

  if (input.mock) {
    const mockPath = resolve(cwd, input.mock);
    if (!existsSync(mockPath)) throw new Error(`--mock file not found: ${mockPath}`);
    try {
      response = assertResponse(expandMock(JSON.parse(readFileSync(mockPath, 'utf-8')), questions), questions);
      ms = 0;
    } catch (err) {
      if (!(err instanceof TriageApiError)) throw err;
      unavailable = `mock: ${err.message}`;
    }
  } else {
    try {
      const call = await callSystemOne(request, {
        apiKey: pg.apiKey,
        endpoint: pg.endpoint,
        // A local encoder over an 8k-token state is slower per call than the hosted API.
        timeoutMs: pg.provider === 'laya' ? 180_000 : undefined,
        retries: pg.provider === 'laya' ? 1 : undefined,
        fetch: ctx.fetch,
        sleep: ctx.sleep,
        now: ctx.now,
      });
      response = call.response;
      ms = call.ms;
    } catch (err) {
      if (!(err instanceof TriageApiError)) throw err;
      unavailable = err.message;
    }
  }

  let decision: RouteDecision | null = null;
  if (response) {
    try {
      decision = route(response.answers, DEFAULT_THRESHOLDS);
    } catch (err) {
      unavailable = err instanceof Error ? err.message : String(err);
      response = null;
    }
  }

  const usage = response?.usage ?? null;
  const costUsd = usage ? (pg.provider === 'laya' ? 0 : estimateCostUsd(usage)) : null;
  const stem = FILE_STEM[pg.provider];
  const block = renderTriageBlock({
    mode: MODE,
    verdictKey: `${stem}_VERDICT`,
    claimedSeverity: claim.claimedSeverity,
    answers: response?.answers ?? null,
    decision,
    patternIds,
    evidenceSent: budget.sent,
    evidenceNotSent: budget.notSent,
    redactions,
    usage,
    costUsd,
    ms,
    model: response?.model ?? pg.model,
    unavailable,
  });

  const result: TriageResult = {
    claimId: claim.id,
    mode: MODE,
    model: response?.model ?? pg.model,
    createdAt: new Date(ctx.now ? ctx.now() : Date.now()).toISOString(),
    // The body `callSystemOne()` serialises, field for field.
    request,
    response,
    usage,
    costUsd,
    ms,
    route: decision ? { route: decision.route, reasons: decision.reasons, thresholds: DEFAULT_THRESHOLDS } : null,
    evidence: { sent: budget.sent, not_sent: budget.notSent },
    redactions,
    patterns: patternIds,
  };
  if (pg.provider !== 'typesafe') result.provider = pg.provider;
  if (unavailable) result.unavailable = unavailable;

  const fileStem = `${stem}-${nnn}`;
  const title = pg.provider === 'laya' ? 'decision-model triage, local' : 'decision-model triage, hosted';
  mkdirSync(outDir, { recursive: true });
  const jsonPath = join(outDir, `${fileStem}.json`);
  const mdPath = join(outDir, `${fileStem}.md`);
  writeFileSync(jsonPath, `${JSON.stringify(result, null, 2)}\n`);
  writeFileSync(mdPath, `${CONFIDENTIALITY_HEADER_MD}\n\n# ${fileStem} (${title}, ${MODE})\n\n\`\`\`\n${block}\n\`\`\`\n`);

  return { provider: pg.provider, decision, unavailable, block, mdPath, jsonPath, usage, costUsd, ms };
}
