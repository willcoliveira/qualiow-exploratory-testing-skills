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
 */

import type { SystemOneRequest, SystemOneResponse, TriageUsage, TriageQuestion } from './types.js';

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
      const detail = err instanceof Error ? err.message : String(err);
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
      let json: unknown;
      try {
        json = await res.json();
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
    const text = await res.text().catch(() => '');
    if (retryable && attempt <= retries) {
      await sleep(backoffMs(attempt));
      continue;
    }
    throw new TriageApiError(
      `HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ''}`,
      res.status,
      retryable,
    );
  }
}

/** Every requested question must be answered with the type it was asked as. */
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
  for (const [id, q] of Object.entries(questions)) {
    const a = answerMap[id];
    if (!a || typeof a !== 'object') {
      throw new TriageApiError(`malformed response: no answer for "${id}"`);
    }
    if (a.type !== q.type) {
      throw new TriageApiError(`malformed response: "${id}" answered as ${String(a.type)}, asked as ${q.type}`);
    }
    if (q.type === 'noul' && typeof a.noul !== 'number') {
      throw new TriageApiError(`malformed response: "${id}" has no noul probability`);
    }
    if (q.type === 'choice' && (typeof a.choice !== 'string' || typeof a.probabilities !== 'object' || a.probabilities === null)) {
      throw new TriageApiError(`malformed response: "${id}" has no choice`);
    }
    if (
      (q.type === 'choice' || q.type === 'score') &&
      (typeof a.confidence !== 'number' ||
        Object.values((a.probabilities ?? {}) as Record<string, unknown>).some((p) => typeof p !== 'number'))
    ) {
      throw new TriageApiError(`malformed response: "${id}" has no numeric confidence or probabilities`);
    }
    if (q.type === 'score' && typeof a.score !== 'number') {
      throw new TriageApiError(`malformed response: "${id}" has no score`);
    }
  }
  const usage = (obj.usage ?? {}) as Partial<TriageUsage>;
  return {
    model: typeof obj.model === 'string' ? obj.model : 'unknown',
    answers: answerMap as unknown as SystemOneResponse['answers'],
    usage: {
      input_tokens: typeof usage.input_tokens === 'number' ? usage.input_tokens : 0,
      output_tokens: typeof usage.output_tokens === 'number' ? usage.output_tokens : 0,
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
