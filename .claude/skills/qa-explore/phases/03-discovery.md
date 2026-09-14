# Phase 3: Discovery & Mapping (6 min)

**Goal:** Map the app structure and refine your risk ranking. Every command carries `-s=<sid>` (omitted here).

## Site Mapping

```bash
playwright-cli goto <start_url>
playwright-cli snapshot --depth=3
playwright-cli console error
playwright-cli requests
```

For each page:
1. `playwright-cli snapshot --depth=3` — note structure, forms, interactive elements.
2. Click through navigation to discover all sections.
3. Log: `[DISCOVERED] <url> -- <description> -- Risk: <P0/P1/P2/P3>`
4. Check `playwright-cli console error` and `playwright-cli requests` on each page.

## Snapshot Policy

A full accessibility tree is the single largest thing this session can read. On discovery
pages you take the shape, not the tree:

- `playwright-cli snapshot --depth=3` — the default. Enough to see sections, forms and nav.
- `playwright-cli snapshot <ref>` — zoom into one region once `--depth=3` shows you where to look.
- `playwright-cli find "<text>"` (or `find --regex "<re>"`) — locate a label, message or
  control by its text, without a tree at all.

When you genuinely need the full tree of a page, **write it to disk and size it first —
never read it straight into the session**:

```bash
playwright-cli --raw snapshot > output/sessions/<session-dir>/snapshots/<page>.yml
wc -l output/sessions/<session-dir>/snapshots/<page>.yml
```

- **At most 300 lines** — `Read` the file.
- **Over 300 lines** — invoke the `qa-page-mapper-agent` sub-agent
  (`qualiow:qa-page-mapper-agent` under a plugin install) with the file path and the page
  URL, and work from the map it returns: forms (fields, which are required, the submit ref),
  nav (text → ref), interactive controls, visible error and empty-state text, hidden and
  disabled counts. It returns structure only — no test ideas, no findings. If sub-agents are
  unavailable, do the step yourself as in 2.1.0: read the snapshot in windows (`Grep` for the
  region, then `Read` with `offset`/`limit`).

`snapshots/` is working material, not session evidence: it is never shipped in the report and
never read back by the reporting step.

Before/after diff — both files go into `snapshots/` the same way:

```bash
playwright-cli --raw snapshot > output/sessions/<session-dir>/snapshots/<page>-before.yml
# ...act...
playwright-cli --raw snapshot > output/sessions/<session-dir>/snapshots/<page>-after.yml
diff output/sessions/<session-dir>/snapshots/<page>-before.yml output/sessions/<session-dir>/snapshots/<page>-after.yml
```

The diff is what you read — it shows exactly what the action changed.

Network helper: `playwright-cli requests --filter="/api/"` — only the calls that matter;
`playwright-cli request <n>` for headers and body of one of them.

The interaction phases (4-6) are unchanged: snapshot before every interaction, and keep the
refs you act on in this session.

## Scope Enforcement

Stay within the target domain. Do not follow links to external sites unless they are part of
the application's workflow (OAuth redirects, payment gateways).

## What's MISSING Check

**Critical during discovery — look for what's MISSING:**
- Read the domain completeness checklist from `<data>/domains/<domain>.yml` (`completeness_checklist`)
- Compare what the app HAS against what it SHOULD have
- E-commerce missing a payment method? Log it now.
- Banking app missing transaction history? Flag it immediately.
- No error messages on empty states? Note it.

## Console & Network Checks

On every page during discovery:
- `playwright-cli console error` — JavaScript errors
- `playwright-cli requests` — failed requests (4xx, 5xx); `requests --static` to include assets
- Watch for mixed-content warnings (HTTP resources on HTTPS pages)

### Cross-navigation observation via `run-code` (Playwright 1.59+)

The CLI's `console` and `requests` show only the tail since the last navigation. To reach
messages from *before* it, run Playwright's retrieval methods inside the session with
`run-code` (the callback receives the live `page`) and pass `filter: 'all'` — **without it
they default to `since-navigation` and return exactly the same window as the CLI**. The
buffers are capped: 200 console messages, 200 page errors, 100 requests.

```bash
# every console message still buffered, across navigations
playwright-cli run-code "async page => (await page.consoleMessages({ filter: 'all' })).map(m => m.type() + ': ' + m.text()).join('\n')"

# uncaught exceptions only — more reliable than filtering console output
playwright-cli run-code "async page => (await page.pageErrors({ filter: 'all' })).map(e => e.message).join('\n')"

# failures and error statuses among the last 100 requests (page.requests() takes no filter)
playwright-cli run-code "async page => { const out = []; for (const r of await page.requests()) { const res = await r.response(); const f = r.failure(); if (f) out.push('FAILED ' + f.errorText + ' ' + r.url()); else if (res && res.status() >= 400) out.push(res.status() + ' ' + r.url()); } return out.join('\n'); }"
```

These are optional; the bash commands above remain the primary path.

### Service Workers (Playwright 1.61+)

Service-worker requests are reported and routable at the **BrowserContext** level from 1.61.
`playwright-cli route` maps to `page.route()`, which per the API docs still does **not**
intercept service-worker traffic. So if `playwright-cli requests` shows calls you cannot
account for on the main document, assume a service worker is serving them: flag the area as
high-risk, and note in the report that mocking it needs service workers blocked
(`serviceWorkers: 'block'`), not `route`.

## After Discovery

1. Write findings to `phase-3-discovery.md` (confidentiality header first)
2. **Update your risk ranking** if discovery changed your understanding
3. Carry forward: site-map summary, risk ranking, list of what's missing

**Log your reasoning:** "I expected a payment-method selector in checkout because this is
e-commerce, but it's missing. I'll flag this as a medium bug."

**Update progress:** set the discovery phase complete in `progress.json` with the
`pages_explored` count. Append to `session-log.md`:
`[<timestamp>] [PHASE] Discovery complete — <N> pages mapped, <N> console errors, <N> missing checklist items, <N> bugs so far`
