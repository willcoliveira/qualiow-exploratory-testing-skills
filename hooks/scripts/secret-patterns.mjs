/**
 * Secret detection for the write-guard hook.
 *
 * Mirrors the categories and patterns in `src/utils/redact.ts` as closely as
 * possible, so a hook denial matches what `qualiow session finalize --redact`
 * would flag on the same text. Kept as a standalone, dependency-free ES
 * module (Node built-ins only, no TS import) because a git-sourced plugin
 * install has neither `dist/` nor `node_modules` to pull the real util from.
 *
 * `findSecretCategories` never returns the matched text itself — only
 * category names — so the hook that calls it can safely put the result in a
 * denial reason without leaking the secret it found.
 */

const EMAIL_ALLOW = /(?:@|\.)(?:example\.(?:com|org|net)|localhost)$/i;

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

/**
 * category: name surfaced in denial reasons (never the matched text).
 * re: detection pattern (mirrors redact.ts; capture groups dropped since
 *     only presence, not replacement, is needed here).
 * filter(match): optional extra check a raw regex match can't express
 *     (Luhn validity, the example.com/localhost allow-list).
 */
export const SECRET_PATTERNS = [
  {
    category: 'Private key',
    re: /-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z0-9 ]+ )?PRIVATE KEY-----/g,
  },
  {
    category: 'JWT',
    re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\b/g,
  },
  {
    category: 'Authorization header',
    re: /authorization\s*[:=]\s*\S[^\n\r]*/gi,
  },
  {
    category: 'Cookie header',
    re: /^(?:set-cookie|cookie)\s*:\s*.+$/gim,
  },
  {
    category: 'AWS access key id',
    re: /\b(?:AKIA|ASIA|AROA|AIDA)[0-9A-Z]{16}\b/g,
  },
  {
    category: 'AWS secret access key',
    re: /aws_secret_access_key\s*[:=]\s*\S+/gi,
  },
  {
    category: 'OpenAI-style key',
    re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g,
  },
  {
    category: 'GitHub token',
    re: /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g,
  },
  {
    category: 'Slack token',
    re: /\bxox[abposr]-[A-Za-z0-9-]{10,}\b/g,
  },
  {
    category: 'API key',
    re: /(?:x-api-key|api[_-]?key)\s*[:=]\s*["']?[A-Za-z0-9._-]{8,}["']?/gi,
  },
  {
    category: 'Password',
    re: /(?:password|passwd|pwd)\s*[:=]\s*["']?[^\s,}"']+["']?/gi,
  },
  {
    category: 'Token',
    re: /(?:access[_-]?token|refresh[_-]?token|token)\s*[:=]\s*["']?[A-Za-z0-9._-]{8,}["']?/gi,
  },
  {
    category: 'Secret',
    re: /[a-z_]*secret\s*[:=]\s*["']?[^\s,}"']+["']?/gi,
  },
  {
    category: 'SSN',
    re: /\b\d{3}-\d{2}-\d{4}\b/g,
  },
  {
    category: 'Email',
    re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    filter: (match) => !EMAIL_ALLOW.test(match),
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
];

/** Returns the category names of every secret-shaped pattern found in `text`. */
export function findSecretCategories(text) {
  const found = new Set();
  for (const { category, re, filter } of SECRET_PATTERNS) {
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(text)) !== null) {
      // A value that is already a redaction placeholder is clean: redact.ts leaves it
      // untouched, so containsSecrets() is false for it and this must agree.
      if (/REDACTED\]/.test(match[0])) {
        if (match[0].length === 0) re.lastIndex += 1;
        continue;
      }
      if (!filter || filter(match[0])) {
        found.add(category);
        break;
      }
      if (match[0].length === 0) re.lastIndex += 1;
    }
  }
  return [...found];
}
