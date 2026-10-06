/**
 * Secret detection for the write-guard hook.
 *
 * Carries the same rules as `src/utils/redact.ts`, regex for regex and in the
 * same order (`tests/unit/redact-hardening.test.ts` compares the sources), so a
 * hook denial matches what `qualiow session finalize --redact` would flag on
 * the same text. Kept as a standalone, dependency-free ES module (Node
 * built-ins only, no TS import) because a git-sourced plugin install has
 * neither `dist/` nor `node_modules` to pull the real util from.
 *
 * Every pattern must stay linear on adversarial input: the hook has a timeout,
 * and a hook that times out fails open.
 *
 * `findSecretCategories` never returns the matched text itself — only
 * category names — so the hook that calls it can safely put the result in a
 * denial reason without leaking the secret it found.
 */

// Documentation domains only, matched exactly: `x@corp.example.com` is flagged.
const EMAIL_ALLOW = /@(?:example\.(?:com|org|net)|localhost)$/i;

// A value that is nothing but a redaction placeholder (optionally quoted, optionally
// after an auth scheme) is already clean; anything more than that is not.
const REDACTED_VALUE =
  /^\s*\\?["']?(?:(?:bearer|basic|token|digest)\s+)?\[[A-Z0-9_]*REDACTED\]\\?["']?\s*$/i;
const JSON_LITERAL = /^(?:null|true|false)$/i;

const QUOTED = String.raw`\\"[^"\\\n]{1,4096}\\"|"(?:[^"\\\n]|\\.){1,4096}"|'(?:[^'\\\n]|\\.){1,4096}'`;
const LOOSE = String.raw`["']?[^\s,}"']+`;
const TOKENISH = String.raw`["']?[^\s,;}"'|]{8,}`;
const LINE_REST = String.raw`[^\s|](?:[^\r\n|]*[^\s|])?`;

function kv(keys, value, sepOps = ':=') {
  return new RegExp(
    String.raw`(${keys})((?:\\?["']|\*\*)?[ \t]*[${sepOps}][ \t]*(?:\*\*[ \t]*)?)(${QUOTED}|${value})`,
    'gi',
  );
}

const PEM_HEAD = String.raw`-----BEGIN (?:[A-Z0-9]{1,20} ){0,3}PRIVATE KEY(?: BLOCK)?-----`;
const PEM_TAIL = String.raw`-----END (?:[A-Z0-9]{1,20} ){0,3}PRIVATE KEY(?: BLOCK)?-----`;
const NL = String.raw`(?:\r?\n|\\n)`;
const PEM_BODY = String.raw`(?:${NL}[ \t]*(?:(?:Proc-Type|DEK-Info|Version|Comment|Hash|Charset): [^\r\n]{0,256}|[A-Za-z0-9+/=]+(?:\.{2,}|…)?[ \t]*(?=${NL}|$|["'])|(?=${NL}|$)))*`;

function luhnValid(digits) {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    const d0 = digits.charCodeAt(i) - 48;
    if (d0 < 0 || d0 > 9) return false;
    let d = d0;
    if (alt) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    alt = !alt;
  }
  return sum % 10 === 0;
}

// Key/value rules: the third group is the value; one that is already a placeholder is clean.
const keyValueFilter = (_match, _key, _sep, value) =>
  !REDACTED_VALUE.test(value) && !JSON_LITERAL.test(value);

/**
 * category: name surfaced in denial reasons (never the matched text).
 * re: detection pattern (identical to the redact.ts rule of the same name).
 * filter(match, ...groups): optional extra check a raw regex match can't
 *     express (Luhn validity, the example.com allow-list, a value that is
 *     already a redaction placeholder).
 */
