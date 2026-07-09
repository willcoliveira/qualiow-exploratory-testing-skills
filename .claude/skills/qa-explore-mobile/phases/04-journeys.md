# Phase 4: End-to-End User Journeys (Mobile)

Follow `../../qa-explore/phases/04-journeys.md` for goal and the data-integrity
discipline. Build the journey templates from the charter's top user goals. Generic
mobile journey shapes to instantiate (apply to both modes):

## Standard mobile journeys

1. **First-run / entry → primary task** — launch the app (NATIVE) or open the start URL (WEB), complete the main thing it exists for (submit a form, complete a wizard, make a transaction, change a setting), confirm the success state actually persists.
2. **Create / edit / save** — create or edit a record, save it, navigate away and back, confirm the change is reflected (not just an optimistic UI that drops on reload/relaunch).
3. **Multi-step flow / wizard** — go through a multi-step flow start to finish; then go partway, back out, and resume — does it preserve or correctly reset state?
4. **Cross-screen consistency** — a value shown on one screen (a count, total, status, balance, name) matches everywhere else it appears.
5. **Deep entry** — reach a deep screen directly (NATIVE: deep link via `$MCLI deep-link`; WEB: `open-url` a deep view) rather than navigating from home — does it load with auth/context intact, or break?

Concrete examples:
- **WEB:** login/SSO → landing; the core transactional journey end-to-end (e.g. search → product → basket → checkout); any onboarding wizard; editing settings and confirming persistence; exercising the mobile form elements (pickers, toggles, date/number inputs).
- **NATIVE:** onboarding/account-creation → home; the app's core create/transact/save flow with verification on a related screen; a settings change that must persist across relaunch.

## Data integrity (MANDATORY)

After every state-changing action, verify on a related view. Generic correctness oracles:

- **After a save/edit:** the new value is shown back correctly on the detail screen AND survives a reload (NATIVE: navigate away and back, or relaunch; WEB: `open-url` the same view again).
- **After a create:** the new item appears in its list/index with the right attributes.
- **After a delete:** the item is gone from every view that listed it.
- **Cross-view:** a total/count/status equals the sum or state of its parts across views.
- **Formatting:** numbers, dates, currencies, and localized text render correctly at mobile width (no truncation, no `NaN`, no `undefined`, correct locale).

Log every check: `[DATA CHECK] <oracle> — expected: <X>, actual: <Y> — MATCH/MISMATCH`

## Lifecycle interleaving (mobile-only addition)

For at least ONE journey, interrupt mid-flow and verify recovery:
- Background the app/browser via `$MCLI press HOME` (Android) / home gesture (iOS), wait 30s, return — does state restore, or reload-and-lose-input?
- Kill via `$MCLI stop`, relaunch via `$MCLI launch` (WEB: + `open-url`) — does in-progress work survive? Does auth survive?
- Toggle airplane mode mid-submit (`bin/wadb shell svc wifi disable; bin/wadb shell svc data disable`) — does the app surface the failure cleanly or hang/silently drop the action? Re-enable to undo.

These lifecycle results often surface the most impactful bugs (data loss, stuck states,
silent failures, duplicate submissions).

## After Journeys

Write findings to `phase-2-user-journeys.md` with:
- Journey-by-journey result (passed / failed / partial — and the WHY)
- Data integrity table (oracle, expected, actual, pass/fail)
- Lifecycle test results
- Cross-view inconsistencies (e.g., "Step 3 shows value X, the summary shows Y")

**Update progress:** journeys complete, data integrity counts.
