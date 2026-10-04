/**
 * Credential and secret redaction.
 *
 * Applied to every report and bug field before it is written to disk or handed
 * to a formatter. Patterns are ordered specific-first. Key/value patterns
 * require an actual `=` or `:` operator so ordinary prose ("Password field
 * accepts…", "the secret sauce") is left intact; card numbers are only redacted
 * when they pass a Luhn check, so millisecond timestamps and order ids survive.
 *
 * `hooks/scripts/secret-patterns.mjs` carries the same list, regex for regex
 * (`tests/unit/redact-hardening.test.ts` compares the sources). Every pattern
 * must stay linear on adversarial input: a write-guard hook that times out
 * fails open, so no unbounded quantifier may restart at every offset of a run.
 */

interface RedactionRule {
  name: string;
  pattern: RegExp;
  replacement?: string;
  replace?: (match: string, ...groups: string[]) => string;
}

// Documentation domains only, matched exactly: `x@corp.example.com` is redacted.
const EMAIL_ALLOW = /@(?:example\.(?:com|org|net)|localhost)$/i;

// A value that is nothing but a redaction placeholder (optionally quoted, optionally
// after an auth scheme) is already clean; anything more than that is not.
const REDACTED_VALUE =
  /^\s*\\?["']?(?:(?:bearer|basic|token|digest)\s+)?\[[A-Z0-9_]*REDACTED\]\\?["']?\s*$/i;
const JSON_LITERAL = /^(?:null|true|false)$/i;

// Key/value building blocks. The separator takes an optional closing quote (JSON,
// escaped JSON, single-quoted keys) or markdown bold; a quoted value is matched
// whole, so `password="a,b,c"` cannot leave `,b,c` behind.
const QUOTED = String.raw`\\"[^"\\\n]{1,4096}\\"|"(?:[^"\\\n]|\\.){1,4096}"|'(?:[^'\\\n]|\\.){1,4096}'`;
const LOOSE = String.raw`["']?[^\s,}"']+`;
const TOKENISH = String.raw`["']?[^\s,;}"'|]{8,}`;
const LINE_REST = String.raw`[^\s|](?:[^\r\n|]*[^\s|])?`;

function kv(keys: string, value: string, sepOps = ':='): RegExp {
  return new RegExp(
    String.raw`(${keys})((?:\\?["']|\*\*)?[ \t]*[${sepOps}][ \t]*(?:\*\*[ \t]*)?)(${QUOTED}|${value})`,
    'gi',
  );
}

const PEM_HEAD = String.raw`-----BEGIN (?:[A-Z0-9]{1,20} ){0,3}PRIVATE KEY(?: BLOCK)?-----`;
const PEM_TAIL = String.raw`-----END (?:[A-Z0-9]{1,20} ){0,3}PRIVATE KEY(?: BLOCK)?-----`;
const NL = String.raw`(?:\r?\n|\\n)`;
// A key cut off before its END line: the armour headers and base64 lines that follow.
const PEM_BODY = String.raw`(?:${NL}[ \t]*(?:(?:Proc-Type|DEK-Info|Version|Comment|Hash|Charset): [^\r\n]{0,256}|[A-Za-z0-9+/=]+(?:\.{2,}|…)?[ \t]*(?=${NL}|$|["'])|(?=${NL}|$)))*`;

function luhnValid(digits: string): boolean {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (d < 0 || d > 9) return false;
    if (alt) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    alt = !alt;
  }
  return sum % 10 === 0;
}

function isRedactedValue(value: string): boolean {
  return REDACTED_VALUE.test(value) || JSON_LITERAL.test(value);
}

/** Replaces a key/value match, keeping the value's quoting so JSON stays valid. */
function redactKeyValue(m: string, key: string, sep: string, value: string): string {
  if (isRedactedValue(value)) return m;
  for (const q of ['\\"', '"', "'"]) {
    if (value.length > q.length * 2 && value.startsWith(q) && value.endsWith(q)) {
      return `${key}${sep}${q}[REDACTED]${q}`;
    }
  }
  if (sep.startsWith('\\"')) return `${key}${sep}\\"[REDACTED]\\"`;
  if (sep.startsWith('"')) return `${key}${sep}"[REDACTED]"`;
  return `${key}${sep}[REDACTED]`;
}

