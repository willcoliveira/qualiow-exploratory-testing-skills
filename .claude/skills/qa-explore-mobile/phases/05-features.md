# Phase 5: Deep Feature Testing (Mobile)

Follow `../../qa-explore/phases/05-features.md` for the SFDIPOT structure, boundary
values, business-logic stress, and FEW HICCUPPS oracles. The mobile changes (both modes):

## Substitutions

- **`playwright-cli eval` (parameter tampering)** — **DROPPED**. No script context in either
  mode. If a test *would* benefit from tampering server-controlled values (hidden fields,
  computed totals, query params), document the scenario and mark **"deferred — needs proxy
  tooling (mitmproxy)"**. Do NOT invent a result. (You CAN still tamper values that travel in
  a deep link / URL via `deep-link`/`open-url` — see Phase 6.)

- **`playwright-cli fill <ref> <long-string>`** — use the same patterns, but be aware the
  Android `input text` command silently truncates very long strings (~5000 chars max on most
  emulators), so a "field accepted N chars" result may be a driver limit, not the app's.
  Note the truncation when reporting, and for true very-long tests prefer pasting via the
  clipboard:
  ```bash
  bin/wadb shell "echo '<very long string>' | xargs -I {} am broadcast -a clipper.set -e text '{}'"
  $MCLI click <input ref>
  # then long-press to paste — or use $MCLI fill with the actual string and note truncation
  ```

## Generic mobile feature stress recipes

Instantiate these for the feature under test (pick the ones that fit; they apply to native
screens and web views alike — they replace the desktop-only Playwright specifics).

### Form fields & inputs

- **Boundary values:** empty, single char, max length, max+1, leading/trailing whitespace, whitespace-only.
- **Character classes:** unicode/emoji (`naïve café 🤑 العربية`), RTL text, control chars, paste with formatting.
- **Client vs server validation:** does the field reject client-side what the server would also reject — and accept what the server actually accepts? Try values just outside the visible UI constraint.
- **Keyboard occlusion:** when the input is near the bottom, does the on-screen keyboard cover it or the submit button? Does the view scroll the input into view?
- **Keyboard type:** does a numeric/email field bring up the right mobile keyboard?

### Pickers, toggles, steppers, date/number controls

- Min/max/step boundaries; rapid toggling; selecting then dismissing without choosing.
- Native vs custom picker behavior on a touch device — is the custom control reachable and operable by tap (and by a11y)?
- Does the chosen value persist on reload and reflect everywhere it's shown?

### Multi-step flows / wizards

- Forward-only vs back-navigable: go back mid-wizard — is prior input preserved?
- Skip an optional step then return — consistent state?
- Submit twice / double-tap the final action — duplicate submission? Idempotency?
- Reload mid-wizard (NATIVE: background/relaunch; WEB: `open-url` the current step) — resume or lose everything?

### Navigation & routing

- Hardware/gesture back (Android `press BACK`) vs in-screen back control — same destination?
- Deep-link straight into a mid-flow screen (NATIVE: `$MCLI deep-link <app-scheme>`; WEB: `open-url`) — does it load with context or break?
- After a successful action, does back land somewhere sane (not re-submitting)?

### Submit / save actions

- Slow network at submit: does it show progress, prevent double-submit, and confirm success?
- Background the app/browser on a confirm/submit screen → return → submit: stale data? re-validated?

Concrete high-value targets:
- **WEB:** the **mobile form elements** (pickers, toggles, date/number inputs — do they work by touch and persist?), any **multi-step wizard/checkout** (back/resume/skip), and **settings** (do changes save and reflect app-wide?).
- **NATIVE:** the app's primary transactional/create flow under boundary + replay stress, its custom input controls, and any setting that must persist across relaunch.

## After Feature Testing

Write `phase-3-feature-testing.md` with feature-by-feature notes. For each deferred test
(proxy-blocked, multi-device-blocked), record it explicitly in the coverage map so it shows
up as a known gap in the report.

**Update progress.**
