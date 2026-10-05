/**
 * What may leave the machine.
 *
 * `redact()` is the pack's secret list and is shared with the write guard, so
 * it must not learn URL, host or path rules (`tests/unit/hooks.test.ts` pins
 * that parity). This module composes it: secrets first, then every URL (any
 * `scheme://`, JSON-escaped `scheme:\/\/` too) is reduced to its path, every
 * dotted hostname to `[HOST]` (a scheme-less `host.tld/path?query` keeps the
 * path and loses the query) and every absolute path under a common root
 * (`/Users`, `/home`, `/tmp`, `/srv`, `/workspace`, a drive letter, …) to its
 * basename. A path under any other root passes through: a generic rule would
 * also eat the `[URL /path]` tokens kept on purpose. The path of a URL carries
 * the signal a triage needs (which screen); the host does not.
 *
 * Pattern-based, so it has gaps, and the docs state them: IP addresses,
 * single-label hostnames (`intranet`), URL paths (kept on purpose, and they can
 * name a customer or an internal service) and free-text product, company or
 * people names all pass through unchanged. The exact request is saved next to
 * the verdict so a human can see what was sent.
 *
 * Every pattern here is bounded so hostile page text cannot stall the scrub.
 * A run of more than `LONG_RUN` token characters (`[A-Za-z0-9._%+-]` with no
 * separator) is replaced whole before `redact()` sees it: some of its rules
 * are quadratic on such runs, and nothing a triage needs is that long.
 * Callers cap each field first (`capForScrub()`); `scrubForTransmission()`
 * itself never looks past `MAX_SCRUB_CHARS`.
 */

import { posix, win32 } from 'node:path';
import { redact } from '../utils/redact.js';

export interface ScrubResult {
  text: string;
  /** `redact()` categories plus 'URL', 'Host', 'Path' and 'Long token' when they fired. */
  redactions: string[];
}

/** Longest unbroken run of token characters kept; a longer one becomes `[LONG_TOKEN]`. */
export const LONG_RUN = 160;
/** Hard ceiling on one scrubbed string; the rest is cut with a marker. */
export const MAX_SCRUB_CHARS = 200_000;

const LONG_RUN_RE = new RegExp(`[A-Za-z0-9._%+-]{${LONG_RUN + 1},}`, 'g');
/**
 * Any `scheme://…` and its JSON-escaped form `scheme:\/\/…`. The scheme is
 * bounded and may not continue a word, so a long run cannot turn every
 * position into a candidate start.
 */
const URL_RE = /(?<![A-Za-z0-9+.-])[A-Za-z][A-Za-z0-9+.-]{0,31}:(?:\/\/|\\\/\\\/)[^\s)"'<>`\]]+/g;
/**
 * A dotted hostname — labels capped at 63 characters, at most 30 of them —
 * then an optional scheme-less path and query.
 */
const HOST_RE =
  /\b((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.){1,30}[a-z]{2,63})\b(\/[^\s?#)"'<>`\]]*)?([?#][^\s)"'<>`\]]*)?/gi;
const ABS_PATH_RE =
  /(?<!\[URL )(?:\/(?:Users|home|private|tmp|var|opt|Volumes|root|mnt|srv|workspace|workspaces|builds|github|runner)\/[^\s)"'`<>]+|[A-Za-z]:\\[^\s)"'`<>]+)/g;
const AUTH_STATE_RE = /\.auth[\\/][^\s)"'`<>]+/g;

/** Tokens whose last label is a file extension are file names, not hosts. */
const FILE_EXT_RE =
  /\.(?:png|jpe?g|gif|webp|webm|mp4|json|md|ya?ml|log|txt|js|mjs|cjs|ts|tsx|css|html?|zip|csv|pdf|svg|xml)$/i;
/** Documentation hosts stay readable; they identify nothing. */
const KEEP_HOST_RE = /(?:^|\.)(?:example\.(?:com|org|net)|localhost)$/i;

/** Longer than any real address; such a match is dropped whole rather than parsed. */
const MAX_URL_CHARS = 4096;

/**
 * The path of `url` alone — no scheme, host, query or fragment — or null when
 * it does not parse. Shared with `qualiow session continue-check`.
 */
export function pathOfUrl(url: string): string | null {
  if (url.length > MAX_URL_CHARS) return null;
  try {
    const parsed = new URL(url);
    // A non-special scheme (redis:, postgres:, …) can leave an authority-shaped
    // or query-shaped tail in `pathname`; neither is kept.
    const path = parsed.pathname.replace(/^\/\/[^/]*/, '').replace(/[?#].*$/, '');
    return path || '/';
  } catch {
    return null;
  }
}

function urlToPath(url: string): string {
  const path = pathOfUrl(url);
  return path === null ? '[URL]' : `[URL ${path}]`;
}

/**
 * Cuts `text` to `max` characters BEFORE it is scrubbed, dropping the token
 * the cut lands in (half a secret no longer matches its pattern) and marking
 * the cut. A string within the cap comes back unchanged.
 */
export function capForScrub(text: string, max: number): string {
  if (text.length <= max) return text;
  let end = max;
  // Back up to the last whitespace, at most 512 characters (no regex: a `$`
  // anchored scan would retry from every position of a long unbroken run).
  for (let i = max - 1; i >= Math.max(0, max - 512); i--) {
    if (/\s/.test(text[i])) {
      end = i + 1;
      break;
    }
    if (i === Math.max(0, max - 512)) end = i;
  }
  const cut = text.slice(0, end);
  return `${cut}… [truncated ${text.length - cut.length} chars]`;
}

export function scrubForTransmission(text: string): ScrubResult {
  const redactions = new Set<string>();

  let out = capForScrub(text, MAX_SCRUB_CHARS).replace(LONG_RUN_RE, () => {
    redactions.add('Long token');
    return '[LONG_TOKEN]';
  });

  // URLs first: a `user:pass@host` or `?token=` inside one is dropped whole by
  // the parse, before the e-mail rule can mangle the authority and hide the path.
  out = out.replace(URL_RE, (match) => {
    redactions.add('URL');
    const trailing = /[.,;:!?\\]+$/.exec(match)?.[0] ?? '';
    const url = trailing ? match.slice(0, -trailing.length) : match;
    return `${urlToPath(url.replace(/\\\//g, '/'))}${trailing.replace(/\\+$/, '')}`;
  });

  const base = redact(out);
  base.redactions.forEach((c) => redactions.add(c));
  out = base.text;

  out = out.replace(AUTH_STATE_RE, () => {
    redactions.add('Path');
    return '[AUTH_STATE]';
  });

  out = out.replace(ABS_PATH_RE, (match) => {
    redactions.add('Path');
    const trailing = /[.,;:]+$/.exec(match)?.[0] ?? '';
    const path = trailing ? match.slice(0, -trailing.length) : match;
    const base = /^[A-Za-z]:\\/.test(path) ? win32.basename(path) : posix.basename(path);
    return `${base || '[PATH]'}${trailing}`;
  });

  out = out.replace(HOST_RE, (_match: string, host: string, path?: string, query?: string) => {
    if (query) redactions.add('URL');
    if (FILE_EXT_RE.test(host) || KEEP_HOST_RE.test(host)) return `${host}${path ?? ''}`;
    redactions.add('Host');
    return `[HOST]${path ?? ''}`;
  });

  return { text: out, redactions: [...redactions] };
}
