/**
 * Session directory naming — the single scheme used by every session skill,
 * the `explore` CLI command, the report resolver and the list command.
 *
 * Scheme: output/sessions/<YYYY-MM-DD-HHmm>-<kind>-<slug>/
 * Date-first so a lexicographic sort is chronological.
 */

export const SESSION_KINDS = ['explore', 'quick', 'mobile', 'backend'] as const;
export type SessionKind = (typeof SESSION_KINDS)[number];

export const SESSION_DIR_RE =
  /^(\d{4}-\d{2}-\d{2}-\d{4})-(explore|quick|mobile|backend)-([a-z0-9][a-z0-9-]*)$/;

/**
 * DISCOVERY ONLY — directories written before the current scheme existed:
 * a `YYYY-MM-DD` prefix, an optional `HHmm`, then any remainder
 * (`2026-05-22-1045-demo-target`, `2026-07-09-quick-preprod-product-search`).
 *
 * Never use this to create or validate a new directory name: `SESSION_DIR_RE`
 * stays the only writer. It exists so `prune` and the unindexed scan can see
 * output an upgraded project already has on disk.
 */
export const LEGACY_SESSION_DIR_RE = /^\d{4}-\d{2}-\d{2}(?:-\d{4})?-.+/;

/**
 * Turns an arbitrary target id, ticket or URL into a filesystem-safe slug:
 * lowercase, alphanumerics and single dashes, no leading/trailing dash,
 * capped at 40 chars. A full URL is reduced to its hostname first.
 */
export function slugify(input: string): string {
  let s = (input ?? '').trim();
  try {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) {
      s = new URL(s).hostname;
    }
  } catch {
    /* not a URL — use as-is */
  }
  s = s
    .toLowerCase()
    .replace(/^_+/, '') // drop the leading underscore of `_example-*` ids
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  return s || 'session';
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** `2026-09-08-1813` for the given date (local time). */
export function sessionTimestamp(date: Date = new Date()): string {
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}`
  );
}

/** Full session directory name, e.g. `2026-09-08-1813-explore-parabank`. */
export function sessionDirName(
  kind: SessionKind,
  target: string,
  date: Date = new Date(),
): string {
  return `${sessionTimestamp(date)}-${kind}-${slugify(target)}`;
}

export interface ParsedSessionDir {
  timestamp: string;
  kind: SessionKind;
  slug: string;
}

/** Parses a directory name back into its parts, or null if it does not match. */
export function parseSessionDirName(name: string): ParsedSessionDir | null {
  const m = SESSION_DIR_RE.exec(name);
  if (!m) return null;
  return { timestamp: m[1], kind: m[2] as SessionKind, slug: m[3] };
}

export interface DiscoveredSessionDir {
  /** The directory name as it is on disk. */
  name: string;
  /** Start of the session in local time; midnight when the name carries no `HHmm`. */
  timestamp: Date;
  /** True when the name predates the current `<YYYY-MM-DD-HHmm>-<kind>-<slug>` scheme. */
  legacy: boolean;
}

const DATE_PREFIX_RE = /^(\d{4})-(\d{2})-(\d{2})(?:-(\d{2})(\d{2}))?(?=-|$)/;

/**
 * Describes a session directory found on disk — current scheme or legacy — so
 * `prune` and the unindexed scan can treat both. Returns null when the name
 * carries no date prefix at all, which is what keeps unrelated directories out.
 */
export function describeSessionDir(name: string): DiscoveredSessionDir | null {
  const parsed = parseSessionDirName(name);
  const legacy = !parsed;
  if (!parsed && !LEGACY_SESSION_DIR_RE.test(name)) return null;

  const m = DATE_PREFIX_RE.exec(name);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  const timestamp = new Date(Number(y), Number(mo) - 1, Number(d), Number(h ?? 0), Number(mi ?? 0));
  return { name, timestamp, legacy };
}
