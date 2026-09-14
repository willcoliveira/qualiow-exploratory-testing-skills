/**
 * Canonical headers for the session index and consolidated bug list, shared by
 * `qualiow init` (which writes them) and `qualiow list` (which reads them).
 */

export const INDEX_COLUMNS = [
  'Date',
  'Kind',
  'Target',
  'Bugs',
  'Duration',
  'Status',
  'Report',
] as const;

export const ALL_BUGS_COLUMNS = [
  'ID',
  'Session',
  'Title',
  'Severity',
  'Status',
  'Report',
] as const;

function table(title: string, note: string, columns: readonly string[]): string {
  const header = `| ${columns.join(' | ')} |`;
  const sep = `|${columns.map(() => '---').join('|')}|`;
  return `# ${title}\n\n${note}\n\n${header}\n${sep}\n`;
}

export const INDEX_MD_HEADER = table(
  'Exploratory Testing Sessions',
  '_Index of exploratory testing sessions. Newest last._',
  INDEX_COLUMNS,
);

export const ALL_BUGS_MD_HEADER = table(
  'All Bugs Found',
  '_Consolidated index across all exploratory testing sessions._',
  ALL_BUGS_COLUMNS,
);

/** Column names as table keys: trimmed and lower-cased, the way rows are keyed. */
function keysOf(columns: readonly string[]): string[] {
  return columns.map((c) => c.trim().toLowerCase());
}

/**
 * True when a table's own header is the canonical column set — same names in the
 * same order, compared case-insensitively.
 */
export function headersMatchColumns(
  headers: readonly string[],
  columns: readonly string[],
): boolean {
  const a = keysOf(headers);
  const b = keysOf(columns);
  return a.length === b.length && a.every((h, i) => h === b[i]);
}

/**
 * Canonical columns a table's header does not carry, in canonical order — what a
 * file written by an earlier version is missing.
 */
export function missingColumns(
  headers: readonly string[],
  columns: readonly string[],
): string[] {
  const present = new Set(keysOf(headers));
  return columns.filter((c) => !present.has(c.trim().toLowerCase()));
}

/**
 * Renders one row in a table's OWN column order, taking each cell from `values`
 * keyed by lower-cased column name. A column with no value is left empty, so an
 * index written by an earlier version keeps its width instead of gaining cells
 * that would shift every value one column to the right when read back.
 */
export function buildTableRow(
  headers: readonly string[],
  values: Record<string, string>,
): string {
  const cells = keysOf(headers).map((key) => values[key] ?? '');
  return `| ${cells.join(' | ')} |`;
}
