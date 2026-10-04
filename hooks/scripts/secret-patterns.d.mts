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
