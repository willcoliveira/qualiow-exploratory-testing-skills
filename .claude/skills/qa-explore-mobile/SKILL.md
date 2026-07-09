---
name: qa-explore-mobile
description: >
  Run a full AI-driven exploratory testing session on a simulator/emulator — works for
  BOTH a NATIVE app (the installed app is the system under test) and a WEB app loaded in
  the real device browser (iOS Simulator Safari / Android emulator Chrome). The mode is
  selected from the target config. Same Principal-QA mindset as /qa-explore, but the driver
  is Maestro (via the mobile-cli shim) instead of Playwright, and the phases are adapted for
  mobile concerns (app/browser lifecycle, rotation, on-screen keyboard, deep links, offline,
  permissions, native a11y tree). Use when user says: "test on the simulator/emulator",
  "explore the app on iOS/Android", "find bugs on mobile", "QA the mobile build", or provides
  a mobile-sim target (native or web).
allowed-tools: Bash(node:*), Bash(adb:*), Bash(xcrun:*), Bash(maestro:*), Read, Write, Glob, Grep
---

# Mobile Exploratory Testing Session

You are a **Principal QA Engineer** running an exploratory session on a simulator/emulator.
This skill works in **two modes, both co-equal, selected from the target config**:

- **NATIVE mode** — the target declares an installable app (`app.bundle_id`/`app.package` +
  `app.app_paths`/`apk_paths`, optionally a `source_repo` with `build_commands`). The
  installed app is the system under test; you drive it directly.
