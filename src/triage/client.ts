/**
 * One POST to a `/v1/systemone` endpoint: TypeSafe's hosted API or a
 * self-hosted Laya server, which speak the same wire protocol.
 *
 * Kept dependency-free on purpose: the call is a bearer header and a JSON
 * body, and retrying 429/503/529 with backoff is a dozen lines. `fetch`,
 * `sleep` and the clock are injectable so the tests never touch the network.
 * Redirects are refused: a 307/308 would re-send the body to wherever the
 * server points, which defeats both the fixed hosted endpoint and the
 * loopback-only rule for Laya.
 *
 * The response is untrusted: its text ends up in stdout and in the
 * `<STEM>-NNN.md` block the Phase 7 agent reads. `assertResponse()` keeps
 * only the fields the question set asked for, allow-lists every `choice`,
 * clamps every probability to [0, 1] and flattens the model id; the body is
 * read with a byte limit before it is parsed.
 */

import type { SystemOneRequest, SystemOneResponse, TriageAnswers, TriageUsage, TriageQuestion } from './types.js';

export const JEV_ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
export const JEV_MODEL = 'jev-latest';
/** USD per input token, from TypeSafe's published pricing ($0.042 per 1M). Output tokens are free. */
export const JEV_USD_PER_INPUT_TOKEN = 0.042 / 1e6;

export class TriageApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly retryable = false,
  ) {
    super(message);
    this.name = 'TriageApiError';
  }
}

export interface CallOptions {
  /** Empty for a keyless local Laya server: no Authorization header is sent. */
  apiKey: string;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** Retries on 429 / 503 / 529 / network failure (default 3). */
  retries?: number;
  /** Per-attempt timeout in milliseconds (default 15 000). */
  timeoutMs?: number;
  endpoint?: string;
  now?: () => number;
}

export interface CallResult {
  response: SystemOneResponse;
  ms: number;
  attempts: number;
}

/** Largest response body read (a full answer set is a few KB). */
export const MAX_RESPONSE_BYTES = 256 * 1024;
/** How much of an error body is read before the 200-character excerpt is cut. */
const MAX_ERROR_BYTES = 4096;
const MAX_MODEL_CHARS = 64;

/**
 * One line of provider text that is safe to print inside a fenced block: no
 * control characters or newlines, no backticks, capped.
 */
