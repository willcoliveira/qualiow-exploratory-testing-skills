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

## After Feature Testing

Write to `phase-3-feature-testing.md`. Include reasoning for each test.

**Update progress:** Set features phase complete in progress.json. Append to session-log.md:
`[<timestamp>] [PHASE] Features complete — <N> P0 features tested, <N> P1 features tested, <N> inconsistencies found, <N> bugs so far`
