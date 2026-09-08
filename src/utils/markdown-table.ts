/**
 * Minimal GitHub-flavoured-markdown table parser.
 *
 * Splits pipe-delimited rows and drops only the leading/trailing empty cells
 * produced by the outer pipes — internal empty cells are preserved, so column
 * indices stay aligned even when a cell is blank.
 */

export interface ParsedTable {
  headers: string[];
  rows: Record<string, string>[];
}

function splitRow(line: string): string[] {
  const cells = line.split('|').map((c) => c.trim());
  // Drop the empty cell before the first pipe and after the last pipe only.
  if (cells.length && cells[0] === '') cells.shift();
  if (cells.length && cells[cells.length - 1] === '') cells.pop();
  return cells;
}

function isSeparator(line: string): boolean {
  return /^\s*\|?\s*:?-{2,}/.test(line) && /-\s*\|/.test(line + '|');
}

/**
 * Finds the first markdown table under a heading matching `headingPrefix`
 * (case-insensitive, matched at the start of the heading text), or the first
 * table in the document when no prefix is given. Returns null if none.
 *
 * Header cells are matched case-insensitively; the returned row objects are
 * keyed by the lower-cased header name.
 */
export function parseMarkdownTable(
  md: string,
  opts: { headingPrefix?: string } = {},
): ParsedTable | null {
  const lines = md.split('\n');
  let start = 0;

  if (opts.headingPrefix) {
    const prefix = opts.headingPrefix.toLowerCase();
    let found = -1;
    for (let i = 0; i < lines.length; i++) {
      const h = lines[i].match(/^#{1,6}\s+(.*)$/);
      if (h && h[1].trim().toLowerCase().startsWith(prefix)) {
        found = i + 1;
        break;
      }
    }
    if (found === -1) return null;
    start = found;
  }

  // Locate the header row: a pipe line immediately followed by a separator.
  let headerIdx = -1;
  for (let i = start; i < lines.length - 1; i++) {
    const line = lines[i];
    if (line.includes('|') && isSeparator(lines[i + 1])) {
      headerIdx = i;
      break;
    }
    // Stop scanning at the next heading when we were anchored to one.
    if (opts.headingPrefix && /^#{1,6}\s/.test(line) && i > start) {
      return null;
    }
  }
  if (headerIdx === -1) return null;

  const headers = splitRow(lines[headerIdx]);
  const keys = headers.map((h) => h.toLowerCase());
  const rows: Record<string, string>[] = [];

  for (let i = headerIdx + 2; i < lines.length; i++) {
    const line = lines[i];
    if (!line.includes('|')) break;
    if (isSeparator(line)) continue;
    const cells = splitRow(line);
    if (cells.every((c) => c === '')) continue;
    const row: Record<string, string> = {};
    keys.forEach((k, idx) => {
      row[k] = cells[idx] ?? '';
    });
    rows.push(row);
  }

  return { headers, rows };
}
