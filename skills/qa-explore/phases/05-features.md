# Phase 5: Deep Feature Testing (~25% of time)

**Goal:** Go deep on P0 and P1 features. Spend time proportional to risk.

Focus on the features your risk ranking identified as P0/P1. Apply SFDIPOT, but only the dimensions you selected in the charter.

## For Each P0/P1 Feature

### Functional Testing

```bash
playwright-cli snapshot  # Get form field refs
# Happy path
playwright-cli fill <ref> "valid input"
playwright-cli click <submit_ref>
playwright-cli snapshot  # Verify result

# Boundary values (Goldilocks: too small, just right, too big)
playwright-cli fill <ref> ""         # Empty
playwright-cli fill <ref> "a"        # Minimum
playwright-cli fill <ref> "<1000+ chars>"  # Maximum
```

### Business Logic Stress (from knowledge base)

- **Wrong state order:** Skip a step in a multi-step flow -- navigate directly to confirmation
- **Parameter tampering:** Change values that should be server-controlled
  ```bash
  playwright-cli eval "document.querySelector('input[name=amount]').value = '-100'"
  ```
- **Replay:** Complete an action, then try to complete it again immediately
- **Self-referential:** Transfer from account A to account A. Apply discount code twice.

### Negative Space Check

- For EACH form, ask: "What fields should be here that aren't?"
- For EACH flow, ask: "What steps are missing?"
- Compare against domain checklist

### Consistency Oracles (FEW HICCUPPS)

After testing each feature, explicitly ask:
- **Users:** "Would a real user expect this behavior?"
- **Claims:** "Does this match what the app promises?"
- **Product:** "Is this consistent with how other features in the app work?"
- **Standards:** "Does this meet industry standards for this domain?"

If you notice an inconsistency (e.g., "Bill Pay validates but Transfer doesn't"), **follow that thread** -- don't move on. The inconsistency is a signal.

### Locator Stabilization Helpers (Playwright 1.59+, optional)

When testing a feature produces flaky snapshots because a locator isn't uniquely addressable, the following 1.59 helpers can harden the repro before you file a bug. They require the `@playwright/test` peer dep.

- `page.pickLocator()` — interactive locator picker. Use this when your current locator matches multiple elements and you need to find the one the user actually sees.
- `locator.normalize()` — returns a cleaned-up, canonical form of a locator. Use before copying a locator into a bug report so the reproduction is portable across runs.

These are diagnostic aids, not required steps. The bash `playwright-cli` flow above is the primary path.

### Test Agents Handoff (optional, Playwright 1.56+)

When feature testing produces a **reproducible** bug (you can trigger it twice in a row, same steps, same result), you may hand off to the Playwright Test Agents **generator** to convert the reproduction into a regression test case:

1. Finish writing the bug report with exact steps (see phase 07).
2. If the session's Step 6 bootstrapped Test Agents, pass the repro steps to the generator agent.
3. The generator produces a `tests/repro-<bug-id>.spec.ts` you can commit alongside the bug report.
4. The **healer** agent can later be used by the team if the test becomes flaky.

Full workflow in `../references/playwright-agents-integration.md`. This handoff is **opt-in** — it does not replace the bug report and is skipped entirely when `@playwright/test` is not installed.

## After Feature Testing

Write to `phase-3-feature-testing.md`. Include reasoning for each test.

**Update progress:** Set features phase complete in progress.json. Append to session-log.md:
`[<timestamp>] [PHASE] Features complete — <N> P0 features tested, <N> P1 features tested, <N> inconsistencies found, <N> bugs so far`