export const SECRET_PATTERNS = [
  {
    category: 'Private key',
    re: new RegExp(
      String.raw`${PEM_HEAD}(?:(?:(?!-----BEGIN )[\s\S]){0,16384}?${PEM_TAIL}|${PEM_BODY})`,
      'g',
    ),
  },
  {
    category: 'JWT',
    re: /(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9_-]{8,}\.(?:[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}|eyJ[A-Za-z0-9_-]{6,}(?:\.[A-Za-z0-9_-]*)?)/g,
  },
  {
    category: 'Authorization header',
    re: kv('authorization', LINE_REST),
    filter: keyValueFilter,
  },
  {
    category: 'Cookie header',
    re: kv('set-cookie|cookie', String.raw`[^\s|=]{1,256}=(?:[^\r\n|]*[^\s|])?`, ':=|'),
    filter: keyValueFilter,
  },
  {
    category: 'Bearer token',
    re: /\b(bearer|basic)([ \t]+)(?:(?=[A-Za-z._~+/-]*[0-9=])[A-Za-z0-9._~+/=-]{8,}|[A-Za-z0-9._~+/=-]{24,})/gi,
  },
  {
    category: 'AWS secret access key',
    re: /(\b(?:AKIA|ASIA)[0-9A-Z]{16}\b|\[AWS_KEY_REDACTED\])([\s,;:|"'=]{1,8})[A-Za-z0-9/+]{40}(?![A-Za-z0-9/+=])/g,
  },
  {
    category: 'AWS access key id',
    re: /\b(?:AKIA|ASIA|AROA|AIDA)[0-9A-Z]{16}\b/g,
  },
  {
    category: 'AWS secret access key',
    re: kv(String.raw`aws_secret_access_key|secret_?access_?key`, String.raw`["']?[^\s,;}"']+`),
    filter: keyValueFilter,
  },
  {
    category: 'AWS session token',
    re: kv(
      String.raw`aws_session_token|session_?token|x-amz-security-token|security_?token`,
      String.raw`["']?[^\s,;}"']+`,
    ),
    filter: keyValueFilter,
  },
  {
    category: 'OpenAI-style key',
    re: /(?<![A-Za-z0-9_-])sk-(?:proj-)?[A-Za-z0-9_-]{20,}/g,
  },
  {
    category: 'Stripe key',
    re: /(?<![A-Za-z0-9_])(?:(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{10,}|whsec_[A-Za-z0-9+/=]{16,})/g,
  },
  {
    category: 'GitHub token',
    re: /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g,
  },
  {
    category: 'GitLab token',
    re: /(?<![A-Za-z0-9_-])glpat-[A-Za-z0-9_-]{20,}/g,
  },
  {
    category: 'npm token',
    re: /\bnpm_[A-Za-z0-9]{36}\b/g,
  },
  {
    category: 'Google API key',
    re: /\bAIza[0-9A-Za-z_-]{35}/g,
  },
  {
    category: 'Google OAuth token',
    re: /\bya29\.[0-9A-Za-z_-]{20,}/g,
  },
  {
    category: 'Slack token',
    re: /(?<![A-Za-z0-9-])xox[abposre](?:\.xox[a-z])?-[A-Za-z0-9-]{10,}/g,
  },
  {
    category: 'Slack webhook',
    re: /(?:(?:https?:\/\/)?hooks\.slack\.com)?\/services\/T[A-Z0-9]{6,}\/B[A-Z0-9]{6,}\/[A-Za-z0-9]{16,}/g,
  },
  {
    category: 'API key',
    re: kv(String.raw`x-api-key|api[_-]?key`, TOKENISH),
    filter: keyValueFilter,
  },
  {
    category: 'Password',
    re: kv('password|passwd|pwd', LOOSE),
    filter: keyValueFilter,
  },
  {
    category: 'Token',
    re: kv(String.raw`access[_-]?token|refresh[_-]?token|token`, TOKENISH),
    filter: keyValueFilter,
  },
  {
    category: 'Secret',
    re: kv(String.raw`secret(?:[_-]?(?:key|token|value))?`, LOOSE),
    filter: keyValueFilter,
  },
  {
    category: 'SSN',
    re: /\b\d{3}-\d{2}-\d{4}\b/g,
  },
  {
    category: 'Credit card number',
    re: /\b\d(?:[ -]?\d){12,18}\b/g,
    filter: (match) => {
      const digits = match.replace(/\D/g, '');
      if (digits.length < 13 || digits.length > 19) return false;
      if (!/^[3-6]/.test(digits)) return false;
      return luhnValid(digits);
    },
  },
  {
    category: 'Email',
    re: /(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]{1,64}@(?:[A-Za-z0-9-]{1,63}\.){1,8}[A-Za-z]{2,24}\b/g,
    filter: (match) => !EMAIL_ALLOW.test(match),
  },
];

/** Number of secret-shaped matches per category in `text`; never the matched text. */
export function countSecrets(text) {
  const counts = new Map();
  for (const { category, re, filter } of SECRET_PATTERNS) {
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(text)) !== null) {
      if (match[0].length === 0) re.lastIndex += 1;
      if (filter && !filter(...match)) continue;
      counts.set(category, (counts.get(category) || 0) + 1);
    }
  }
  return counts;
}

/** Returns the category names of every secret-shaped pattern found in `text`. */
export function findSecretCategories(text) {
  const found = new Set();
  for (const { category, re, filter } of SECRET_PATTERNS) {
    if (found.has(category)) continue;
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(text)) !== null) {
      if (match[0].length === 0) re.lastIndex += 1;
      if (!filter || filter(...match)) {
        found.add(category);
        break;
      }
    }
  }
  return [...found];
}

// ─── Known values ────────────────────────────────────────────────────
//
// The patterns above catch secret-shaped text. A plain password typed into a form
// has no shape, so the write guard also looks for the literal values of the
// credential env vars. Same variants and the same minimum length as
// `src/utils/secret-values.ts` (`tests/unit/write-guard.test.ts` compares them).

/** Shorter values are skipped: matching every `1234` in a report would make it unwritable. */
export const MIN_SECRET_VALUE_LENGTH = 6;

/**
 * The forms a value takes on disk: literal, URL-encoded (encodeURIComponent and both form
 * encodings), JSON-escaped, and base64 (standard and URL-safe, padded or not). Longest first.
 */
export function secretValueVariants(value) {
  const b64 = Buffer.from(value, 'utf-8').toString('base64');
  const b64url = Buffer.from(value, 'utf-8').toString('base64url');
  const variants = new Set([
    value,
    encodeURIComponent(value),
    encodeURIComponent(value).replace(/%20/g, '+'),
    new URLSearchParams({ v: value }).toString().slice(2),
    JSON.stringify(value).slice(1, -1),
    b64,
    b64.replace(/=+$/, ''),
    b64url,
  ]);
  return [...variants]
    .filter((v) => v.length >= MIN_SECRET_VALUE_LENGTH)
    .sort((a, b) => b.length - a.length);
}

/**
 * Occurrences of each known value (any variant) in `text`, keyed by the env var NAME.
 * `values` is `[{ name, value }]`; the result never carries a value.
 */
export function countSecretValues(text, values) {
  const counts = new Map();
  if (!text) return counts;
  for (const { name, value } of values) {
    let n = 0;
    for (const variant of secretValueVariants(value)) {
      let at = text.indexOf(variant);
      while (at !== -1) {
        n += 1;
        at = text.indexOf(variant, at + variant.length);
      }
    }
    if (n > 0) counts.set(name, (counts.get(name) || 0) + n);
  }
  return counts;
}
