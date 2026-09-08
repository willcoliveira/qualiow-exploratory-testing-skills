# Phase 6: Edge Cases & Mobile-Specific (mode-aware)

Follow `${CLAUDE_SKILL_DIR}/../qa-explore/phases/06-edge-cases.md` for the saboteur mindset. Edges are tagged
**[both]**, **[native]**, or **[web]** — run the ones that fit the resolved mode.

## Dropped / limited (no DOM, no JS console)

- **XSS execution assertions via `fill` [web]** — without DOM/console you can't confirm execution. You can still submit payloads and watch for gross breakage (crash, broken render, reflected unescaped text in the a11y tree).
- **`route ... --status=500` network simulation [both]** — needs mitmproxy. **Deferred** — log scenarios that would benefit, run them once a proxy exists.
- **Multi-session race [both]** — needs two emulators. **Deferred.**
- **`resize` viewport tests** — sim viewport is fixed. Use **rotation** instead (below).

## Kept (still useful on mobile)

- **Unicode / emoji [both]** in inputs: `qa/bin/mcli fill <ref> "naïve café 🤑 العربية"`
- **Whitespace-only [both]:** `qa/bin/mcli fill <ref> "   "`
- **Extremely long [both]:** see the truncation caveat in `05-features.md`
- **State manipulation via deep link / URL [both]:** NATIVE `qa/bin/mcli deep-link "<app-scheme>://<path>?<tampered>"`; WEB `qa/bin/mcli open-url "<base_url>/<deep view>?<tampered params>"`
- **Replay [both]:** double-tap submit; submit then back then re-submit
- **Brute force / rate limits [both]:** repeated failed submissions/logins — lockout / cooldown?

## Mobile-device edges (the high-value additions)

### Lifecycle [both]

```bash
# Background mid-flow
qa/bin/mcli press HOME           # both platforms (iOS via Maestro pressKey Home)
sleep 30
qa/bin/mcli launch               # foreground — did state restore or reload-and-lose-state?

# Kill mid-flow
qa/bin/mcli stop
qa/bin/mcli launch
# WEB only: re-open the view you were on
# qa/bin/mcli open-url <current view>

# OS-initiated suspend (Android)
qa/bin/wadb shell am broadcast -a android.intent.action.SCREEN_OFF
sleep 5
qa/bin/wadb shell am broadcast -a android.intent.action.SCREEN_ON
```

For each: did state survive? Was auth still valid? Did an in-progress action complete or
duplicate?

### Permissions [native] (browser prompts in [web])

NATIVE — deny / revoke / re-grant runtime permissions and check graceful handling:
```bash
qa/bin/wadb shell pm revoke <app.package> android.permission.CAMERA   # then try the QR/camera feature
qa/bin/wadb shell pm grant  <app.package> android.permission.CAMERA
# iOS sim: xcrun simctl privacy <udid> reset|grant camera <app.bundle_id>
```
Test camera / notifications / contacts / location. In WEB mode the same applies to the
**browser** package (controls page getUserMedia/geolocation/notifications). Ask: does denial
crash or degrade gracefully? Does the app explain WHY before prompting? Can the user re-grant?

### Biometrics [native]

If the app uses biometric auth: approve → succeeds; deny/cancel → password fallback works;
disable biometrics in OS mid-flow → graceful fallback. Android emulator can simulate a
fingerprint touch:
```bash
qa/bin/wadb -e emu finger touch 1
```

### Push notifications [native]

If the app registers for push: deny the notification permission and confirm the app still
works; trigger a notification and tap it — does it deep-link to the right screen with context?

### Connectivity [both]

```bash
# Android — toggle network
qa/bin/wadb shell svc wifi disable && qa/bin/wadb shell svc data disable
# Run a submit/save flow — does it surface "offline" cleanly or hang/blank?
qa/bin/wadb shell svc wifi enable && qa/bin/wadb shell svc data enable

# Slow network (Android emulator console via adb, no telnet):
qa/bin/wadb emu network speed gsm && qa/bin/wadb emu network delay umts
# restore: qa/bin/wadb emu network speed full && qa/bin/wadb emu network delay none
```

Ask: does the app surface offline cleanly, queue or fail loudly, auto-retry, or just spin?

### Rotation [both]

```bash
# Android
qa/bin/wadb shell settings put system accelerometer_rotation 0
qa/bin/wadb shell settings put system user_rotation 1   # landscape
qa/bin/mcli snapshot                                        # does the layout reflow? keyboard cover input?
qa/bin/wadb shell settings put system user_rotation 0   # portrait
```

iOS sim: Cmd+Right/Left Arrow in the Simulator to rotate. Check reflow, clipping, and that
no content becomes unreachable in landscape.

### On-screen keyboard [both]

Focus an input near the bottom of the screen and snapshot — does the keyboard occlude the
input or the submit button? Does the view scroll it into view? Does return/"Done" dismiss it
and submit correctly?

### Deep links / URL attack surface [both]

```bash
# NATIVE — exercise the app's own scheme/intent:
qa/bin/mcli deep-link "<app-scheme>://<a real path>"
qa/bin/mcli deep-link "<app-scheme>://<path>?id=&n=NaN"
qa/bin/wadb shell am start -a android.intent.action.VIEW -d "<app-scheme>://<path>?x=$(python3 -c 'print("A"*5000)')"

# WEB — exercise the target URL:
qa/bin/mcli open-url "<base_url>/<a real deep view>"
qa/bin/mcli open-url "<base_url>/<view>?id=&n=NaN"
qa/bin/mcli open-url "<base_url>/<view>?next=javascript:alert(1)"
qa/bin/mcli open-url "<base_url>/<view>?q=$(python3 -c 'print("A"*5000)')"
```

Crash, freeze, blank screen, open-redirect, or accept-as-valid are all findings.

### Privacy in app-switcher / Recents [both]

```bash
# Navigate to a view with sensitive data, then open Recents and screenshot the preview
qa/bin/wadb shell input keyevent KEYCODE_APP_SWITCH    # Android Recents
qa/bin/mcli screenshot output/sessions/<session-dir>/screenshots/recents-preview.png
```

Is sensitive data (account info, tokens-in-URL, personal data) visible in the Recents preview?
A native app can mask its preview (FLAG_SECURE); web apps generally can't — note the leak as a
finding where it matters.

### Storage / data wipe

- **NATIVE:** force-clear app data mid-flow (Android `qa/bin/mcli relaunch-clean` = force-stop + `pm clear` + launch) — does it land on a clean welcome state or get stuck on an intermediate screen? Also test fresh-install vs upgrade if you have both builds.
- **WEB:** **do NOT use `relaunch-clean`** — on Android it `pm clear`s the *browser* and wipes the logged-in profile, forcing a fresh SSO+MFA login. If you need a cleared-cookie test, do it knowingly and expect to re-login.
- Returning vs fresh state [both]: correct first-ever behavior (empty states, first-run interstitials) AND returning behavior.

### Empty / boundary states [both]

For each list / feed: zero items, exactly one item, many items. Check formatters at the
extremes (very large numbers, long names, long localized strings at mobile width).

## After Edge Cases

Write `phase-6-edge-cases.md` (confidentiality header first) with one section per category. Each deferred test gets a single
line so it's visible.

**Update progress.**