export function sanitizeProviderText(value: string, max: number): string {
  const flat = value.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029`]+/g, ' ').replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

/**
 * Reads at most `max` bytes of the body. Returns `null` when the body is
 * larger (the stream is cancelled, the rest is never read).
 */
async function readBodyCapped(res: Response, max: number): Promise<string | null> {
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > max) {
    await res.body?.cancel().catch(() => undefined);
    return null;
  }
  if (!res.body) {
    const text = await res.text();
    return Buffer.byteLength(text) > max ? null : text;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

/** The first bytes of an error body, as one sanitised line of at most 200 characters. */
async function errorExcerpt(res: Response): Promise<string> {
  try {
    if (!res.body) return sanitizeProviderText((await res.text()).slice(0, MAX_ERROR_BYTES), 200);
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (total < MAX_ERROR_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.byteLength;
    }
    await reader.cancel().catch(() => undefined);
    return sanitizeProviderText(Buffer.concat(chunks).subarray(0, MAX_ERROR_BYTES).toString('utf-8'), 200);
  } catch {
    return '';
  }
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** 500 ms, 1 s, 2 s … plus up to 250 ms of jitter. */
export function backoffMs(attempt: number, random: () => number = Math.random): number {
  return 500 * 2 ** (attempt - 1) + Math.floor(random() * 250);
}

export async function callSystemOne(req: SystemOneRequest, opts: CallOptions): Promise<CallResult> {
  const doFetch = opts.fetch ?? globalThis.fetch;
  const sleep = opts.sleep ?? defaultSleep;
  const retries = opts.retries ?? 3;
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const endpoint = opts.endpoint ?? JEV_ENDPOINT;
  const now = opts.now ?? (() => Date.now());

  const body = JSON.stringify(req);
  const started = now();
  let attempt = 0;

  for (;;) {
    attempt++;
    let res: Response;
    try {
      res = await doFetch(endpoint, {
        method: 'POST',
        headers: {
          ...(opts.apiKey ? { Authorization: `Bearer ${opts.apiKey}` } : {}),
          'Content-Type': 'application/json',
        },
        body,
        redirect: 'error',
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      const timedOut = err instanceof Error && err.name === 'TimeoutError';
      if (attempt <= retries) {
        await sleep(backoffMs(attempt));
        continue;
      }
      const detail = sanitizeProviderText(err instanceof Error ? err.message : String(err), 200);
      throw new TriageApiError(
        timedOut ? `timeout after ${timeoutMs} ms (${attempt} attempts)` : `network error: ${detail}`,
        undefined,
        true,
      );
    }

    // `redirect: 'error'` makes a real fetch throw; an injected one may still
    // hand back a 3xx, which is refused the same way.
    if (res.status >= 300 && res.status < 400) {
      throw new TriageApiError(`refused redirect (HTTP ${res.status})`, res.status);
    }

    if (res.ok) {
      const text = await readBodyCapped(res, MAX_RESPONSE_BYTES).catch(() => '');
      if (text === null) {
        throw new TriageApiError(`malformed response: body larger than ${MAX_RESPONSE_BYTES} bytes`, res.status);
      }
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        throw new TriageApiError('malformed response: not JSON', res.status);
      }
      return {
        response: assertResponse(json, req.questions),
        ms: now() - started,
        attempts: attempt,
      };
    }

    const retryable = res.status === 429 || res.status === 529 || res.status === 503;
    const text = await errorExcerpt(res);
    if (retryable && attempt <= retries) {
      await sleep(backoffMs(attempt));
      continue;
    }
    throw new TriageApiError(`HTTP ${res.status}${text ? `: ${text}` : ''}`, res.status, retryable);
  }
}

/** A finite number clamped to [0, 1], or undefined for anything that is not a number. */
function prob(value: unknown): number | undefined {
  if (typeof value !== 'number' || Number.isNaN(value)) return undefined;
  return Math.min(1, Math.max(0, value));
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/**
 * Every requested question must be answered with the type it was asked as.
 * What comes back is rebuilt from the question set, never passed through:
 * answers to questions that were not asked and unknown fields are dropped, a
 * `choice` outside the question's criteria keys is malformed, probabilities
 * are kept only for those keys and clamped to [0, 1], the model id is one
 * sanitised line of at most 64 characters.
 */
export function assertResponse(
  json: unknown,
  questions: Record<string, TriageQuestion>,
): SystemOneResponse {
  if (typeof json !== 'object' || json === null) {
    throw new TriageApiError('malformed response: not an object');
  }
  const obj = json as Record<string, unknown>;
  const answers = obj.answers;
  if (typeof answers !== 'object' || answers === null) {
    throw new TriageApiError('malformed response: no answers');
  }
  const answerMap = answers as Record<string, Record<string, unknown>>;
  const clean: TriageAnswers = {};
  for (const [id, q] of Object.entries(questions)) {
    const a = Object.prototype.hasOwnProperty.call(answerMap, id) ? answerMap[id] : undefined;
    if (!a || typeof a !== 'object') {
      throw new TriageApiError(`malformed response: no answer for "${id}"`);
    }
    if (a.type !== q.type) {
      throw new TriageApiError(
        `malformed response: "${id}" answered as ${sanitizeProviderText(String(a.type), 16)}, asked as ${q.type}`,
      );
    }
    if (q.type === 'noul') {
      const noul = prob(a.noul);
      if (noul === undefined) throw new TriageApiError(`malformed response: "${id}" has no noul probability`);
      clean[id] = { type: 'noul', noul };
      continue;
    }
    const confidence = prob(a.confidence);
    const rawProbs = a.probabilities;
    if (
      confidence === undefined ||
      (rawProbs !== undefined && (typeof rawProbs !== 'object' || rawProbs === null)) ||
      Object.values((rawProbs ?? {}) as Record<string, unknown>).some((p) => typeof p !== 'number')
    ) {
      throw new TriageApiError(`malformed response: "${id}" has no numeric confidence or probabilities`);
    }
    const probsIn = (rawProbs ?? {}) as Record<string, unknown>;
    if (q.type === 'choice') {
      const keys = Object.keys(q.criteria);
      if (typeof a.choice !== 'string' || rawProbs === undefined) {
        throw new TriageApiError(`malformed response: "${id}" has no choice`);
      }
      if (!keys.includes(a.choice)) {
        throw new TriageApiError(`malformed response: "${id}" chose an option that was not offered`);
      }
      const probabilities: Record<string, number> = {};
      for (const k of keys) {
        const p = Object.prototype.hasOwnProperty.call(probsIn, k) ? prob(probsIn[k]) : undefined;
        if (p !== undefined) probabilities[k] = p;
      }
      clean[id] = { type: 'choice', choice: a.choice, probabilities, confidence };
      continue;
    }
    if (typeof a.score !== 'number' || !Number.isFinite(a.score)) {
      throw new TriageApiError(`malformed response: "${id}" has no score`);
    }
    const probabilities: Record<string, number> = {};
    // Level keys are small integers; anything else is not a level.
    for (const [k, v] of Object.entries(probsIn)) {
      const p = /^\d{1,2}$/.test(k) ? prob(v) : undefined;
      if (p !== undefined) probabilities[k] = p;
    }
    clean[id] = { type: 'score', score: a.score, probabilities, confidence };
  }
  const usage = (typeof obj.usage === 'object' && obj.usage !== null ? obj.usage : {}) as Record<string, unknown>;
  const model = typeof obj.model === 'string' ? sanitizeProviderText(obj.model, MAX_MODEL_CHARS) : '';
  return {
    model: model || 'unknown',
    answers: clean,
    usage: {
      input_tokens: count(usage.input_tokens),
      output_tokens: count(usage.output_tokens),
    },
  };
}

export const LAYA_DEFAULT_ENDPOINT = 'http://127.0.0.1:8000/v1/systemone';
export const LAYA_DEFAULT_MODEL = 'multilingual';
/** The multilingual checkpoint reads up to 8,192 tokens; its shipped 1,024 cuts a claim state off. */
export const LAYA_DEFAULT_MAX_LEN = 8192;

const IPV4_LOOPBACK_RE = /^127\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/**
 * True only for an http(s) endpoint on this machine — the only kind a Laya
 * provider may use: `localhost`, `::1`, or a dotted-quad 127.0.0.0/8 address.
 * A hostname that merely starts with `127.` (`127.evil.example`) is not one.
 */
export function isLoopbackEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  if (url.username || url.password) return false;
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host === '::1') return true;
  const m = IPV4_LOOPBACK_RE.exec(host);
  return Boolean(m && m.slice(1).every((octet) => Number(octet) <= 255));
}

export function estimateCostUsd(usage: Pick<TriageUsage, 'input_tokens'>): number {
  return usage.input_tokens * JEV_USD_PER_INPUT_TOKEN;
}
