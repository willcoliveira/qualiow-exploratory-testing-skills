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
argument-hint: "--target <id> [--context <file>] [--rebuild]"
allowed-tools: Bash(qa/bin/mcli:*), Bash(bin/mcli:*), Bash(mcli:*), Bash(${CLAUDE_SKILL_DIR}/../../bin/mcli:*), Bash(qa/bin/wadb:*), Bash(bin/wadb:*), Bash(wadb:*), Bash(${CLAUDE_SKILL_DIR}/../../bin/wadb:*), Bash(qa/bin/wk-ios:*), Bash(bin/wk-ios:*), Bash(wk-ios:*), Bash(${CLAUDE_SKILL_DIR}/../../bin/wk-ios:*), Bash(qa/bin/doctor-mobile.sh:*), Bash(bin/doctor-mobile.sh:*), Bash(qualiow-doctor-mobile:*), Bash(${CLAUDE_SKILL_DIR}/../../bin/doctor-mobile.sh:*), Bash(xcrun:*), Bash(adb:*), Bash(maestro:*), Bash(node:*), Bash(sleep:*), Bash(python3:*), Bash(git:*), Read, Write, Glob, Grep
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

The mindset and reporting standards are identical to `/qa-explore`; what changes is the
driver (Maestro via `mobile-cli`) and the failure modes (app/browser lifecycle, on-screen
keyboard, rotation, permissions, native a11y tree instead of console/network).

**Mode detection** is done in `${CLAUDE_SKILL_DIR}/phases/00-setup.md`: if the target's `app`
id is a known browser bundle AND a `web.base_url` is present → WEB mode; otherwise
(non-browser app id with installable artifacts) → NATIVE mode. Everything downstream (the
snapshot→click→fill loop, charter, discovery, journeys, features, edges, reporting) is
shared and generic; each phase notes the few places native vs web diverge.

