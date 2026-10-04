/**
 * Types for the opt-in decision-model triage of a candidate bug.
 *
 * A decision model answers narrow typed questions about text — a probability
 * (noul), a choice or a score — and nothing else: no reasoning, no prose. Both
 * providers speak the same `/v1/systemone` wire protocol: TypeSafe's hosted Jev
 * and a self-hosted Laya server. Everything in this file is a request/response
 * shape or the parsed form of a claim card; the judgement stays in the session,
 * and the prediction rule lives in `triage.ts`.
 */

// ─── Request ─────────────────────────────────────────────────────────

export interface NoulQuestion {
  type: 'noul';
  instructions: string;
  criteria?: { true?: string; false?: string };
}

export interface ChoiceQuestion {
  type: 'choice';
  instructions: string;
  /** option key → description; the model picks one key. */
  criteria: Record<string, string>;
}

export interface ScoreQuestion {
  type: 'score';
  instructions: string;
  /** Ordered level descriptions, low to high (2–10). */
  criteria: string[];
}

export type TriageQuestion = NoulQuestion | ChoiceQuestion | ScoreQuestion;

export interface SystemOneRequest {
  state: unknown;
  model: string;
  questions: Record<string, TriageQuestion>;
  /** Laya only: per-call token budget (its default window would truncate a claim state). */
  max_len?: number;
}

// ─── Response ────────────────────────────────────────────────────────

export interface NoulAnswer {
  type: 'noul';
  /** P(yes), 0–1. */
  noul: number;
}

export interface ChoiceAnswer {
  type: 'choice';
  choice: string;
  probabilities: Record<string, number>;
  /** Concentration of the distribution, 0–1. */
  confidence: number;
}

export interface ScoreAnswer {
  type: 'score';
  score: number;
  legend?: Record<string, unknown>;
  probabilities: Record<string, number>;
  confidence: number;
}

export type TriageAnswer = NoulAnswer | ChoiceAnswer | ScoreAnswer;
export type TriageAnswers = Record<string, TriageAnswer>;

export interface TriageUsage {
  input_tokens: number;
  output_tokens: number;
}

export interface SystemOneResponse {
  model: string;
  answers: TriageAnswers;
  usage: TriageUsage;
}

// ─── Claim card and verdict ──────────────────────────────────────────

export interface ParsedClaim {
  /** `CLAIM-NNN`, or '' when the heading is missing. */
  id: string;
  /** False for a stub card (no title, no actual behaviour or no steps). */
  complete: boolean;
  title: string;
  url: string;
  claimedSeverity: string;
  environment: string;
  reproductionRate: string;
  expected: string;
  actual: string;
  steps: string[];
  /** Raw bullet lines under `## Evidence`. */
  evidenceLines: string[];
  /** Path tokens found in those bullets, in order, deduplicated. */
  evidencePaths: string[];
  /** The bullets' prose once the path tokens are removed (console/network excerpts). */
  evidenceInline: string;
}

export type JudgeVerdict =
  | 'CONFIRMED'
  | 'CONFIRMED-ADJUSTED'
  | 'REFUTED'
  | 'UNREPRODUCIBLE'
  | 'UNVERIFIED';

export interface ParsedVerdict {
  verdict: JudgeVerdict | 'UNKNOWN';
  verdictRaw: string;
  /** True when the block was fenced; the one-line `VERDICT: UNVERIFIED (…)` form is not. */
  fenced: boolean;
  method?: string;
  confidence?: string;
  severityRaw?: string;
  /** Severity the judge settled on: `agree with claimed X` → X, `adjusted to Y` → Y, `n/a` → null. */
  severity?: string | null;
  reproResult?: string;
  reasoning?: string;
  falsePositivePattern?: string;
}

// ─── Evidence ────────────────────────────────────────────────────────

export interface EvidenceFile {
  /** Basename only — never a full path. */
  file: string;
  lines: number;
  text: string;
  truncated_from?: number;
  /** The file was larger than the read window: `truncated_from` is a lower bound. */
  partial?: boolean;
}

/**
 * `outside-session` also covers a symlink whose target leaves the session;
 * `auth-state` is anything under `.auth/` (by name or by real path) or a file
 * shaped like a Playwright storage state; `not-file` is a directory, FIFO,
 * device or anything else that is not a regular file.
 */
export type EvidenceSkipReason =
  | 'image'
  | 'missing'
  | 'type'
  | 'outside-session'
  | 'excluded'
  | 'auth-state'
  | 'not-file'
  | 'budget';

export interface EvidenceSkipped {
  file: string;
  reason: EvidenceSkipReason;
}

export interface CollectedEvidence {
  sent: EvidenceFile[];
  notSent: EvidenceSkipped[];
}

// ─── State, prediction, result ───────────────────────────────────────

export interface TriageState {
  claim: {
    id: string;
    title: string;
    url: string;
    claimed_severity: string;
    environment: string;
    reproduction_rate: string;
    expected: string;
    actual: string;
    steps: string[];
  };
  evidence_inline: string;
  evidence_files: Array<{ file: string; lines: number; text: string }>;
  note: string;
}

/**
 * The triage's reading of a claim, recorded beside the judge's verdict. A
 * prediction only: Phase 7 never orders, shortens or skips a judge run on it.
 */
export type Route = 'refute-risk' | 'unclear' | 'likely-confirmed';

/** What the decision model predicts the judge will say — a prediction, never a verdict. */
export type PredictedVerdict = 'CONFIRMED' | 'CONFIRMED-ADJUSTED' | 'REFUTED' | 'UNREPRODUCIBLE';

export type SeverityName = 'Critical' | 'High' | 'Medium' | 'Low';

export interface RoutingThresholds {
  /** P(refuted) + P(unreproducible) at or above this → refute-risk. */
  refuteMass: number;
  /** Any false-positive pattern noul at or above this → refute-risk. */
  fpPattern: number;
  byDesign: number;
  altExplanation: number;
  /** predicted_verdict confidence needed for likely-confirmed. */
  confirmConfidence: number;
  confirmEvidence: number;
  confirmSteps: number;
  /** Every fp_* noul must stay below this for likely-confirmed. */
  confirmFpCeiling: number;
}

export interface RouteDecision {
  route: Route;
  reasons: string[];
  predictedVerdict: PredictedVerdict;
  refuteMass: number;
}

export type TriageMode = 'triage-shadow';

export interface TriageResult {
  claimId: string;
  mode: TriageMode;
  model: string;
  createdAt: string;
  /** The exact request body sent (state, model, questions, and `max_len` for Laya). */
  request: SystemOneRequest & { state: TriageState };
  response: SystemOneResponse | null;
  usage: TriageUsage | null;
  costUsd: number | null;
  ms: number | null;
  route: { route: Route; reasons: string[]; thresholds: RoutingThresholds } | null;
  evidence: { sent: Array<Omit<EvidenceFile, 'text'>>; not_sent: EvidenceSkipped[] };
  redactions: string[];
  /** Question id → pattern text (scrubbed), for the fp_* questions. */
  patterns: Record<string, string>;
  unavailable?: string;
  /** Set for providers other than typesafe (absent = the hosted provider). */
  provider?: 'laya';
}
