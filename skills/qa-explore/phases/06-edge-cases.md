# Phase 6: Edge Cases, Security & Negative Testing (~20% of time)

**Goal:** Saboteur tour -- actively try to break things.

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

## Race Conditions (if applicable)

```bash
# Open a second session
playwright-cli -s=race open <url>
playwright-cli -s=race state-load .auth/<target>.json
# Set up identical action in both sessions
# Submit both as close to simultaneously as possible
# Check for double-processing
```

## State Manipulation

- Navigate directly to pages that require prior steps
- Use browser back/forward mid-flow
- Double-click submit buttons
- Simulate network errors: `playwright-cli route "**/*" --status=500`

## Security

- Check for session tokens in URLs
- Try accessing admin/internal pages directly
- Check if authenticated endpoints work without auth
- Test brute force: 5+ failed login attempts -- check for lockout

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

## Empty States

- What does the cart look like with no items?
- What does search show with no results?
- What does the list show with no entries?
- Is there a helpful message or just blank space?

## After Edge Cases

Write to `phase-4-edge-cases.md`.

**Update progress:** Set edge_cases phase complete in progress.json. Append to session-log.md:
`[<timestamp>] [PHASE] Edge cases complete — <N> input attacks, <N> security checks, <N> a11y checks, <N> bugs so far`