const RULES: RedactionRule[] = [
  {
    name: 'Private key',
    pattern: new RegExp(
      String.raw`${PEM_HEAD}(?:(?:(?!-----BEGIN )[\s\S]){0,16384}?${PEM_TAIL}|${PEM_BODY})`,
      'g',
    ),
    replacement: '[PRIVATE_KEY_REDACTED]',
  },
  {
    // Three segments, or header + payload with the signature cut off.
    name: 'JWT',
    pattern:
      /(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9_-]{8,}\.(?:[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}|eyJ[A-Za-z0-9_-]{6,}(?:\.[A-Za-z0-9_-]*)?)/g,
    replacement: '[JWT_REDACTED]',
  },
  {
    name: 'Authorization header',
    pattern: kv('authorization', LINE_REST),
    replace: redactKeyValue,
  },
  {
    // Any position, and a markdown table cell (`| Cookie | sid=… |`); a cookie value has a `=`.
    name: 'Cookie header',
    pattern: kv('set-cookie|cookie', String.raw`[^\s|=]{1,256}=(?:[^\r\n|]*[^\s|])?`, ':=|'),
    replace: redactKeyValue,
  },
  {
    // Under any label. Needs a digit, a `=` or 24+ chars so "Bearer authentication" survives.
    name: 'Bearer token',
    pattern:
      /\b(bearer|basic)([ \t]+)(?:(?=[A-Za-z._~+/-]*[0-9=])[A-Za-z0-9._~+/=-]{8,}|[A-Za-z0-9._~+/=-]{24,})/gi,
    replace: (_m, scheme: string, ws: string) => `${scheme}${ws}[REDACTED]`,
  },
  {
    // A bare 40-char secret only next to its key id (CSV, table row, credentials dump).
    name: 'AWS secret access key',
    pattern:
      /(\b(?:AKIA|ASIA)[0-9A-Z]{16}\b|\[AWS_KEY_REDACTED\])([\s,;:|"'=]{1,8})[A-Za-z0-9/+]{40}(?![A-Za-z0-9/+=])/g,
    replace: (_m, _id: string, sep: string) => `[AWS_KEY_REDACTED]${sep}[AWS_SECRET_REDACTED]`,
  },
  {
    name: 'AWS access key id',
    pattern: /\b(?:AKIA|ASIA|AROA|AIDA)[0-9A-Z]{16}\b/g,
    replacement: '[AWS_KEY_REDACTED]',
  },
  {
    name: 'AWS secret access key',
    pattern: kv(String.raw`aws_secret_access_key|secret_?access_?key`, String.raw`["']?[^\s,;}"']+`),
    replace: redactKeyValue,
  },
  {
    name: 'AWS session token',
    pattern: kv(
      String.raw`aws_session_token|session_?token|x-amz-security-token|security_?token`,
      String.raw`["']?[^\s,;}"']+`,
    ),
    replace: redactKeyValue,
  },
  {
    name: 'OpenAI-style key',
    pattern: /(?<![A-Za-z0-9_-])sk-(?:proj-)?[A-Za-z0-9_-]{20,}/g,
    replacement: '[SK_KEY_REDACTED]',
  },
  {
    name: 'Stripe key',
    pattern: /(?<![A-Za-z0-9_])(?:(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{10,}|whsec_[A-Za-z0-9+/=]{16,})/g,
    replacement: '[STRIPE_KEY_REDACTED]',
  },
  {
    name: 'GitHub token',
    pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g,
    replacement: '[GITHUB_TOKEN_REDACTED]',
  },
  {
    name: 'GitLab token',
    pattern: /(?<![A-Za-z0-9_-])glpat-[A-Za-z0-9_-]{20,}/g,
    replacement: '[GITLAB_TOKEN_REDACTED]',
  },
  {
    name: 'npm token',
    pattern: /\bnpm_[A-Za-z0-9]{36}\b/g,
    replacement: '[NPM_TOKEN_REDACTED]',
  },
  {
    name: 'Google API key',
    pattern: /\bAIza[0-9A-Za-z_-]{35}/g,
    replacement: '[GOOGLE_KEY_REDACTED]',
  },
  {
    name: 'Google OAuth token',
    pattern: /\bya29\.[0-9A-Za-z_-]{20,}/g,
    replacement: '[GOOGLE_TOKEN_REDACTED]',
  },
  {
    name: 'Slack token',
    pattern: /(?<![A-Za-z0-9-])xox[abposre](?:\.xox[a-z])?-[A-Za-z0-9-]{10,}/g,
    replacement: '[SLACK_TOKEN_REDACTED]',
  },
  {
    // Host optional: src/triage/scrub.ts cuts URLs to their path before redacting.
    name: 'Slack webhook',
    pattern:
      /(?:(?:https?:\/\/)?hooks\.slack\.com)?\/services\/T[A-Z0-9]{6,}\/B[A-Z0-9]{6,}\/[A-Za-z0-9]{16,}/g,
    replacement: '[SLACK_WEBHOOK_REDACTED]',
  },
  {
    name: 'API key',
    pattern: kv(String.raw`x-api-key|api[_-]?key`, TOKENISH),
    replace: redactKeyValue,
  },
  {
    name: 'Password',
    pattern: kv('password|passwd|pwd', LOOSE),
    replace: redactKeyValue,
  },
  {
    name: 'Token',
    pattern: kv(String.raw`access[_-]?token|refresh[_-]?token|token`, TOKENISH),
    replace: redactKeyValue,
  },
  {
    // No identifier prefix in the pattern (`client_` stays outside the match), which is
    // what keeps it linear; `[a-z_]*secret` was quadratic on long runs of letters.
    name: 'Secret',
    pattern: kv(String.raw`secret(?:[_-]?(?:key|token|value))?`, LOOSE),
    replace: redactKeyValue,
  },
  {
    name: 'SSN',
    pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
    replacement: '[SSN_REDACTED]',
  },
  {
    name: 'Credit card number',
    pattern: /\b\d(?:[ -]?\d){12,18}\b/g,
    replace: (match: string) => {
      const digits = match.replace(/\D/g, '');
      if (digits.length < 13 || digits.length > 19) return match;
      if (!/^[3-6]/.test(digits)) return match;
      return luhnValid(digits) ? '[CARD_NUMBER_REDACTED]' : match;
    },
  },
];

// Starts only where a run of local-part characters starts, and every part is
// bounded, so a long `a.a.a.…` run is scanned once rather than once per offset.
const EMAIL_RULE: RedactionRule = {
  name: 'Email',
  pattern:
    /(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]{1,64}@(?:[A-Za-z0-9-]{1,63}\.){1,8}[A-Za-z]{2,24}\b/g,
  replace: (match: string) => (EMAIL_ALLOW.test(match) ? match : '[EMAIL_REDACTED]'),
};

export interface RedactOptions {
  // Redact email addresses (default true); example.* and localhost addresses are kept.
  emails?: boolean;
}

/** Redacts secrets, returning the cleaned text and which categories fired. */
export function redact(
  text: string,
  opts: RedactOptions = {},
): { text: string; redactions: string[] } {
  const redactions = new Set<string>();
  let result = text;

  const rules = RULES.slice();
  if (opts.emails !== false) rules.push(EMAIL_RULE);

  for (const rule of rules) {
    rule.pattern.lastIndex = 0;
    let fired = false;
    result = result.replace(rule.pattern, (...args) => {
      const match = args[0] as string;
      const groups = args.slice(1, -2) as string[];
      const out = rule.replace
        ? rule.replace(match, ...groups)
        : (rule.replacement as string);
      if (out !== match) fired = true;
      return out;
    });
    if (fired) redactions.add(rule.name);
  }

  return { text: result, redactions: [...redactions] };
}

/** True when the text contains any detectable secret. */
export function containsSecrets(text: string): boolean {
  return redact(text).redactions.length > 0;
}

export const REDACTION_CATEGORIES = [...new Set(RULES.map((r) => r.name).concat('Email'))];

/** Rule names and patterns in order, so the hook's copy can be checked against them. */
export const REDACTION_PATTERNS: ReadonlyArray<{ name: string; pattern: RegExp }> = RULES.concat(
  EMAIL_RULE,
).map(({ name, pattern }) => ({ name, pattern }));
