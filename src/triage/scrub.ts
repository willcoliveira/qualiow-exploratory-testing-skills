/**
 * What may leave the machine.
 *
 * `redact()` is the pack's secret list and is shared with the write guard, so
 * it must not learn URL, host or path rules (`tests/unit/hooks.test.ts` pins
 * that parity). This module composes it: secrets first, then every URL is
 * reduced to its path, every dotted hostname to `[HOST]` and every absolute
 * path under a common root (`/Users`, `/home`, `/tmp`, `/srv`, `/workspace`, a
 * drive letter, …) to its basename. A path under any other root passes
 * through: a generic rule would also eat the `[URL /path]` tokens kept on
 * purpose. The path of a URL carries the signal a triage needs (which screen);
 * the host does not.
 *
 * Pattern-based, so it has gaps, and the docs state them: IP addresses,
 * single-label hostnames (`intranet`), URL paths (kept on purpose, and they can
 * name a customer or an internal service) and free-text product, company or
 * people names all pass through unchanged. The exact request is saved next to
 * the verdict so a human can see what was sent.
 */

import { posix, win32 } from 'node:path';
import { redact } from '../utils/redact.js';

export interface ScrubResult {
  text: string;
  /** `redact()` categories plus 'URL', 'Host' and 'Path' when they fired. */
  redactions: string[];
}

const URL_RE = /(?:https?|wss?):\/\/[^\s)"'<>`\]]+/gi;
const HOST_RE = /\b(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}\b/gi;
const ABS_PATH_RE =
  /(?<!\[URL )(?:\/(?:Users|home|private|tmp|var|opt|Volumes|root|mnt|srv|workspace|workspaces|builds|github|runner)\/[^\s)"'`<>]+|[A-Za-z]:\\[^\s)"'`<>]+)/g;
const AUTH_STATE_RE = /\.auth[\\/][^\s)"'`<>]+/g;

/** Tokens whose last label is a file extension are file names, not hosts. */
const FILE_EXT_RE =
  /\.(?:png|jpe?g|gif|webp|webm|mp4|json|md|ya?ml|log|txt|js|mjs|cjs|ts|tsx|css|html?|zip|csv|pdf|svg|xml)$/i;
/** Documentation hosts stay readable; they identify nothing. */
const KEEP_HOST_RE = /(?:^|\.)(?:example\.(?:com|org|net)|localhost)$/i;

function urlToPath(url: string): string {
  try {
    const parsed = new URL(url);
    return `[URL ${parsed.pathname || '/'}]`;
  } catch {
    return '[URL]';
  }
}

export function scrubForTransmission(text: string): ScrubResult {
  const redactions = new Set<string>();

  // URLs first: a `user:pass@host` or `?token=` inside one is dropped whole by
  // the parse, before the e-mail rule can mangle the authority and hide the path.
  let out = text.replace(URL_RE, (match) => {
    redactions.add('URL');
    const trailing = /[.,;:!?]+$/.exec(match)?.[0] ?? '';
    const url = trailing ? match.slice(0, -trailing.length) : match;
    return `${urlToPath(url)}${trailing}`;
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

  out = out.replace(HOST_RE, (match) => {
    if (FILE_EXT_RE.test(match)) return match;
    if (KEEP_HOST_RE.test(match)) return match;
    redactions.add('Host');
    return '[HOST]';
  });

  return { text: out, redactions: [...redactions] };
}
