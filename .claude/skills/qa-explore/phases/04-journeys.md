# Phase 4: End-to-End User Journeys (10 min)

**Goal:** Test the critical user journeys you defined in the charter -- end to end, crossing multiple features.

This is NOT feature-by-feature testing. This is "walk through the app as a real user would."

## For Each Journey

### 1. Execute the Happy Path First

Complete the full journey with valid data.

### 2. Verify Data at Every Step

- After adding to cart: does the cart badge update? Are prices correct?
- After transfer: does the balance change on BOTH accounts? Does transaction history show it?
- After creating an item: does it appear in the list? Can you edit it? Does the edit persist after reload?

### 3. Check Cross-Page Consistency

- Does the amount on the confirmation page match what was entered?
- Does the order total match item prices + tax?
- Is the data the same when viewed from different pages?

### 4. Verify the End State

- Was the action actually completed? (order placed, transfer done, item saved)
- Can you find proof of completion? (confirmation page, history, email reference)

## Data Integrity Checks (MANDATORY for fintech/e-commerce)

```bash
# After an action, verify on a related page
playwright-cli goto <accounts-overview>
playwright-cli snapshot
# Compare balance to expected value
# Log: "[DATA CHECK] Expected balance: $X, Actual: $Y -- MATCH/MISMATCH"
```

## Repeat the Journey

Do things change? Are order IDs unique? Are timestamps correct?

## Area Evidence (explore only)

When you are done with a charter area — fully tested or only partly — capture its end state
before moving on, named after its ID in the charter's risk ranking:

```bash
playwright-cli screenshot --filename=output/sessions/<session-dir>/screenshots/A<N>-<slug>.png
```

`<slug>` is a few lowercase ASCII letters, digits and dashes (`A3-checkout-confirmation.png`).
Every area you will report `tested` or `partial` needs at least one such file — a shared
session video cannot stand in for it, and nothing under `snapshots/` counts. A journey that
finishes several areas takes one per area.

## After Journeys

1. Write findings to `phase-4-journeys.md` (confidentiality header first)
2. Include data integrity results
3. Note any cross-feature inconsistencies

**Update progress:** Set journeys phase complete in progress.json. Append to session-log.md:
`[<timestamp>] [PHASE] Journeys complete — <N> journeys tested, <N>/<N> data integrity checks passed, <N> bugs so far`
