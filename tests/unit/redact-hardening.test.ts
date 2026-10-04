import { describe, it, expect } from 'vitest';
import { redact, containsSecrets, REDACTION_PATTERNS } from '../../src/utils/redact.js';
import { SECRET_PATTERNS, findSecretCategories } from '../../hooks/scripts/secret-patterns.mjs';

// Each case: input, exact redacted output. Every one is also held to the hook's verdict.
const REDACT_CASES: [string, string][] = [
  // 1. JSON-quoted keys keep valid JSON
  ['{"password":"hunter2"}', '{"password":"[REDACTED]"}'],
  ['"Authorization": "Bearer abc123def456"', '"Authorization": "[REDACTED]"'],
  ['{"token": "abcdefgh123", "token_count": 5}', '{"token": "[REDACTED]", "token_count": 5}'],
  ['"access_token":"abc.def.ghi1234","refresh_token":"zzzzzzzz99"', '"access_token":"[REDACTED]","refresh_token":"[REDACTED]"'],
  ['"client_secret": "s3cr3t"', '"client_secret": "[REDACTED]"'],
  ['"apiKey":"abcd1234efgh"', '"apiKey":"[REDACTED]"'],
  ['"api_key": "abcd1234efgh"', '"api_key": "[REDACTED]"'],
  ['"cookie": "sid=abc123"', '"cookie": "[REDACTED]"'],
  ['"set-cookie": "sid=abc123; HttpOnly"', '"set-cookie": "[REDACTED]"'],
  ["{'password': 'hunter2'}", "{'password': '[REDACTED]'}"],
  ['"pwd": 1234', '"pwd": "[REDACTED]"'],
  ['body: {\\"password\\":\\"hunter2\\"}', 'body: {\\"password\\":\\"[REDACTED]\\"}'],
  ['**Password:** hunter2', '**Password:** [REDACTED]'],
  // 2. Cookie anywhere on the line, and in a table row
  ['  Cookie: sid=abc123; theme=dark', '  Cookie: [REDACTED]'],
  ['request sent Cookie: sid=abc123', 'request sent Cookie: [REDACTED]'],
  ['| Cookie | sid=abc123; theme=dark |', '| Cookie | [REDACTED] |'],
  ['| GET /me | Cookie: sid=abc123 | 200 |', '| GET /me | Cookie: [REDACTED] | 200 |'],
  // 3. AWS STS JSON and a bare secret next to its key id
  [
    '"SecretAccessKey": "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY", "SessionToken": "IQoJb3JpZ2luX2VjE//////////wEaCXVz"',
    '"SecretAccessKey": "[REDACTED]", "SessionToken": "[REDACTED]"',
  ],
  ['AKIAIOSFODNN7EXAMPLE,wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', '[AWS_KEY_REDACTED],[AWS_SECRET_REDACTED]'],
  ['| AKIAIOSFODNN7EXAMPLE | wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY |', '| [AWS_KEY_REDACTED] | [AWS_SECRET_REDACTED] |'],
  ['[AWS_KEY_REDACTED] wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', '[AWS_KEY_REDACTED] [AWS_SECRET_REDACTED]'],
  // 4. Vendor tokens
  ['sk_' + 'live_abcdefghij123', '[STRIPE_KEY_REDACTED]'],
  ['rk_test_abcdefghij123', '[STRIPE_KEY_REDACTED]'],
  ['whsec' + '_abcdefghijklmnop1234', '[STRIPE_KEY_REDACTED]'],
  ['key AI' + 'zaSyA-abcdefghijklmnopqrstuvwxyz12345', 'key [GOOGLE_KEY_REDACTED]'],
  ['ya' + '29.a0AfH6SMBabcdefghijklmnop', '[GOOGLE_TOKEN_REDACTED]'],
  ['np' + 'm_abcdefghijklmnopqrstuvwxyz0123456789', '[NPM_TOKEN_REDACTED]'],
  ['gl' + 'pat-abcdefghijklmnopqrst', '[GITLAB_TOKEN_REDACTED]'],
  ['xoxe-1-abcdefghijkl', '[SLACK_TOKEN_REDACTED]'],
  ['xoxe.xoxp-1-abcdefghijkl', '[SLACK_TOKEN_REDACTED]'],
  ['hook https://hooks.' + 'slack.com/services/T0000AAAA/B1111BBBB/abcdefghijklmnopqrstuvwx', 'hook [SLACK_WEBHOOK_REDACTED]'],
  ['[URL /services/T0000AAAA/B1111BBBB/abcdefghijklmnopqrstuvwx]', '[URL [SLACK_WEBHOOK_REDACTED]]'],
  ['eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0', '[JWT_REDACTED]'],
  ['jwt=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.ab', 'jwt=[JWT_REDACTED]'],
  [
    '-----BEGIN PGP PRIVATE KEY BLOCK-----\nVersion: x\n\nlQOYBF\nabc==\n-----END PGP PRIVATE KEY BLOCK-----',
    '[PRIVATE_KEY_REDACTED]',
  ],
  [
    'key:\n-----BEGIN RSA PRIVATE KEY-----\nProc-Type: 4,ENCRYPTED\nMIIEowIBAAKCAQEA\nabcdef...\n\nThe next step was',
    'key:\n[PRIVATE_KEY_REDACTED]\nThe next step was',
  ],
  ['"private_key": "-----BEGIN PRIVATE KEY-----\\nMIIEvQIBADAN\\nBgkqhkiG9w0"', '"private_key": "[PRIVATE_KEY_REDACTED]"'],
  // 5. Bearer under any label
  ['x-trace: Bearer abc123def456ghi', 'x-trace: Bearer [REDACTED]'],
  ['| Authorization | Bearer abc123def456ghi |', '| Authorization | Bearer [REDACTED] |'],
  ['Proxy-Auth: Basic dXNlcjpwYXNzd29yZA==', 'Proxy-Auth: Basic [REDACTED]'],
  // 6. No partial leftovers
  ['aws_session_token = IQoJb3JpZ2luX2VjE//////////wEaCXVz', 'aws_session_token = [REDACTED]'],
  ['password="a,b,c,secret"', 'password="[REDACTED]"'],
  ['token=abc+def/ghi==', 'token=[REDACTED]'],
  // 7. Only the exact documentation domains are kept
  ['mail a@corp.example.com and b@example.com', 'mail [EMAIL_REDACTED] and b@example.com'],
  ['mail a@example.com.attacker.io', 'mail [EMAIL_REDACTED]'],
  // 8. A value is clean only when it is nothing but a placeholder
  ['Authorization: Basic dXNlcjpzdXBlcnNlY3JldA== (see [JWT_REDACTED])', 'Authorization: [REDACTED]'],
  ['password=hunter2[REDACTED]', 'password=[REDACTED]'],
  ['Cookie: sid=abc123 [REDACTED]', 'Cookie: [REDACTED]'],
];

