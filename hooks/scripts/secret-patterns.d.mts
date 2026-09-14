export interface SecretPattern {
  category: string;
  re: RegExp;
  filter?: (match: string) => boolean;
}
export const SECRET_PATTERNS: SecretPattern[];
/** Category names of every secret-shaped pattern found in `text`; never the matched text. */
export function findSecretCategories(text: string): string[];
