/**
 * The single confidentiality header used on every generated artefact
 * (templates, session reports, formatter output).
 */

export const CONFIDENTIALITY_LINES = [
  'CONFIDENTIAL: This report may contain internal URLs, security vulnerabilities,',
  'and application details. Do not share outside your organization without review.',
] as const;

/** Markdown blockquote form, e.g. for the top of a `.md` artefact. */
export const CONFIDENTIALITY_HEADER_MD = CONFIDENTIALITY_LINES.map(
  (l) => `> ${l}`,
).join('\n');

/** Plain one-line form, e.g. for an HTML banner or a CSV/JSON note. */
export const CONFIDENTIALITY_NOTICE = CONFIDENTIALITY_LINES.join(' ');

/** True when `text` already begins (ignoring blank lines) with the header. */
export function hasConfidentialityHeader(text: string): boolean {
  return /CONFIDENTIAL:\s*This report may contain internal URLs/i.test(
    text.slice(0, 400),
  );
}