// Prose, placeholders and benign key/values that must come through untouched.
const CLEAN_CASES = [
  'the password field accepts 3 chars',
  'Password field accepts unlimited length input.',
  'token_count: 5',
  '"password_hint_shown": true',
  '"password": null',
  '"tokens": 1200',
  'Bearer authentication is required',
  'Basic plan costs 10',
  '| Cookie | Purpose | Expiry |',
  'Authorization: Bearer [JWT_REDACTED]',
  '"Authorization": "[REDACTED]"',
  '{"password":"[REDACTED]"}',
  '{\\"password\\":\\"[REDACTED]\\"}',
  'Cookie: [REDACTED]',
  'aws_session_token = [REDACTED]',
  '[AWS_KEY_REDACTED],[AWS_SECRET_REDACTED]',
  'contact support@example.com for help',
  'the secret sauce of exploratory testing',
  'secret_question: what is your pet',
];

describe('redact hardening', () => {
  it.each(REDACT_CASES)('redacts %j', (input, expected) => {
    expect(redact(input).text).toBe(expected);
    expect(containsSecrets(input)).toBe(true);
  });

  it.each(CLEAN_CASES)('leaves %j alone', (input) => {
    expect(redact(input).text).toBe(input);
    expect(containsSecrets(input)).toBe(false);
  });

  it('keeps redacted JSON parseable', () => {
    const json = JSON.stringify({
      password: 'p@ss, word',
      access_token: 'abc.def.ghi1234',
      client_secret: 's3cr3t',
      apiKey: 'abcd1234efgh',
      headers: { Authorization: 'Bearer abc123def456', cookie: 'sid=abc123' },
      pin: { pwd: 1234 },
      token_count: 5,
    });
    const out = redact(json).text;
    const parsed = JSON.parse(out);
    expect(parsed.password).toBe('[REDACTED]');
    expect(parsed.headers.Authorization).toBe('[REDACTED]');
    expect(parsed.headers.cookie).toBe('[REDACTED]');
    expect(parsed.pin.pwd).toBe('[REDACTED]');
    expect(parsed.token_count).toBe(5);
  });

  it('names the new categories', () => {
    expect(redact('sk_' + 'live_abcdefghij123').redactions).toEqual(['Stripe key']);
    expect(redact('x: Bearer abc123def456ghi').redactions).toEqual(['Bearer token']);
    expect(redact('"SessionToken": "IQoJb3JpZ2luX2VjE"').redactions).toEqual(['AWS session token']);
  });
});