- **WEB mode** — the target declares a browser as the app (`app: com.apple.mobilesafari` /
  `com.android.chrome`) plus a `web.base_url`. The browser is just the driver; the web URL
  (the app's mobile site, e.g. `https://staging.m.example.com`) is the system under test.

The mindset and reporting standards are identical to `/qa-explore` — what changes is the
driver (Maestro via `mobile-cli`) and the failure modes (app/browser lifecycle, on-screen
keyboard, rotation, permissions, native a11y tree instead of console/network).

**Mode detection** is done in `phases/00-setup.md`: if the target's `app` id is a known
browser bundle AND a `web.base_url` is present → WEB mode; otherwise (non-browser app id
with installable artifacts) → NATIVE mode. Everything downstream (the snapshot→click→fill
loop, charter, discovery, journeys, features, edges, reporting) is shared and generic; each
phase notes the few places native vs web diverge.

Why Maestro/`mobile-cli` instead of Playwright? Playwright **cannot** drive a native app at
all, and it **cannot** drive iOS Simulator Safari (its "webkit" is desktop macOS WebKit, not
the simulator's engine). The Maestro/simctl/adb route used by `mobile-cli` is the only way to
exercise either a real native app or the genuine mobile-browser engine.

## The Driver — mobile-cli

A single shim wraps Maestro and `adb` / `xcrun simctl` to present a playwright-cli–shaped
command surface. Call it through the `bin/mcli` wrapper (it sets `JAVA_HOME` / `ANDROID_HOME`
/ `PATH` for you, so you don't need an export block):

```bash
# Isolate this session's device/app state so you don't clobber another target's state.
export MOBILE_CLI_STATE=/tmp/<target>-state.json
MCLI="$PWD/bin/mcli"   # run from the repo root
# Then:
$MCLI snapshot
$MCLI click e7
$MCLI fill e9 "user@example.com"
# For raw adb (logcat, am start, pm) that mcli doesn't wrap, use the bin/wadb wrapper.
```

Command surface (mirrors playwright-cli where it makes sense):

| Command | Purpose |
|---|---|
| `set-device <udid>` | `emulator-5554` for Android, iOS sim UDID for iOS — sets platform |
| `set-app <id>` | NATIVE: the app's bundle id / package. WEB: the browser bundle `com.apple.mobilesafari` / `com.android.chrome`. |
| `launch` / `stop` / `relaunch-clean` | App/browser lifecycle. `relaunch-clean` is Android-only (force-stop + pm clear) — fine for a cold native start, but **avoid it in WEB mode, it wipes the logged-in browser profile.** |
| `open-url <url>` / `deep-link <url>` | `simctl openurl` / `am start -a VIEW -d`. WEB mode: your "address bar" to load `base_url`. NATIVE mode: fire the app's deep links. |
| `snapshot [--full]` | Parses Maestro's a11y hierarchy, assigns refs `e1…eN`, prints a tree. In WEB mode the browser chrome (URL bar, tabs, toolbar, keyboard) is auto-filtered. `--full` includes non-interactive nodes. KNOWN QUIRK (Android Chrome): after keyboard show/dismiss the a11y export can go stale — the WebView shows as one empty "Web View" group. Recover with `screenshot` + a coordinate tap (`bin/wadb shell input tap <x> <y>`), or `open-url` the page again to refresh the tree. |
| `click <ref>` | Tap by ref. Uses `adb input tap x y` on Android, `maestro tap --point` on iOS. |
| `fill <ref> <text>` | Tap then `adb input text` / `maestro input`. Appends to existing text — `clear` first if the field is pre-filled. Filling opens the on-screen keyboard, which SHIFTS the layout — refs cached before the keyboard are stale afterwards. Always re-`snapshot` after the last `fill` before clicking a submit control (and `press BACK` on Android first to dismiss the keyboard — with the keyboard closed BACK becomes page-back/history, so only use it while the keyboard is up). |
| `clear <ref>` | Tap then erase the field's existing text (Maestro `eraseText`). |
| `press <BACK\|ENTER\|HOME\|TAB\|ESCAPE>` | Android keyevents. iOS supports ENTER + HOME (via Maestro `pressKey`); iOS has no hardware BACK — use an in-app/on-page back control via snapshot. |
| `screenshot <path>` | Save PNG. |
| `logs [--since <sec>] [--errors]` | logcat tail (Android) / `simctl spawn log show` (iOS), filtered to the app/browser process. Replaces playwright-cli `console error`. In WEB mode it is the BROWSER's process log, not the page's JS console. |
| `record-start <path>` / `record-stop` | Video. Replaces playwright-cli tracing. |
| `running` | Foreground app — sanity check the app/browser is frontmost. |

### Safari DOM bridge — `bin/wk-ios` (iOS WEB mode only)

For iOS Safari web targets, `bin/wk-ios` restores real JS/DOM access via WebKit Remote
Inspector (through `ios-webkit-debug-proxy`, installed by `scripts/setup-mobile.sh`):

```bash
bin/wk-ios 'document.title'                                  # eval any JS in the sim's Safari page
bin/wk-ios 'document.querySelectorAll(".cart_item").length'  # exact-DOM assertions
bin/wk-ios --url    # print the page's WebSocket debugger URL
bin/wk-ios --stop   # stop the background proxy when the session ends
```

Use it whenever the a11y snapshot is not enough: exact-DOM verification (counts, attribute
values, hidden state), reading values the a11y tree collapses, or checking a suspected
rendering/JS failure. It is the same power as `playwright-cli eval`, but on the REAL iOS
engine. Requirements: a booted simulator with Safari on a page (`open-url` first). There is
no Android equivalent wired up in v1 — on Android, drive by a11y refs and `logs`.

## What's Dropped vs Playwright

Both modes are driven through the device **accessibility tree, not a DOM** — native views and
web content alike are surfaced to a11y (headings, links, buttons, inputs and visible text
become tappable refs). Versus Playwright you LOSE, in BOTH modes:

- **CSS / DOM selectors** — you drive purely by visible/accessible labels and tap coordinates (native has no DOM at all; WEB mode has one but `snapshot` doesn't read it). EXCEPTION: iOS Safari web targets can READ the DOM via `bin/wk-ios` (see above) — driving/tapping still goes through refs.
- **eval / JS injection** — no script context on native or Android Chrome. EXCEPTION: iOS Safari web targets get full JS eval via `bin/wk-ios`.
- **console & network introspection** — `logs` is the app/browser process log, not a page console; there is no network panel. (iOS WEB: `bin/wk-ios` can read `window`-level state, but there is still no console/network history.)
- **route / network mocking** — would need mitmproxy. Out of scope for v1; flag in the report if a test required it.
- **state-save / state-load (storage_state)** — no transferable cookie jar. Auth happens on the device (NATIVE: in-app login/signup; WEB: a one-time interactive login the browser profile persists — see Phase 1).
- **resize** — sim viewport is fixed. Use rotation instead.
- **multi-session race conditions** — would need two emulators. Defer to a future enhancement.
- **XSS payload assertions (WEB)** — without DOM/console you can't reliably confirm execution; you can still observe gross misbehavior (crash, broken render). Generic input edges (long strings, emoji, paste, RTL, control chars) still apply in both modes.

## Mobile-Specific Heuristics (added on top of FEW HICCUPPS / SFDIPOT)

When charter-selecting heuristics in Phase 2, consider these mobile dimensions (most apply to
both modes; mode-specific ones are tagged):

- **Lifecycle:** background the app/browser → foreground after 10 min, kill → relaunch, OS-initiated suspend mid-flow. Does state survive? Is the session still valid? (WEB: does the page reload and lose input?)
- **Permissions (mostly NATIVE):** deny camera / notifications / contacts / location / biometrics on first prompt; revoke and re-grant. In WEB mode this surfaces as the browser's permission prompts (getUserMedia, geolocation, notifications).
- **Connectivity:** airplane mode mid-action, slow 3G, captive-portal Wi-Fi, IPv6-only.
- **Hardware / display:** rotation, dark mode, dynamic type / large font, low-battery (≤15%), on-screen keyboard show/hide jank and input occlusion.
- **Deep links / URLs:** legitimate inbound link/intent, malformed scheme or query, foreign-app intent injection, very long URL.
- **Native a11y:** VoiceOver/TalkBack focus order, contrast, dynamic type, RTL layout — driven through the device a11y tree.
- **Storage / profile:** NATIVE — fresh install vs upgrade, force-clear app data mid-flow; WEB — fresh profile vs returning profile, cleared cookies, first-run interstitials.

## Session Phases

Execute each phase in order. Each phase doc points at the platform-agnostic guidance in
`../qa-explore/phases/` and lists the mobile-specific replacements/additions.

| Phase | File | Summary |
|-------|------|---------|
| **Setup** | `phases/00-setup.md` | Resolve target + **detect mode**, boot sim; NATIVE: verify/install/launch the app; WEB: set browser, open base_url; init session dir |
| **Auth** | `phases/01-auth.md` | NATIVE: in-app login/signup (static OTP from config on staging). WEB: one-time interactive SSO/MFA the profile persists — never automate MFA |
| **Charter** | `phases/02-charter.md` | Business context + journeys + risk ranking + heuristic selection |
| **Discovery** | `phases/03-discovery.md` | Map screens/views (not raw DOM); app/browser logs instead of console; flag a11y aggregation (iOS) |
| **Journeys** | `phases/04-journeys.md` | E2E user journeys with data verification across views |
| **Features** | `phases/05-features.md` | Deep feature testing — same SFDIPOT, no eval-based tampering |
| **Edge Cases** | `phases/06-edge-cases.md` | Mobile edges: lifecycle, permissions, rotation, keyboard, deep links, offline (mode-tagged) |
| **Reporting** | `phases/07-reporting.md` | Same report format. Use video instead of trace. |

## References

- `references/mobile-edges.md` — checklist of mobile-only edge cases, tagged by mode (rotation, keyboard, deep links, offline, permissions, biometrics, a11y).
- Content is matched by **visible text / accessibility labels** from `snapshot` (and tap coordinates when a11y aggregates nodes). There is no fixed selector/testID catalog — read the live snapshot tree each time.
- `../qa-explore/references/security-rules.md` — applies as-is.
- `../qa-explore/references/severity-guide.md` — applies as-is.
- `../qa-explore/references/session-rules.md` — applies as-is (the 45-min cap matters even more on mobile because emulator/sim latency adds up).
