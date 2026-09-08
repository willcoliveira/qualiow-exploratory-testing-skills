# Phase 3: Discovery & Mapping (Mobile)

Follow `${CLAUDE_SKILL_DIR}/../qa-explore/phases/03-discovery.md` for goal and method (map structure,
refine risk). The substitutions below apply to both modes.

## Map screens/views by name + nav path (not URLs)

There is no address bar to map by. Map by **screen/view name + how you reached it** (NATIVE:
the nav path through the app; WEB: the URL that `open-url`/a link loaded, recorded as a hint).
For each reachable screen/view:

```bash
qa/bin/mcli snapshot                      # refs expire after 60 s — re-snapshot before acting
qa/bin/mcli screenshot output/sessions/<session-dir>/screenshots/discovery-<view>.png
qa/bin/mcli logs --errors --since 30
```

Log each: `[DISCOVERED] <view-name> — <one-line description> — Risk: <P0/P1/P2/P3> — entry: <how-to-reach>`

## Match content by visible text / a11y label — there is no testID catalog

`snapshot` reads the device **accessibility tree, not the DOM**, so you identify elements by
their **visible text and accessibility labels** (headings, links, buttons, inputs), not by
CSS selectors or a fixed testID map. Read the live snapshot tree on each view. When a control
has no usable accessible label, fall back to `snapshot --full`, which assigns a ref to every
bounded node — `click <ref>` taps that node's centre on both platforms. A raw coordinate tap
exists only on Android (`qa/bin/wadb shell input tap <x> <y>`); the driver has no iOS
equivalent.

## App/browser log instead of console

Replace `playwright-cli console error` with:

```bash
qa/bin/mcli logs --errors --since 60
```

Caveat: this is the **process log**, and only iOS is process-scoped: `simctl spawn log show`
filters on the app/browser process, while Android's `logcat` is the **whole device** at `*:E`
/ `*:W` (last 400 lines), so lines from other packages appear — correlate by tag/pid before
attributing one to the app. In WEB mode it is the BROWSER's log, NOT the page's JS console, so it
catches gross failures (renderer crashes) but misses most page-level `console.error`. In
NATIVE mode it is the app's own log (crashes, native exceptions, bridge errors). Treat a clean
log as "no gross crash", not "no errors". Still watch for:

- Process crashes, native exceptions, or repeated reloads/restarts
- Any log line leaking PII or credentials (tokens, emails, secrets) — always file as a high-severity finding
- Mixed-content / TLS warnings (WEB)

## Network — limited

`mobile-cli` does not proxy traffic in v1, and there is no network panel. If a view seems to
make a request and the result is wrong (stale data, missing item), note "needs proxy capture"
in the bug report rather than guessing. Don't invent network details.

## What's MISSING — mobile-specific

Beyond the qa-explore "what's not here" check, ask:
- **Permission prompts (mostly NATIVE)** — does the app explain WHY before requesting camera/notifications/location/contacts? (WEB: the same for browser permission prompts.)
- **Offline state** — what happens with no network? Is there a UI for it or just a hang/blank screen?
- **Empty states** — first launch/visit, no data: are zero-item lists helpful or just blank?
- **Pull-to-refresh / reload** — present where a user would expect it?
- **Keyboard handling** — does the on-screen keyboard cover the active input? Does "Done"/return dismiss it?
- **Rotation** — does the layout reflow, or break/clip in landscape?
- **Background→foreground** — return after 10 min: still authenticated? Does state restore (WEB: page reload or restore)?
- **Touch targets** — finger-sized, or too small/desktop-sized and hard to hit?

## iOS-specific note — a11y aggregation

On iOS, some views **aggregate child elements into one parent accessibility label** (e.g. a
form returns one big comma-joined label of several fields). When you see a single ref with a
comma-joined label of many controls, that's an iOS a11y aggregation issue — file as a Medium
bug (it blocks automation and hurts VoiceOver users) and drive that view with
`snapshot --full` refs for the rest of the session (on Android you can also fall back to
`qa/bin/wadb shell input tap <x> <y>`; iOS has no raw-coordinate tap).

## After Discovery

Write findings to `phase-3-discovery.md` (confidentiality header first) including:
- View map (table: view → key visible labels/controls → entry path → URL if known)
- Log error summary (count by level) with the browser-log caveat noted
- iOS a11y aggregation hits (if any)
- Updated risk ranking

**Update progress:** discovery complete with `pages_explored` (views), `app_log_errors`, `missing_checklist_items`, `bugs_so_far`.
