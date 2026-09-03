# API Probes — Reaching the Endpoint Behind the Screen

How to call a service's own HTTP surface with real credentials, what to ask it, and how
to read the answer. Companion to `phases/03b-api-verification.md`.

## 1. Getting an Authenticated Request Context

### In-page `fetch` — the default

Run the request inside the page that is already logged in. It inherits the session
cookie, the CSRF token and every client interceptor, so there is no token to obtain, no
credential to store, and no impersonation to arrange.

```bash
# once per environment — interactive login the first time, the profile persists it
playwright-cli -s=alpha open https://service-alpha.example.com/ \
  --headed --profile .auth/alpha-profile

# then, as many times as you like
playwright-cli -s=alpha eval "$(cat probes/search-cases.js)" --raw
```

The probe is an async function returning a string or a JSON-serialisable value:

```js
async () => {
  const cases = [
    ['identity',        { query: 'known-value' },      {}],
    ['empty string',    { query: '' },                 {}],
    ['absent field',    {},                            {}],
    ['limit above cap', { query: 'known-value' },      { limit: 1001 }],
  ];
  const out = [];
  for (const [label, body, qs] of cases) {
    const p = new URLSearchParams(Object.entries(qs).map(([k, v]) => [k, String(v)]));
    const url = '/api/v1/search' + (p.toString() ? '?' + p : '');
    try {
      const t0 = performance.now();
      const r = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const txt = await r.text();
      let count = null, rows = null;
      try {
        const j = JSON.parse(txt);
        count = j.totalCount ?? j.total ?? null;
        rows = (j.items ?? j.data ?? []).length;
      } catch { /* not JSON — keep the body prefix instead */ }
      out.push([
        label, r.status,
        count === null ? '-' : count,
        rows === null ? '-' : rows,
        Math.round(performance.now() - t0) + 'ms',
        count === null ? txt.replace(/\s+/g, ' ').slice(0, 100) : '',
      ].join(' | '));
    } catch (e) {
      out.push(label + ' | NETERR | ' + String(e).slice(0, 60));
    }
  }
  return out.join('\n');
}
```

Two flags earn their place:

- **`--headed`** — an interactive identity provider (SSO, MFA, a device posture check)
  cannot complete headless. Log in once with a head; the profile keeps it.
- **`--filename`** — writes the result straight to a file. Use it for anything large:
  the evidence lands on disk without being paid for in context.

### Out-of-browser runner — when you need volume

For a long matrix, or one you want to re-run identically in several environments, drive
`curl` from a small script and emit a machine-readable result per case: label, status,
count, rows, elapsed, error prefix.

Take the credential from the authenticated profile (`playwright-cli cookie-list`), write
it to a file **outside the repository**, and pass the path in by environment variable.
Never inline a session credential into a script, a committed file, a report, or a
message. It is a live credential for a real account.

### Which mode proves what

| Mode | Proves |
|------|--------|
| In-page `fetch` | The endpoint behaves this way **for a real logged-in session**, through the same client stack the UI uses |
| Out-of-browser request | The endpoint behaves this way **for anyone holding that credential** — the client-side stack is out of the picture |
| Public request, no credential | The endpoint is reachable unauthenticated — a finding in itself if it should not be |

Name the mode next to every verdict. They are different claims.

## 2. The Case Families

The ACs are the floor. Add these regardless of what the ticket asks for — every one of
them has produced a real defect.

| Family | Cases |
|--------|-------|
| **Identity** | A known-good input whose expected answer you can state in advance. Without it, nothing else is interpretable. |
| **Length boundaries** | 0, 1, minimum−1, minimum, minimum+1, documented maximum, maximum+1, and something far past it |
| **Tokenisation** | Multiple words; leading, trailing and repeated inner whitespace; one long token vs the same characters split; a term where every token is below the minimum length |
| **Metacharacters** | The operators of whatever query language is underneath — the search index, the SQL dialect, the regex engine, the template. Probe them **individually and unbalanced**: a lone `(`, a lone `)`, `*`, `{`, `}`, `:`, `@`, `|`, `\`, `"`, and a realistic value that happens to contain one |
| **Emptiness** | `""`, `null`, whitespace-only, the field absent, the whole body `{}`. These are four different requests and they routinely behave four different ways |
| **Enums and filters** | A valid value; an invalid value; an empty string; an empty array; `null`; a wildcard; two values; a value carrying a metacharacter |
| **Pagination** | `limit` 0, 1, the cap, cap+1, huge, negative, non-numeric, fractional; `offset` 0, negative, non-numeric, past the end |
| **Type confusion** | A string where a number is expected, a number where a string is, an array where a scalar is, an object where an array is |
| **Casing and normalisation** | Upper, lower, mixed; accented and full-width characters; a trailing space |
| **Identity and scope** | The same request as a second user, and as a user in a different tenant/market/scope. A read that ignores scope is a data-exposure finding |

**Metacharacters are not an edge case when real data contains them.** If values in the
collection carry brackets, colons or asterisks, then copying a value out of a result and
pasting it back in is an ordinary user action — and it is the most common way this class
of bug reaches a customer.

## 3. Reading the Results

| Signal | What it usually means |
|--------|----------------------|
| `500` on a family of inputs | One shared character or shape is reaching a query builder unescaped. One bug, not one per input |
| `200` with an error body | The error contract is broken; every caller will treat the failure as success |
| `200`, `count > 0`, zero rows | Count and page come from different code paths, or the cap silently clamped to nothing |
| `200` and empty for an invalid enum | Silent rejection. Indistinguishable from a genuine no-match, and it will be read as data |
| `200` and the whole collection for an empty query | A match-all fallback. The severity is the size of the collection and who can call it |
| `limit` above the cap honoured | The cap is documentation, not code. A denial-of-service and a bulk-extraction path |
| Non-numeric `limit` → `400` | Correct. Record the passes too — a matrix of only failures cannot show a regression later |
| Identical request, different answer per environment | Configuration, not code. Fingerprint before concluding anything |

## 4. Evidence Hygiene

- **Raw first, interpretation second.** Save the unmodified result, then write the
  verdict beside it. An interpretation with no raw output is an opinion.
- **Redact on the way in.** Response bodies contain real records — names, addresses,
  identifiers, internal hostnames in error strings. Replace with `[REDACTED]` before the
  file is written, not in a later pass.
- **Never commit a credential.** Cookie jars, bearer tokens and profile directories stay
  out of the repository. `.auth/` and `data/targets/local-*.yml` are already ignored.
- **Counts are perishable.** Record the date and the environment beside every number, and
  never compare a count taken today against one taken last week as if it were a result.
