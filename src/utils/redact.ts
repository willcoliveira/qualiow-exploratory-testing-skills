/**
 * Credential and secret redaction.
 *
 * Applied to every report and bug field before it is written to disk or handed
 * to a formatter. Patterns are ordered specific-first. Key/value patterns
 * require an actual `=` or `:` operator so ordinary prose ("Password field
 * accepts…", "the secret sauce") is left intact; card numbers are only redacted
 * when they pass a Luhn check, so millisecond timestamps and order ids survive.
 */

interface RedactionRule {
  name: string;
  pattern: RegExp;
  replacement?: string;
  replace?: (match: string, ...groups: string[]) => string;
}

const EMAIL_ALLOW = /(?:@|\.)(?:example\.(?:com|org|net)|localhost)$/i;

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

const RULES: RedactionRule[] = [
  {
    name: 'Private key',
    pattern:
      /-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z0-9 ]+ )?PRIVATE KEY-----/g,
    replacement: '[PRIVATE_KEY_REDACTED]',
  },
  {
    name: 'JWT',
    pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\b/g,
    replacement: '[JWT_REDACTED]',
  },
  {
    name: 'Authorization header',
    pattern: /(authorization)(\s*[:=]\s*)(\S[^\n\r]*)/gi,
    replace: (m: string, k: string, sep: string, value: string) =>
      /_REDACTED\]/.test(value) ? m : `${k}${sep}[REDACTED]`,
  },
  {
    name: 'Cookie header',
    pattern: /^(set-cookie|cookie)(\s*:\s*).+$/gim,
    replace: (_m, k: string, sep: string) => `${k}${sep}[REDACTED]`,
  },
  {
    name: 'AWS access key id',
    pattern: /\b(?:AKIA|ASIA|AROA|AIDA)[0-9A-Z]{16}\b/g,
    replacement: '[AWS_KEY_REDACTED]',
  },
  {
    name: 'AWS secret access key',
    pattern: /(aws_secret_access_key)(\s*[:=]\s*)\S+/gi,
    replace: (_m, k: string, sep: string) => `${k}${sep}[REDACTED]`,
  },
  {
    name: 'OpenAI-style key',
    pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g,
    replacement: '[SK_KEY_REDACTED]',
  },
  {
    name: 'GitHub token',
    pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g,
    replacement: '[GITHUB_TOKEN_REDACTED]',
  },
  {
    name: 'Slack token',
    pattern: /\bxox[abposr]-[A-Za-z0-9-]{10,}\b/g,
    replacement: '[SLACK_TOKEN_REDACTED]',
  },
  {
    name: 'API key',
    pattern: /(x-api-key|api[_-]?key)(\s*[:=]\s*)["']?[A-Za-z0-9._-]{8,}["']?/gi,
    replace: (_m, k: string, sep: string) => `${k}${sep}[REDACTED]`,
  },
  {
    name: 'Password',
    pattern: /(password|passwd|pwd)(\s*[:=]\s*)["']?[^\s,}"']+["']?/gi,
    replace: (_m, k: string, sep: string) => `${k}${sep}[REDACTED]`,
  },
  {
    name: 'Token',
    pattern: /(access[_-]?token|refresh[_-]?token|token)(\s*[:=]\s*)["']?[A-Za-z0-9._-]{8,}["']?/gi,
    replace: (_m, k: string, sep: string) => `${k}${sep}[REDACTED]`,
  },
  {
    name: 'Secret',
    pattern: /([a-z_]*secret)(\s*[:=]\s*)["']?[^\s,}"']+["']?/gi,
    replace: (_m, k: string, sep: string) => `${k}${sep}[REDACTED]`,
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
  if (opts.emails !== false) {
    rules.push({
      name: 'Email',
      pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
      replace: (match: string) =>
        EMAIL_ALLOW.test(match) ? match : '[EMAIL_REDACTED]',
    });
  }

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

export const REDACTION_CATEGORIES = RULES.map((r) => r.name).concat('Email');
