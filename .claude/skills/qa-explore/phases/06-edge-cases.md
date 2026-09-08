# Phase 6: Edge Cases, Security & Negative Testing (6 min)

**Goal:** Saboteur tour: actively try to break things. Every command carries `-s=<sid>` (omitted here). In read-only mode, fill but never submit.

## Input Attacks (from error-guessing knowledge)

```bash
# XSS
playwright-cli fill <ref> "<img src=x onerror=alert(1)>"
# SQL injection
playwright-cli fill <ref> "' OR '1'='1"
# Unicode / emoji
playwright-cli fill <ref> "Test naïve café"
# Spaces only
playwright-cli fill <ref> "   "
# Extremely long
playwright-cli fill <ref> "A repeated 5000 times..."
```

After an XSS payload, check whether it executed: `playwright-cli console error` plus
`playwright-cli run-code "async page => (await page.pageErrors()).length"`, and look for a
dialog (`dialog-dismiss` if one opened).

## Race Conditions (if applicable)

```bash
# Open a second, separately isolated session alongside the main one
playwright-cli -s=<sid>-race open <url>
playwright-cli -s=<sid>-race state-load .auth/<target>.json
# Set up the identical action in both sessions
# Submit both as close to simultaneously as possible
# Check for double-processing, then close the second session:
playwright-cli -s=<sid>-race close
playwright-cli -s=<sid>-race delete-data
```

## State Manipulation

- Navigate directly to pages that require prior steps
- Use browser back/forward mid-flow
- Double-click submit buttons
- Simulate network errors: `playwright-cli route "**/*" --status=500` (then `playwright-cli unroute` to restore)
- Simulate offline: `playwright-cli network-state-set offline` / `online`

## Security

- Check for session tokens in URLs
- Try accessing admin/internal pages directly
- Check whether authenticated endpoints work without auth (`playwright-cli -s=<sid>-anon open <api-url>` in a fresh session, then close and `delete-data` it)
- Test brute force: 5+ failed login attempts; check for lockout

## Accessibility (quick check)

```bash
playwright-cli press Tab  # x10 -- check focus order and visibility
playwright-cli press Enter  # activate focused elements
playwright-cli press Escape  # close modals
playwright-cli eval "document.documentElement.lang"  # language declared?
playwright-cli resize 375 667  # mobile viewport
playwright-cli snapshot
playwright-cli resize 1280 720  # restore
```

The CLI `snapshot` **is** an aria snapshot: roles, names and states as assistive technology
sees them, so missing names and duplicate landmarks show up directly. For the raw YAML aria
tree of a region, `playwright-cli run-code "async page => page.locator('main').ariaSnapshot()"`.
Note: Playwright **removed** `page.accessibility` in 1.57; anything still calling it will
throw.

## Empty States

- What does the cart look like with no items?
- What does search show with no results?
- What does the list show with no entries?
- Is there a helpful message or just blank space?

## After Edge Cases

Write `phase-6-edge-cases.md` (confidentiality header first).

**Update progress:** set the edge_cases phase complete in `progress.json`. Append to `session-log.md`:
`[<timestamp>] [PHASE] Edge cases complete — <N> input attacks, <N> security checks, <N> a11y checks, <N> bugs so far`
