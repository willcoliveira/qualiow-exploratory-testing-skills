/**
 * Line handling shared by every markdown reader and index writer.
 *
 * A Windows checkout (`core.autocrlf`) or an editor there gives a file CRLF line
 * ends. Split on `\n` alone, each line keeps a trailing `\r`, and a pattern
 * anchored with `$` — `/^(#{1,6})\s+(.*)$/` for a heading — never matches it, so a
 * section reads as empty and a table under a heading as absent. Everything that
 * reads markdown goes through these helpers instead.
 */

/** The lines of `text`, split on LF or CRLF, with no `\r` left on any of them. */
export function splitLines(text: string): string[] {
  return text.split(/\r?\n/);
}

/** `text` with every CRLF turned into LF. */
export function normalizeEol(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

/**
 * The line ending a file already uses — CRLF when it has any, else LF — so a
 * writer that edits the file keeps it consistent instead of mixing the two.
 */
export function detectEol(text: string): '\r\n' | '\n' {
  return text.includes('\r\n') ? '\r\n' : '\n';
}
