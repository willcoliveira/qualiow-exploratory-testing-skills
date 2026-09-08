# Phase 0: Mobile Session Setup (mode-aware)

Follow `${CLAUDE_SKILL_DIR}/../qa-explore/phases/00-setup.md` for the general structure (parse
input, load context, load knowledge, create the session dir, init progress.json). The mobile
differences, and the native-vs-web branch, are below. There is no playwright-cli session and
therefore no `-s=<sid>` on mobile.

## Step 0 — Resolve the driver, then preflight (fail fast on a fresh machine)

Resolve the driver prefix once, in the order from
`${CLAUDE_SKILL_DIR}/../qa-explore/references/paths.md`: `qa/bin/mcli` (after `qualiow init`)
→ `bin/mcli` (a checkout of this repository) → `mcli` on PATH → the plugin's `bin/mcli`.
Write that literal prefix in every command for the rest of the session. **This and every
other phase file show `qa/bin/mcli` and `qa/bin/wadb`; substitute yours.**

Then verify the toolchain exists (Maestro plus the iOS and/or Android SDKs, which are NOT
installed by default and are easy to assume present):

```bash
qa/bin/doctor-mobile.sh            # or --ios / --android to scope to one platform
```

If it prints **NOT READY**, STOP: surface the `✗` items to the user and point them at
`qa/bin/setup-mobile.sh` (same prefix you resolved above; auto-installs the scriptable prerequisites; Xcode + the iOS runtime
are guided-manual). Do NOT start a session on a half-provisioned machine; a missing `adb` /
`maestro` / runtime fails cryptically deep in the run. Full guide: `docs/MOBILE-SETUP.md`.

## Step 1 — Parse target + DETECT MODE

Resolve the target as `paths.md` says (`--target <id>` → `data/targets/<id>.yml`; no
`--target` → `qa/target.yml`), then extract:

- **platform**: `android` | `ios` (required).
- **device**: emulator/sim identifier.
  - Android: AVD name (from `device.avd`) or `emulator-5554` if already booted.
  - iOS: simulator name (e.g. `qa-iphone`) or UDID (`device.name` / `device.udid`).
- **app id**: `app.bundle_id` (iOS) / `app.package` (Android).
- **mode**, derived:
  - **WEB mode** if the app id is a known browser bundle (`com.apple.mobilesafari` /
    `com.android.chrome`) AND the config has a `web.base_url`. The browser is the driver; the
    web URL is the SUT. Templates: `data/targets/_example-sim-ios-safari.yml`,
    `data/targets/_example-sim-android-chrome.yml` (read the matching one; their `notes:`
    blocks document the web setup).
  - **NATIVE mode** otherwise: a non-browser app id with installable artifacts
    (`app.app_paths` / `app.apk_paths`), optionally a `source_repo` with `build_commands`.
    The installed app is the SUT. Template: `data/targets/_example-native-mobile.yml`.
- **WEB only**: `web.base_url` / `web.start_url`.
- **NATIVE only**: `app.app_paths`/`apk_paths` (artifact to verify/install), and optional
  `source_repo.path` + `source_repo.build_commands`.

Record `mode`; every later step branches on it. Apply the **production rule** from
`security-rules.md` to `web.base_url` (WEB) or to the target's `environment`/`notes` (NATIVE)
and carry read-only mode through the session if it fires.

## Step 2 — Boot the simulator/emulator if needed (shared)

```bash
# Android — check first, only boot if no device attached
qa/bin/wadb devices
qa/bin/mcli boot <avd-name>                        # ONLY if the line above listed no device

# iOS — check first, only boot if no sim booted
xcrun simctl list devices booted
qa/bin/mcli boot <sim-name-or-UDID>                # boots and opens Simulator.app
```

**Do NOT reboot a sim/emulator that's already running**: preserve installed apps and (WEB
mode) the persisted browser profile that holds the logged-in session. On iOS `boot` is safe
to re-run (an already-booted sim is accepted); on **Android it always spawns a NEW emulator
process** and, if that AVD is already up, blocks for 180 s and then fails. Check first.

Point the driver at the device (this also picks a **per-device** state file,
`~/.mobile-cli/<device>.json`). If another session is driving the same device, pass your own
`--state <file>` on every command or the two will overwrite each other's refs:

```bash
qa/bin/mcli set-device <emulator-5554 | ios sim name or UDID> --platform <android|ios>
qa/bin/mcli info
```

---

## Step 3 — NATIVE branch: verify / install / (optional rebuild) / launch

Skip this whole step in WEB mode.

### 3a. Verify the app is installed

