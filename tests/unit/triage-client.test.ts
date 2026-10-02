import { describe, it, expect, vi } from 'vitest';
import {
  JEV_ENDPOINT,
  TriageApiError,
  assertResponse,
  backoffMs,
  callSystemOne,
  estimateCostUsd,
  isLoopbackEndpoint,
} from '../../src/triage/client.js';
import type { SystemOneRequest, TriageQuestion } from '../../src/triage/types.js';

const questions: Record<string, TriageQuestion> = {
  q: { type: 'noul', instructions: 'Is it?' },
  c: { type: 'choice', instructions: 'Which?', criteria: { a: 'A', b: 'B' } },
};
const request: SystemOneRequest = { state: { text: 'hello' }, model: 'jev-latest', questions };

const okBody = {
  model: 'jev-mock',
  answers: {
    q: { type: 'noul', noul: 0.9 },
    c: { type: 'choice', choice: 'a', probabilities: { a: 0.8, b: 0.2 }, confidence: 0.6 },
  },
  usage: { input_tokens: 100, output_tokens: 4 },
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('callSystemOne', () => {
  it('posts the request with the bearer key, refuses redirects and returns the parsed answers', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(okBody));
    let t = 1000;
    const now = () => (t += 250);
    const result = await callSystemOne(request, { apiKey: 'key-123', fetch: fetchMock as never, now });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(JEV_ENDPOINT);
    expect(init.method).toBe('POST');
    expect(init.redirect).toBe('error');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer key-123');
    expect(JSON.parse(init.body as string)).toEqual(request);
    expect(result.response.answers.q).toEqual({ type: 'noul', noul: 0.9 });
    expect(result.response.usage.input_tokens).toBe(100);
    expect(result.attempts).toBe(1);
    expect(result.ms).toBe(250);
  });

  it('sends no Authorization header when the key is empty (keyless local server)', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(okBody));
    await callSystemOne(request, { apiKey: '', fetch: fetchMock as never, endpoint: 'http://127.0.0.1:8000/v1/systemone' });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('refuses a 3xx without following it or retrying', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 307, headers: { location: 'https://elsewhere.internal/' } }));
    const sleep = vi.fn(async () => {});
    await expect(callSystemOne(request, { apiKey: 'k', fetch: fetchMock as never, sleep })).rejects.toThrow(
      /refused redirect/,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('retries 429 with backoff and succeeds on the third attempt', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'rate' }, 429))
      .mockResolvedValueOnce(jsonResponse({ error: 'rate' }, 429))
      .mockResolvedValueOnce(jsonResponse(okBody));
    const sleep = vi.fn(async (_ms: number) => {});
    const result = await callSystemOne(request, { apiKey: 'k', fetch: fetchMock as never, sleep });
    expect(result.attempts).toBe(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    const [first, second] = sleep.mock.calls.map((c) => c[0] as number);
    expect(first).toBeGreaterThanOrEqual(500);
    expect(second).toBeGreaterThanOrEqual(1000);
    expect(second).toBeGreaterThan(first);
  });

  it('gives up after the configured retries', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ error: 'over' }, 529));
    const sleep = vi.fn(async () => {});
    await expect(
      callSystemOne(request, { apiKey: 'k', fetch: fetchMock as never, sleep, retries: 2 }),
    ).rejects.toMatchObject({ name: 'TriageApiError', status: 529, retryable: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does not retry a 401', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ error: 'no' }, 401));
    const sleep = vi.fn(async () => {});
    await expect(callSystemOne(request, { apiKey: 'k', fetch: fetchMock as never, sleep })).rejects.toMatchObject({
      status: 401,
      retryable: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('retries a timeout and reports it when it persists', async () => {
    const timeout = new Error('The operation was aborted due to timeout');
    timeout.name = 'TimeoutError';
    const fetchMock = vi.fn(async () => {
      throw timeout;
    });
    const sleep = vi.fn(async () => {});
    await expect(
      callSystemOne(request, { apiKey: 'k', fetch: fetchMock as never, sleep, retries: 1, timeoutMs: 10 }),
    ).rejects.toThrow(/timeout after 10 ms/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('rejects a body that does not answer every question', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ model: 'x', answers: { q: okBody.answers.q }, usage: {} }));
    await expect(callSystemOne(request, { apiKey: 'k', fetch: fetchMock as never })).rejects.toThrow(
      /no answer for "c"/,
    );
  });
});

describe('assertResponse', () => {
  it('rejects an answer of the wrong type', () => {
    const bad = { ...okBody, answers: { ...okBody.answers, q: { type: 'choice', choice: 'a', probabilities: {} } } };
    expect(() => assertResponse(bad, questions)).toThrow(TriageApiError);
  });

  it('rejects a choice answer without a numeric confidence', () => {
    const bad = { ...okBody, answers: { ...okBody.answers, c: { type: 'choice', choice: 'a', probabilities: { a: 1 } } } };
    expect(() => assertResponse(bad, questions)).toThrow(/numeric confidence/);
  });

  it('defaults usage and model when absent', () => {
    const r = assertResponse({ answers: okBody.answers }, questions);
    expect(r.model).toBe('unknown');
    expect(r.usage).toEqual({ input_tokens: 0, output_tokens: 0 });
  });
});

describe('isLoopbackEndpoint', () => {
  it.each([
    'http://127.0.0.1:8000/v1/systemone',
    'http://127.1.2.3/v1/systemone',
    'http://localhost:8000/v1/systemone',
    'http://[::1]:8000/v1/systemone',
    'https://LOCALHOST/v1/systemone',
  ])('accepts %s', (url) => {
    expect(isLoopbackEndpoint(url)).toBe(true);
  });

  it.each([
    'http://127.evil.example/v1/systemone',
    'http://127.0.0.1.evil.example/v1/systemone',
    'http://localhost.evil.example/v1/systemone',
    'http://10.0.0.5:8000/v1/systemone',
    'https://api.typesafe.ai/v1/systemone',
    'http://user:pass@127.0.0.1/v1/systemone',
    'file:///etc/passwd',
    'not a url',
  ])('rejects %s', (url) => {
    expect(isLoopbackEndpoint(url)).toBe(false);
  });
});

describe('helpers', () => {
  it('prices input tokens only', () => {
    expect(estimateCostUsd({ input_tokens: 1_000_000 })).toBeCloseTo(0.042, 6);
    expect(estimateCostUsd({ input_tokens: 0 })).toBe(0);
  });

  it('doubles the backoff per attempt', () => {
    expect(backoffMs(1, () => 0)).toBe(500);
    expect(backoffMs(2, () => 0)).toBe(1000);
    expect(backoffMs(3, () => 0.999)).toBeGreaterThanOrEqual(2000);
  });
});
