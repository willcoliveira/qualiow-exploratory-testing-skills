export interface SecretPattern {
  category: string;
  re: RegExp;
  /** Receives the match and its capture groups, as `String.prototype.replace` would. */
  filter?: (match: string, ...groups: string[]) => boolean;
}
export const SECRET_PATTERNS: SecretPattern[];
/** Category names of every secret-shaped pattern found in `text`; never the matched text. */
export function findSecretCategories(text: string): string[];
/** Number of secret-shaped matches per category in `text`; never the matched text. */
export function countSecrets(text: string): Map<string, number>;
/** Values shorter than this are not matched. Same as `src/utils/secret-values.ts`. */
export const MIN_SECRET_VALUE_LENGTH: number;
/** Literal, URL-encoded, JSON-escaped and base64 forms of `value`, longest first. */
export function secretValueVariants(value: string): string[];
/** Occurrences of each known value (any variant) in `text`, keyed by env var NAME; never the value. */
export function countSecretValues(
  text: string,
  values: ReadonlyArray<{ name: string; value: string }>,
): Map<string, number>;
