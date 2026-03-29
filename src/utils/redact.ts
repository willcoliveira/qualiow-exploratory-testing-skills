/**
 * Credential and secret redaction utility.
 * Patterns derived from data/security/SECURITY-POLICY.md.
 */

interface RedactionPattern {
  name: string;
  pattern: RegExp;
  replacement: string;
}

const REDACTION_PATTERNS: RedactionPattern[] = [
  {
    name: 'JWT token',
    pattern: /Bearer\s+eyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+/g,
    replacement: 'Bearer [JWT_REDACTED]',
  },
  {
    name: 'API key',
    pattern: /api[_\-]?key[=:\s]+[A-Za-z0-9\-_]{16,}/gi,
    replacement: 'api_key=[API_KEY_REDACTED]',
  },
  {
    name: 'Password',
    pattern: /password[=:\s]+[^\s,}"']+/gi,
    replacement: 'password=[REDACTED]',
  },
  {
    name: 'Token',
    pattern: /token[=:\s]+[A-Za-z0-9\-_]{16,}/gi,
    replacement: 'token=[TOKEN_REDACTED]',
  },
  {
    name: 'Secret',
    pattern: /secret[=:\s]+[^\s,}"']+/gi,
    replacement: 'secret=[REDACTED]',
  },
  {
    name: 'SSN',
    pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
    replacement: '[SSN_REDACTED]',
  },
  {
    name: 'Credit card number',
    pattern: /\b\d{13,19}\b/g,
    replacement: '[CARD_NUMBER_REDACTED]',
  },
];

/**
 * Redacts secrets from the given text.
 * Returns the redacted text and a list of which secret types were found.
 */
export function redact(text: string): { text: string; redactions: string[] } {
  const redactions: string[] = [];
  let result = text;

  for (const { name, pattern, replacement } of REDACTION_PATTERNS) {
    // Reset lastIndex for global regex
    pattern.lastIndex = 0;
    if (pattern.test(result)) {
      redactions.push(name);
      pattern.lastIndex = 0;
      result = result.replace(pattern, replacement);
    }
  }

  return { text: result, redactions };
}

/**
 * Checks whether the text contains any detectable secrets.
 */
export function containsSecrets(text: string): boolean {
  for (const { pattern } of REDACTION_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) {
      return true;
    }
  }
  return false;
}
