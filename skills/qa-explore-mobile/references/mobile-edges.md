# Mobile Edge Cases — Checklist (native + web)

Treat as a thinking tool, not a checkbox sheet. Pick what matches the feature and the resolved
**mode**. Each entry is tagged **[both]**, **[native]**, or **[web]**, with the adb / simctl
trigger where possible. `<app>` = the app under test's package/bundle in NATIVE mode, or the
browser bundle (`com.android.chrome` / `com.apple.mobilesafari`) in WEB mode. `$MCLI` is the
`bin/mcli` wrapper; use `bin/wadb` for raw adb.

## Lifecycle [both]

| Edge | Android trigger | iOS sim trigger |
|---|---|---|
| Background app/browser | `bin/wadb shell input keyevent KEYCODE_HOME` | home gesture/button in Simulator |
| Kill app/browser | `bin/wadb shell am force-stop <app>` | `xcrun simctl terminate <udid> <app>` |
| Cold relaunch | `$MCLI launch` (WEB: then `$MCLI open-url <url>`) | `$MCLI launch` (WEB: then `$MCLI open-url <url>`) |
| Clear data | NATIVE: `$MCLI relaunch-clean` (= force-stop + pm clear) — clean-state test. WEB: same command **wipes the logged-in profile; avoid unless intended** | NATIVE: `xcrun simctl uninstall` + reinstall. WEB: clear Safari data in sim Settings (drops the login) |
| Screen off / on | `bin/wadb shell input keyevent KEYCODE_POWER` (toggle) | n/a (sim doesn't lock realistically) |

**Ask:** does state survive? Does an in-progress action complete? Does auth/session persist, or is everything reloaded?

## Permissions [native] (and browser prompts in [web])

NATIVE: the app requests OS runtime permissions directly. WEB: the *page* requests them via
the BROWSER, so grant/revoke on the browser package controls `getUserMedia` camera,
geolocation, notifications. Use `<app>` = app package (native) or browser (web).

| Permission | Android revoke | Android grant | iOS sim |
|---|---|---|---|
| Camera | `bin/wadb shell pm revoke <app> android.permission.CAMERA` | `pm grant` | `xcrun simctl privacy <udid> reset camera <app>` (then re-prompt) |
| Location | `pm revoke <app> android.permission.ACCESS_FINE_LOCATION` | `pm grant` | `xcrun simctl privacy <udid> reset location <app>` |
| Notifications | `pm revoke <app> android.permission.POST_NOTIFICATIONS` | `pm grant` | `xcrun simctl privacy <udid> reset notifications <app>` |
| Contacts [native] | `pm revoke <app> android.permission.READ_CONTACTS` | `pm grant` | `xcrun simctl privacy <udid> reset contacts <app>` |

**Ask:** does the app explain WHY before prompting? Does denial crash or degrade gracefully? Can the user recover/re-grant?

## Biometrics [native]

App-level biometric auth only (a real sim browser doesn't expose a biometric flow to web).
Approve → succeeds; deny/cancel → password fallback; disable in OS mid-flow → graceful
fallback. Android emulator can simulate a fingerprint: `bin/wadb -e emu finger touch 1`.

## Push notifications [native]

If the app registers for push: deny the prompt and confirm the app still works; deliver a
notification and tap it — does it deep-link to the right screen with context?

## Connectivity [both]

| Edge | Android | iOS sim |
|---|---|---|
| Airplane mode | `bin/wadb shell svc wifi disable && bin/wadb shell svc data disable` (re-enable to undo) | Network Link Conditioner (manual) |
| Slow network | telnet to emulator console: `telnet localhost 5554`, then `network speed gsm` | Network Link Conditioner |
| Captive portal | hard — skip for v1 | hard — skip |

**Ask:** does the app surface offline cleanly? Does it queue actions or fail loudly? Does it
auto-retry? Does it leak retries (battery drain)?

## Hardware / display [both]

| Edge | Android | iOS sim |
|---|---|---|
| Rotation portrait/landscape | `bin/wadb shell settings put system user_rotation 0/1/2/3` | Cmd+Right/Left Arrow in Simulator |
| Dark mode | `bin/wadb shell "cmd uimode night yes"` (and `no`) | `xcrun simctl ui <udid> appearance dark/light` |
| Dynamic type / large font | `bin/wadb shell settings put system font_scale 1.5` | Settings app inside sim |
| Low battery | `bin/wadb shell dumpsys battery set level 10` (and `reset`) | n/a |
| Split-screen | manual via Recents | n/a |

**Ask:** does the layout reflow, clip, or hide content? Does it honor the OS dark-mode /
font-scale, or break? **[web]** also: address-bar show/hide on scroll changing the viewport
height (`100vh` jumps), momentum/overscroll bounce, and whether the page respects the
`viewport` meta (no desktop-width zoom-out, no horizontal scroll).

## Deep links / URL handling [both]

```bash
# NATIVE — the app's own scheme/intent
$MCLI deep-link "<app-scheme>://<a real path>"
$MCLI deep-link "<app-scheme>://<path>?id=&n=NaN"
bin/wadb shell am start -W -a android.intent.action.VIEW -d "<app-scheme>://<path>" -f 0x10000000

# WEB — the target URL
$MCLI open-url "<base_url>/<a real deep view>"
$MCLI open-url "<base_url>/<view>?id=&n=NaN"
$MCLI open-url "<base_url>/<view>?next=javascript:alert(1)"
$MCLI open-url "<base_url>/<view>?q=$(python3 -c 'print("A"*5000)')"
```

**Ask:** crash, freeze, blank screen, open-redirect, or unsanitized reflection?

## Privacy / leak surface [both]

- **Recents preview:** background while on a sensitive screen, screencap Recents — is personal data / a token-in-URL visible? A native app can mask its preview (FLAG_SECURE); web pages generally can't.
- **Process log:** `$MCLI logs --errors` — grep for PII or credentials (emails, tokens, secrets) leaking into the app/browser process log.
- **URL leakage [web]:** sensitive values in query strings end up in history and Recents — flag where they shouldn't be.
- **Clipboard:** if the app copies sensitive text, does it auto-clear/expire?

## Storage / state [both]

- NATIVE: force-clear app data mid-flow (`pm clear`) — clean restart or stuck intermediate screen? Fresh-install vs upgrade: did state migrate?
- WEB: clearing browser cookies/data drops the login session — test the cleared-state behavior knowingly, not by accident.
- Returning vs fresh state: correct first-run interstitials, empty states, onboarding?
- Long-lived session: does a session that expires while the app/page is open prompt a graceful re-auth, or break into a blank/broken state?

## Native a11y [both] (driven through the device a11y tree)

- TalkBack (Android): `bin/wadb shell settings put secure enabled_accessibility_services com.google.android.marvin.talkback/.TalkBackService`
- VoiceOver (iOS sim): mostly limited on sim — manual via the accessibility menu
- **Focus order:** swipe right repeatedly — does focus land on every interactive element in a sensible order?
- **Aggregation:** does each control announce its own label, or does the view dump many fields into one comma-joined label? (Known iOS issue — see `phases/03-discovery.md`.)
- **Contrast:** spot-check critical text — sufficient contrast in both light and dark mode?
- **Touch targets:** are tap targets finger-sized, or desktop-sized and hard to hit on a phone?

## Empty / boundary states [both]

- Zero items / one item / many items in lists.
- First-ever visit vs returning visit.
- Formatter extremes: very large numbers, long names, long localized strings at mobile width — truncation, overflow, `NaN`/`undefined`?
