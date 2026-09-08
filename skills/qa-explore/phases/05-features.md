# Phase 5: Deep Feature Testing (10 min)

**Goal:** Go deep on P0 and P1 features. Spend time proportional to risk. Every command carries `-s=<sid>` (omitted here).

Focus on the features your risk ranking identified as P0/P1. Apply SFDIPOT, but only the
dimensions you selected in the charter.

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

### Business Logic Stress (from the knowledge base)

- **Wrong state order:** skip a step in a multi-step flow; navigate directly to confirmation
- **Parameter tampering:** change values that should be server-controlled
  ```bash
  playwright-cli fill <ref> "-100"    # preferred: types, so framework handlers fire
  playwright-cli eval "document.querySelector('input[name=amount]').value = '-100'"
  ```
  The `eval` form assigns `.value` without dispatching `input`/`change`, so a
  React/Vue-controlled field reverts on the next render — prefer `fill`, and tamper at the
  network layer (`route`) when the value is genuinely server-controlled.
- **Replay:** complete an action, then try to complete it again immediately
- **Self-referential:** transfer from account A to account A; apply a discount code twice

### Negative Space Check

- For EACH form, ask: "What fields should be here that aren't?"
- For EACH flow, ask: "What steps are missing?"
- Compare against the domain checklist (`<data>/domains/<domain>.yml`)

### Consistency Oracles (FEW HICCUPPS)

After testing each feature, explicitly ask:
- **Users:** "Would a real user expect this behaviour?"
- **Claims:** "Does this match what the app promises?"
- **Product:** "Is this consistent with how other features in the app work?"
- **Standards:** "Does this meet industry standards for this domain?"

If you notice an inconsistency ("Bill Pay validates but Transfer doesn't"), **follow that
thread**; don't move on. The inconsistency is a signal.

### Stable locators for the bug report

A reproduction step must name the element unambiguously. When a ref is ambiguous:

```bash
playwright-cli generate-locator <ref>          # a Playwright locator for the element behind the ref
playwright-cli highlight <ref>                 # confirm visually which element you mean, then
playwright-cli highlight --hide
```

Paste the generated locator into the bug's steps. `page.pickLocator()` (Playwright 1.59)
exists for the same purpose but is **human-only**: it opens an interactive picker in a headed
browser and waits for a click, so it is not usable from an agent session.

### Test Agents Handoff (optional, Playwright 1.56+)

When feature testing produces a **reproducible** bug (you can trigger it twice in a row,
same steps, same result), you may hand it off after the session to the Playwright Test
Agents **generator** to convert the reproduction into a regression test:

1. Finish the bug report with exact steps (phase 7).
2. If Step 6 of setup bootstrapped Test Agents, pass the bug report to the generator agent.
3. The generator produces a `tests/repro-BUG-NNN.spec.ts` you can commit alongside the bug report.
4. The **healer** agent later repairs the test if it breaks for non-bug reasons.

Full workflow in `${CLAUDE_SKILL_DIR}/references/playwright-agents-integration.md`. This
handoff is **opt-in**; it does not replace the bug report and is skipped entirely when
`@playwright/test` is not installed.

## After Feature Testing

Write `phase-5-features.md` (confidentiality header first). Include the reasoning for each test.

**Update progress:** set the features phase complete in `progress.json`. Append to `session-log.md`:
`[<timestamp>] [PHASE] Features complete — <N> P0 features tested, <N> P1 features tested, <N> inconsistencies found, <N> bugs so far`