Why Maestro/`mobile-cli` instead of Playwright? Playwright **cannot** drive a native app at
all, and it **cannot** drive iOS Simulator Safari (its "webkit" is desktop macOS WebKit, not
the simulator's engine). The Maestro/simctl/adb route used by `mobile-cli` is the only way to
exercise either a real native app or the genuine mobile-browser engine.

## Rules that apply as-is

- `${CLAUDE_SKILL_DIR}/../qa-explore/references/paths.md` — target, data, credential and **driver** resolution; session-directory scheme; index rows
- `${CLAUDE_SKILL_DIR}/../qa-explore/references/output-contract.md` — bug-report, session-report and `stats.json` format
- `${CLAUDE_SKILL_DIR}/../qa-explore/references/security-rules.md` — production rule (applied to `web.base_url` or the environment in the target), redaction, confidentiality header
- `${CLAUDE_SKILL_DIR}/../qa-explore/references/severity-guide.md`, `session-rules.md` — the 45-min cap matters even more on mobile because emulator/sim latency adds up

## The Driver — mobile-cli

A single shim wraps Maestro and `adb` / `xcrun simctl` to present a playwright-cli–shaped
command surface. Resolve it **once, in phase 0**, in the order from `paths.md`
(`qa/bin/mcli` after `qualiow init` → `bin/mcli` in a checkout of this repository → `mcli`
on PATH for global or marketplace installs → the plugin's `bin/`), then write that literal
prefix in every command. **The phase files show `qa/bin/mcli`; substitute yours.** Never
call it through a shell variable: permission rules match the first literal token.

The wrapper sets `JAVA_HOME` / `ANDROID_HOME` / `PATH` for you. Device and app state live in
a **per-device** state file chosen at `set-device` (`~/.mobile-cli/<device>.json`). Two
sessions driving the *same* device share that file and will overwrite each other's refs and
app id, so give each concurrent session its own `--state <file>` on every command. Raw adb
goes through the `qa/bin/wadb` wrapper.

```bash
qa/bin/mcli set-device emulator-5554 --platform android     # or a sim UDID / name with --platform ios
qa/bin/mcli set-app com.example.app
qa/bin/mcli launch
qa/bin/mcli snapshot
qa/bin/mcli click e7
qa/bin/mcli fill e9 "user@example.com"
```

Command surface (mirrors playwright-cli where it makes sense):

| Command | Purpose |
|---|---|
| `set-device <id> [--platform ios\|android]` | `emulator-5554` / an adb serial for Android; a sim UDID or name for iOS (names resolve to a UDID). Auto-detects the platform from `adb devices` / `simctl list`; pass `--platform` when in doubt. |
| `set-app <id>` | NATIVE: the app's bundle id / package. WEB: the browser bundle `com.apple.mobilesafari` / `com.android.chrome`. |
| `boot <avd\|sim-name\|udid>` | Boot an emulator / simulator. iOS: safe to re-run against an already-booted sim. Android: always spawns a NEW emulator process — run it only when no device is attached, or it blocks 180 s and then fails. |
| `info` / `version` / `running` | Current device/app state; driver version; the foreground app. |
| `launch` / `stop` / `relaunch-clean` | App/browser lifecycle. `relaunch-clean` is Android-only (force-stop + pm clear + launch): fine for a cold native start, but **avoid it in WEB mode, it wipes the logged-in browser profile.** |
| `open-url <url>` / `deep-link <url>` | `simctl openurl` / `am start -a VIEW -d`. WEB mode: your "address bar" to load `base_url`. NATIVE mode: fire the app's deep links. |
| `snapshot [--full]` | Parses Maestro's a11y hierarchy, assigns refs `e1…eN` to on-screen elements, prints a tree. In WEB mode the browser chrome (URL bar, tabs, toolbar, keyboard) is auto-filtered. `--full` includes non-interactive nodes. Refs expire after 60 s (`click` refuses a stale ref; re-snapshot). KNOWN QUIRK (Android Chrome): after keyboard show/dismiss the a11y export can go stale (the WebView shows as one empty "Web View" group). Recover with `screenshot` + a coordinate tap (`qa/bin/wadb shell input tap <x> <y>`), or `open-url` the page again. |
| `click <ref>` | Tap by ref: Android `adb input tap x y`; iOS a Maestro `tapOn: point` flow. |
| `tap-id <testID>` | Tap by accessibility/test id directly (no snapshot needed). |
| `fill <ref> <text>` | Tap, then type through a Maestro `inputText` flow on both platforms (avoids per-character re-renders). Appends to existing text; `clear` first if the field is pre-filled. Typing opens the on-screen keyboard, which SHIFTS the layout, so refs cached before the keyboard are stale afterwards: always re-`snapshot` after the last `fill` before tapping a submit control (and `press BACK` on Android first to dismiss the keyboard; with the keyboard closed BACK becomes page-back, so only use it while the keyboard is up). |
| `fill-id <testID> <text>` | Tap by id + type in one Maestro flow (fastest combination). |
| `clear <ref>` | Tap, then erase the field's existing text (Maestro `eraseText`, **up to 200 characters** — snapshot to confirm on longer values). |
| `wait-text <substring> [timeout-sec]` | Poll the hierarchy until text appears (default 10 s). Use it instead of `sleep` after navigation. |
| `press <BACK\|ENTER\|HOME\|TAB\|ESCAPE>` | Android keyevents. iOS supports ENTER and HOME (Maestro `pressKey`); iOS has no hardware BACK: use an in-app back control via snapshot. |
| `screenshot <path>` | Save a PNG. |
| `logs [--since <sec>] [--errors]` / `logs-clear` | logcat tail (Android) / `simctl spawn log show` (iOS). **iOS is scoped to the app/browser process; Android is the whole-device logcat** at `*:E` (`--errors`) or `*:W`, last 400 lines — other packages' lines appear, so correlate by tag/pid before blaming the app. Replaces playwright-cli `console error`. In WEB mode it is the BROWSER's process log, not the page's JS console. |
| `record-start <path.mp4>` / `record-stop` | Video (a real `.mp4` on both platforms). **Android caps one recording at 180 s** (`screenrecord --time-limit 180`) and drops everything after it, silently — restart it per journey rather than recording the whole session; iOS has no cap. Replaces playwright-cli tracing. |

Exit codes: `0` ok · `1` the device command failed · `2` usage · `3` stale or unknown ref
(re-snapshot) · `4` no device or app set. Treat anything non-zero as "the action did not
happen"; never assume a tap landed.

### Safari DOM bridge — `qa/bin/wk-ios` (iOS WEB mode only)

For iOS Safari web targets, `qa/bin/wk-ios` restores real JS/DOM access via WebKit Remote
Inspector (through `ios-webkit-debug-proxy`, installed by `qa/bin/setup-mobile.sh`; needs
`python3` and Node ≥ 22.4, which `doctor-mobile.sh` checks):

```bash
qa/bin/wk-ios 'document.title'                                  # eval any JS in the sim's Safari page
qa/bin/wk-ios 'document.querySelectorAll(".cart_item").length'  # exact-DOM assertions
qa/bin/wk-ios --url    # print the page's WebSocket debugger URL
qa/bin/wk-ios --stop   # stop the background proxy when the session ends
```

Use it whenever the a11y snapshot is not enough: exact-DOM verification (counts, attribute
values, hidden state), reading values the a11y tree collapses, or checking a suspected
rendering/JS failure. It is the same power as `playwright-cli eval`, but on the REAL iOS
engine. Requirements: a booted simulator with Safari on a page (`open-url` first). There is
no Android equivalent; on Android, drive by a11y refs and `logs`.

## What's Dropped vs Playwright

Both modes are driven through the device **accessibility tree, not a DOM**: native views and
web content alike are surfaced to a11y (headings, links, buttons, inputs and visible text
become tappable refs). Versus Playwright you LOSE, in BOTH modes:

- **CSS / DOM selectors** — you drive purely by visible/accessible labels and tap coordinates (native has no DOM at all; WEB mode has one but `snapshot` doesn't read it). EXCEPTION: iOS Safari web targets can READ the DOM via `qa/bin/wk-ios`; driving/tapping still goes through refs.
- **eval / JS injection** — no script context on native or Android Chrome. EXCEPTION: iOS Safari web targets get full JS eval via `qa/bin/wk-ios`.
- **console & network introspection** — `logs` is the app/browser process log, not a page console; there is no network panel. (iOS WEB: `qa/bin/wk-ios` can read `window`-level state, but there is still no console/network history.)
- **route / network mocking** — would need mitmproxy. Out of scope; flag in the report if a test required it.
- **state-save / state-load (storage_state)** — no transferable cookie jar. Auth happens on the device (NATIVE: in-app login/signup; WEB: a one-time interactive login the browser profile persists; see Phase 1).
- **resize** — the sim viewport is fixed. Use rotation instead.
- **multi-session race conditions** — would need two emulators. Deferred.
- **XSS payload assertions (WEB)** — without DOM/console you can't reliably confirm execution; you can still observe gross misbehaviour (crash, broken render). Generic input edges (long strings, emoji, paste, RTL, control chars) still apply in both modes.

## Mobile-Specific Heuristics (added on top of FEW HICCUPPS / SFDIPOT)

When charter-selecting heuristics in Phase 2, consider these mobile dimensions (most apply to
both modes; mode-specific ones are tagged):

- **Lifecycle:** background the app/browser → foreground after 10 min, kill → relaunch, OS-initiated suspend mid-flow. Does state survive? Is the session still valid? (WEB: does the page reload and lose input?)
- **Permissions (mostly NATIVE):** deny camera / notifications / contacts / location / biometrics on first prompt; revoke and re-grant. In WEB mode this surfaces as the browser's permission prompts (getUserMedia, geolocation, notifications).
- **Connectivity:** airplane mode mid-action, slow 3G, captive-portal Wi-Fi, IPv6-only.
- **Hardware / display:** rotation, dark mode, dynamic type / large font, low battery (≤15%), on-screen keyboard show/hide jank and input occlusion.
- **Deep links / URLs:** legitimate inbound link/intent, malformed scheme or query, foreign-app intent injection, very long URL.
- **Native a11y:** VoiceOver/TalkBack focus order, contrast, dynamic type, RTL layout, driven through the device a11y tree.
- **Storage / profile:** NATIVE: fresh install vs upgrade, force-clear app data mid-flow; WEB: fresh profile vs returning profile, cleared cookies, first-run interstitials.

## Session Phases

Execute each phase in order. Each phase doc points at the platform-agnostic guidance in
`${CLAUDE_SKILL_DIR}/../qa-explore/phases/` and lists the mobile-specific replacements/additions.

| Phase | File | Summary |
|-------|------|---------|
| **Setup** | `${CLAUDE_SKILL_DIR}/phases/00-setup.md` | Preflight, resolve target + driver + **detect mode**, boot sim; NATIVE: verify/install/launch the app; WEB: set browser, open base_url; init session dir |
| **Auth** | `${CLAUDE_SKILL_DIR}/phases/01-auth.md` | NATIVE: in-app login/signup (static OTP from config on staging). WEB: one-time interactive SSO/MFA the profile persists; never automate MFA |
| **Charter** | `${CLAUDE_SKILL_DIR}/phases/02-charter.md` | Business context + journeys + risk ranking + heuristic selection; start recording |
| **Discovery** | `${CLAUDE_SKILL_DIR}/phases/03-discovery.md` | Map screens/views (not raw DOM); app/browser logs instead of console; flag a11y aggregation (iOS) |
| **Journeys** | `${CLAUDE_SKILL_DIR}/phases/04-journeys.md` | E2E user journeys with data verification across views |
| **Features** | `${CLAUDE_SKILL_DIR}/phases/05-features.md` | Deep feature testing: same SFDIPOT, no eval-based tampering |
| **Edge Cases** | `${CLAUDE_SKILL_DIR}/phases/06-edge-cases.md` | Mobile edges: lifecycle, permissions, rotation, keyboard, deep links, offline (mode-tagged) |
| **Reporting** | `${CLAUDE_SKILL_DIR}/phases/07-reporting.md` | Same report format. Video instead of trace. |

## References

- `${CLAUDE_SKILL_DIR}/references/mobile-edges.md` — checklist of mobile-only edge cases, tagged by mode (rotation, keyboard, deep links, offline, permissions, biometrics, a11y).
- Content is matched by **visible text / accessibility labels** from `snapshot` (and tap coordinates when a11y aggregates nodes). There is no fixed selector/testID catalog; read the live snapshot tree each time.
- `${CLAUDE_SKILL_DIR}/../qa-explore/references/security-rules.md`, `severity-guide.md`, `session-rules.md`, `paths.md`, `output-contract.md` — apply as-is.