describe('secret-patterns.mjs stays in step with redact.ts', () => {
  it('carries the same rules, in the same order, regex for regex', () => {
    expect(SECRET_PATTERNS.map((p) => [p.category, p.re.source, p.re.flags])).toEqual(
      REDACTION_PATTERNS.map((r) => [r.name, r.pattern.source, r.pattern.flags]),
    );
  });

  it.each(REDACT_CASES.map(([input]) => input))('flags %j', (input) => {
    expect(findSecretCategories(input).length).toBeGreaterThan(0);
  });

  it.each(CLEAN_CASES)('does not flag %j', (input) => {
    expect(findSecretCategories(input)).toEqual([]);
  });

  it('only skips a value that is nothing but a placeholder (both sides agree)', () => {
    const s = 'Authorization: Basic dXNlcjpzdXBlcnNlY3JldA== (see [JWT_REDACTED])';
    expect(findSecretCategories(s)).toContain('Authorization header');
    expect(containsSecrets(s)).toBe(true);
  });
});

describe('patterns stay linear on adversarial input', () => {
  const inputs = [
    'a'.repeat(200000),
    'a.'.repeat(100000),
    'a-'.repeat(100000),
    'a@'.repeat(100000),
    '1 '.repeat(100000),
    'eyJ-'.repeat(50000),
    'sk-'.repeat(66000),
    'glpat-'.repeat(33000),
    'xoxb-'.repeat(40000),
    'cookie:'.repeat(28000),
    'password:"'.repeat(20000),
    'secret'.repeat(33000),
    'Bearer '.repeat(28000),
    '-----BEGIN PRIVATE KEY-----'.repeat(7000),
    '-----BEGIN PRIVATE KEY-----\n' + 'A'.repeat(200000),
  ];

  // Generous enough for a loaded CI box; a quadratic pattern takes seconds on these.
  const BUDGET_MS = 100;

  it.each(REDACTION_PATTERNS.map((r, i) => [i, r.name] as const))('rule %i (%s)', (i) => {
    const { pattern } = REDACTION_PATTERNS[i];
    for (const input of inputs) {
      const re = new RegExp(pattern.source, pattern.flags);
      const t = performance.now();
      input.replace(re, '');
      expect(performance.now() - t, `${input.slice(0, 12)}…`).toBeLessThan(BUDGET_MS);
    }
  });

  it('redact() and findSecretCategories() finish a 200KB input quickly', () => {
    for (const input of inputs) {
      const t = performance.now();
      redact(input);
      findSecretCategories(input);
      expect(performance.now() - t).toBeLessThan(BUDGET_MS * 5);
    }
  });
});
