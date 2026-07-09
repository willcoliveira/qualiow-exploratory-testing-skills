# Phase 7: Reflection & Reporting (Mobile)

Follow `../../qa-explore/phases/07-reporting.md` for the report structure, reflection
questions, bug-report template, session-report template, and stats.json schema. The
mobile additions (both modes):

## Stop recording

Replace `tracing-stop` with:

```bash
export MOBILE_CLI_STATE=/tmp/<target>-state.json
MCLI="$PWD/bin/mcli"   # run from the repo root
$MCLI record-stop   # closes the video (if record-start was used)
$MCLI stop          # close the app/browser — leaves the sim running for next time
```

Do NOT `relaunch-clean` / wipe the device at session end — in WEB mode this preserves the
persisted login; in NATIVE mode it preserves any account/state created this session.

## Bug-report — mobile fields

In each `bugs/BUG-NNN.md`, replace the qa-explore `Environment` line with:

```markdown
**Environment:**
- Mode: [native / web]
- Platform: [android / ios]
- Device: [emulator-5554 / iPhone 17 sim UDID]
- OS version: [from `bin/wadb shell getprop ro.build.version.release` / `xcrun simctl`]
- App under test: [native: app id + version + build type | web: browser bundle + version]
- Target URL: [web mode only: base_url]
- Environment: [preprod / staging / production]
```

And add an **Evidence** block enriched for mobile:

```markdown
### Evidence
- Screenshot: `screenshots/bug-NNN.png`
- Video clip: `videos/bug-NNN.mp4` (if recorded)
- Process log: `logs/bug-NNN.log` (logcat / simctl excerpt around the time of failure — app process in native mode, browser process in web mode, not a page JS console)
```

When you file a bug, capture the log at the moment of failure:

```bash
$MCLI logs --since 30 --errors > output/sessions/<session-dir>/logs/bug-NNN.log
```

## Session report — mobile additions

Append a "Mobile context" section to `session-report.md`:

```markdown
## Mobile Context

| Field | Value |
|---|---|
| Mode | [native / web] |
| Platform | [android / ios] |
| Device | [device label] |
| OS version | [version] |
| App under test | [native: app id + version + build type | web: browser bundle + version] |
| Target URL | [web mode only: base_url + environment] |
| mobile-cli version | [git sha of this repo] |

## Deferred Tests (require additional tooling)

| Test | Why deferred | What's needed |
|---|---|---|
| Network failure simulation | mobile-cli v1 has no proxy | mitmproxy + cert install |
| Multi-device race conditions | mobile-cli v1 single-device | Second emulator + parallel sessions |
| Server-side parameter tampering (non-deep-link) | No script eval on device | Proxy + request modification |
```

## Requirements coverage cross-check (optional)

If the session was scoped to gathered requirements / tickets, add a cross-check table — this
is **not** test execution, it's "did exploration touch the areas those requirements
designed?":

```markdown
## Requirements Cross-Check

Source: <ticket / acceptance criteria / gathered context>

| Requirement / Area | Covered? | Found bug? | Notes |
|---|---|---|---|
| ... | Yes/No/Partial | BUG-NNN or — | ... |
```

The point is to surface coverage gaps the team can decide to fill manually or with automation.

## stats.json — mobile fields

Append a `mobile` block to the qa-explore stats schema:

```json
"mobile": {
  "mode": "web",
  "platform": "ios",
  "device": "iPhone 17",
  "app_under_test": "com.apple.mobilesafari",
  "target_url": "https://staging.m.example.com",
  "environment": "staging",
  "videos_recorded": 1,
  "log_errors_observed": 0,
  "lifecycle_tests_run": 0,
  "rotation_tests_run": 0,
  "deferred_tests": []
}
```

(For native mode set `"mode": "native"`, `app_under_test` to the app id, and `target_url` to null.)

## Update progress.json — final

Same as qa-explore. Set `status: complete`, all phases to final status.

## Update indexes

Append the session to `output/sessions/INDEX.md`.
