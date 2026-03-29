# Phase 3: Discovery & Mapping (~15% of time)

**Goal:** Map the app structure and refine your risk ranking.

## Site Mapping

```bash
playwright-cli goto <start_url>
playwright-cli snapshot
playwright-cli console error
playwright-cli network
```

For each page:
1. `playwright-cli snapshot` -- note structure, forms, interactive elements
2. Click through navigation to discover all sections
3. Log: `[DISCOVERED] <url> -- <description> -- Risk: <P0/P1/P2/P3>`
4. Check `playwright-cli console error` on each page

## Scope Enforcement

Stay within the target domain. Do not follow links to external sites unless they are part of the application's workflow (e.g., OAuth redirects, payment gateways).

## What's MISSING Check

**Critical during discovery -- look for what's MISSING:**
- Read the domain completeness checklist from `data/domains/<domain>.md` (or the corresponding `.yml`)
- Compare what the app HAS vs what it SHOULD have
- E-commerce missing payment method? Log it now.
- Banking app missing transaction history? Flag it immediately.
- No error messages on empty states? Note it.

## Console & Network Checks

On every page during discovery:
- `playwright-cli console error` -- log any JavaScript errors
- `playwright-cli network` -- note any failed requests (4xx, 5xx)
- Watch for mixed content warnings (HTTP resources on HTTPS pages)

## After Discovery

1. Write findings to `phase-1-discovery.md`
2. **Update your risk ranking** if discovery changed your understanding
3. Carry forward: site map summary, risk ranking, list of what's missing

**Log your reasoning:** "I expected a payment method selector in checkout because this is e-commerce, but it's missing. I'll flag this as a medium bug."

**Update progress:** Set discovery phase complete in progress.json with pages_explored count. Append to session-log.md:
`[<timestamp>] [PHASE] Discovery complete — <N> pages mapped, <N> console errors, <N> missing checklist items, <N> bugs so far`
