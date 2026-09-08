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