```bash
# Android
qa/bin/wadb shell pm list packages | grep <app.package>
# iOS
xcrun simctl get_app_container <udid> <app.bundle_id> 2>/dev/null
```

### 3b. Install if missing

If not installed and the config provides an artifact path, install from it:
- Android: `qa/bin/wadb install -r <app.apk_paths[...]>`
- iOS: `xcrun simctl install <udid> <app.app_paths[...]>`

If not installed and no artifact path is configured, **stop and ask the user** how to obtain
a build (point them at the target's `source_repo.build_commands` if defined). Do NOT invent a
build command.

### 3c. OPTIONAL refresh against latest source

**Skip unless the user passed `--rebuild` OR the session goal explicitly mentions "latest" /
"fresh" / "newest" build.** Otherwise run against whatever is installed (faster, preserves
state). This skill does **not** assume any build framework; it runs the EXACT commands the
target config provides:

```bash
# 1. Drift check (using the target's source_repo.build_commands.refresh, if defined)
git -C <source_repo.path> status -sb && git -C <source_repo.path> fetch && git -C <source_repo.path> log HEAD..@{u} --oneline

# 2. Decide WITH the user before pulling:
#    clean + behind → safe to pull then rebuild; dirty → ask (stash/commit/build-as-is);
#    intentionally pinned branch → do NOT switch branches.

# 3. Run the platform build command verbatim from source_repo.build_commands
#    (e.g. build_commands.android_release / build_commands.ios_debug). These are
#    project-defined; the skill does not hardcode them. Run long builds in the
#    background and wait for completion before installing.

# 4. After install, cold-start fresh: qa/bin/mcli relaunch-clean (Android) or stop + launch (iOS)
```

**Always log the source state in the report** (branch + sha + clean/dirty) so readers know
what code the session ran against.

### 3d. Launch the app

```bash
qa/bin/mcli set-app <app.bundle_id OR app.package>
qa/bin/mcli launch
qa/bin/mcli snapshot                                     # sanity check — first screen renders
```

---

## Step 4 — WEB branch: set browser, open URL, snapshot

Skip this step in NATIVE mode.

On Android, confirm the browser exists first (Safari ships with every iOS runtime; Chrome is
only guaranteed on **Google-APIs/Play** images; stock AOSP images may lack it):

```bash
qa/bin/wadb shell pm list packages | grep chrome     # expect: package:com.android.chrome
```

If `com.android.chrome` is absent, use a Play-image AVD (or fall back to the iOS Safari
target) rather than assuming Chrome is installed. Do not attempt to install a browser.

```bash
qa/bin/mcli set-app <com.apple.mobilesafari OR com.android.chrome>
qa/bin/mcli launch
qa/bin/mcli open-url <web.base_url or web.start_url>
qa/bin/mcli wait-text "<a word from the landing page>" 15
qa/bin/mcli snapshot                                     # sanity check — the page renders
```

On a fresh Chrome profile you may see a one-time first-run / "Open tabs" promo bubble;
`mobile-cli` filters the routine promo out of snapshots, but if a full-screen
first-run/sign-in-to-Chrome interstitial appears, it must be dismissed once by hand.

---

## Step 5 — Session directory (shared)

Per the scheme in `paths.md`, with the platform in the slug:

```
output/sessions/<YYYY-MM-DD-HHmm>-mobile-<target>-<android|ios>/
  charter.md
  session-log.md
  progress.json
  screenshots/
  bugs/
  videos/            # record-start output (.mp4)
  logs/              # process-log excerpts per bug (logs/BUG-NNN.log)
```

Create all four subdirectories now — `screenshots/`, `bugs/`, `videos/` **and `logs/`**.
Phase 7 redirects log output into `logs/` with `>`, which fails outright if the directory
does not exist.

## Step 6 — progress.json additions (shared)

Same base schema as qa-explore with `"kind": "mobile"`. Add a `platform` key including the
resolved `mode`:

```json
"platform": {
  "mode": "native",
  "os": "android",
  "device": "emulator-5554",
  "app_id": "com.example.myapp",
  "app_version": "<from `qa/bin/wadb shell dumpsys package <pkg> | grep versionName`>",
  "target_url": null
}
```

For WEB mode, set `"mode": "web"`, `app_id` to the browser bundle, and `target_url` to the
`base_url` (leave `app_version` null; it's the browser's, not the SUT's).

The `console_errors` counter from qa-explore becomes `app_log_errors` (app/browser-process
ERROR-level log matches; coarser than a real JS console, see Phase 3).

**Skip qa-explore's Step 6 (Playwright Test Agents bootstrap) entirely; not applicable when
the driver is mobile-cli/Maestro.**
