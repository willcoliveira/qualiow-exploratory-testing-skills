# Phase 7: Reflection & Reporting (Mobile)

Follow `${CLAUDE_SKILL_DIR}/../qa-explore/phases/07-reporting.md` for the reflection
questions and the report structure; every artefact uses the format in
`${CLAUDE_SKILL_DIR}/../qa-explore/references/output-contract.md` (confidentiality header
first). The mobile differences (both modes):

## Stop recording

Replace `video-stop` / `tracing-stop` with:

```bash
qa/bin/mcli record-stop   # closes the .mp4 (if record-start was used)
qa/bin/mcli stop          # close the app/browser — leaves the sim running for next time
qa/bin/wk-ios --stop      # iOS WEB mode only, if the DOM bridge was used
```

Do NOT `relaunch-clean` / wipe the device at session end: in WEB mode this preserves the
persisted login; in NATIVE mode it preserves any account/state created this session. There
is no playwright-cli session to `close` / `delete-data` on mobile.

## Bug report — mobile fields

Same file and headings as the contract — `bugs/BUG-NNN.md`, starting with the two-line
header, verbatim:

```
> CONFIDENTIAL: This report may contain internal URLs, security vulnerabilities,
> and application details. Do not share outside your organization without review.
```

then `# BUG-NNN: [Component] fails [Condition] causing [Impact]`, `**Severity:**`,
`**Priority:**`, `**Component:**`, `**URL:**`, `**Environment:**`,
`**Reproduction rate:**`, then `## Summary`, `## Expected Behavior`, `## Actual Behavior`,
`## Steps to Reproduce`, `## Business Impact`, `## Evidence` and
`## Recommended Fix Priority`. Two fields change on mobile:

```markdown
**URL:** <WEB: the page URL loaded via open-url | NATIVE: the screen name or deep link>
**Environment:**
- Mode: native | web
- Platform: android | ios
- Device: emulator-5554 | qa-iphone (UDID …)
- OS version: <android: qa/bin/wadb shell getprop ro.build.version.release — ios: xcrun simctl list runtimes>
- App under test: <native: app id + version + build type | web: browser bundle + version>
- Target URL: <web mode only: base_url>
- Environment: <preprod | staging | production>
```

And `## Evidence` carries the mobile artefacts:

```markdown
## Evidence
- Screenshot: `screenshots/BUG-NNN.png`
- Video: `videos/BUG-NNN.mp4` (if recorded)
- Log: `logs/BUG-NNN.log` (logcat / simctl excerpt around the failure — iOS is scoped to the app/browser process, Android is whole-device logcat, and neither is a page JS console)
- Console errors: n/a on mobile (or the wk-ios observation, iOS WEB)
- Network failures: n/a (no proxy) — or "needs proxy capture"
```

Capture the log at the moment of failure (the `logs/` directory was created in setup):

```bash
qa/bin/mcli screenshot output/sessions/<session-dir>/screenshots/BUG-NNN.png
qa/bin/mcli logs --since 30 --errors > output/sessions/<session-dir>/logs/BUG-NNN.log
```

Redact the log excerpt per `security-rules.md` before it is saved: process logs routinely
carry tokens and emails.

## Session report — mobile additions

`session-report.md` per the contract with `Kind: mobile`, then append after `## Session Stats`:

```markdown
## Mobile Context

| Field | Value |
|---|---|
| Mode | native / web |
| Platform | android / ios |
| Device | <device label> |
| OS version | <version> |
| App under test | <native: app id + version + build type | web: browser bundle + version> |
| Target URL | <web mode only: base_url + environment> |
| Source state | <native: branch + sha + clean/dirty, if rebuilt> |
| Driver version | <output of `qa/bin/mcli version`> |

## Deferred Tests (require additional tooling)

| Test | Why deferred | What's needed |
|---|---|---|
| Network failure simulation | mobile-cli has no proxy | mitmproxy + cert install |
| Multi-device race conditions | single device | second emulator + parallel sessions |
| Server-side parameter tampering (non-deep-link) | no script eval on device | proxy + request modification |
```

Every deferred test also appears in the coverage map as `not-tested` with the reason, so it
shows up as a known gap.

## Requirements coverage cross-check (optional)

If the session was scoped to gathered requirements / tickets, add a cross-check table. This
is **not** test execution; it is "did exploration touch the areas those requirements
designed?":

```markdown
## Requirements Cross-Check

Source: <ticket / acceptance criteria / gathered context>

| Requirement / Area | Covered? | Found bug? | Notes |
|---|---|---|---|
| ... | Yes/No/Partial | BUG-NNN or — | ... |
```

## stats.json — mobile fields

`stats.json` exactly as the contract defines it, with `"kind": "mobile"`, and the device
block under `coverage.mobile` (the schema is strict; no other top-level keys):

```json
"coverage": {
  "mobile": {
    "mode": "web",
    "platform": "ios",
    "device": "qa-iphone",
    "app_under_test": "com.apple.mobilesafari",
    "target_url": "https://staging.m.example.com",
    "environment": "staging",
    "videos_recorded": 1,
    "log_errors_observed": 0,
    "lifecycle_tests_run": 0,
    "rotation_tests_run": 0,
    "deferred_tests": []
  }
}
```

(For native mode set `"mode": "native"`, `app_under_test` to the app id, and `target_url` to null.)

## Finalize

```bash
qualiow session finalize output/sessions/<session-dir>
```

It validates `stats.json` against the strict schema, checks the confidentiality header on
every artefact and scans the directory against the redaction list — the logcat / simctl
excerpts under `logs/` are scanned like everything else — then appends the session row to
`output/sessions/INDEX.md` (`Kind` = `mobile`) and one row per bug to
`output/bugs/all-bugs.md`, records the session metrics and sets `progress.json` to
`complete`. It is idempotent.

On exit 1 it prints a numbered list of violations naming each file: fix those files and run
it again. `--check` validates and writes nothing. Resolve the `qualiow` prefix per
`${CLAUDE_SKILL_DIR}/../qa-explore/references/paths.md`; if the CLI is unavailable, write the
rows by hand in the column order defined there.
