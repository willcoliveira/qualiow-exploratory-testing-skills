# Phase 0: Mobile Session Setup (mode-aware)

Follow `../../qa-explore/phases/00-setup.md` for the general structure (parse input, load
context, load knowledge, create session dir, init progress.json). The mobile differences,
and the native-vs-web branch, are below.

## Step 0 — Preflight (fail fast on a fresh machine)

Before anything else, verify the toolchain exists — the mobile path needs Maestro plus the
iOS and/or Android SDKs, which are NOT installed by default and are easy to assume present:

```bash
scripts/doctor-mobile.sh            # or --ios / --android to scope to one platform
```

If it prints **NOT READY**, STOP: surface the `✗` items to the user and point them at
`scripts/setup-mobile.sh` (auto-installs the scriptable prerequisites; Xcode + the iOS
runtime are guided-manual). Do NOT start a session on a half-provisioned machine — a missing
`adb` / `maestro` / runtime fails cryptically deep in the run. Full guide: `docs/MOBILE-SETUP.md`.

## Step 1 — Parse target + DETECT MODE

From the user message or the target config in `data/targets/`, extract:

- **platform**: `android` | `ios` (required).
- **device**: emulator/sim identifier.
  - Android: AVD name (from `device.avd`) or `emulator-5554` if already booted.
  - iOS: simulator name (e.g. `iPhone 17`) or UDID.
- **app id**: `app.bundle_id` (iOS) / `app.package` (Android).
- **mode** — derive it:
  - **WEB mode** if the app id is a known browser bundle (`com.apple.mobilesafari` /
    `com.android.chrome`) AND the config has a `web.base_url`. The browser is the driver; the
    web URL is the SUT. Templates: `data/targets/_example-sim-ios-safari.yml`,
    `data/targets/_example-sim-android-chrome.yml` (read the matching one — their `notes:`
    blocks document the web setup).
  - **NATIVE mode** otherwise — i.e. a non-browser app id with installable artifacts
    (`app.app_paths` / `app.apk_paths`), optionally a `source_repo` with `build_commands`.
    The installed app is the SUT. Template: `data/targets/_example-native-mobile.yml`.
- **WEB only**: `web.base_url` / `web.start_url`.
- **NATIVE only**: `app.app_paths`/`apk_paths` (artifact to verify/install), and optional
  `source_repo.path` + `source_repo.build_commands`.

Record `mode` — every later step branches on it.

## Step 2 — Boot the simulator/emulator if needed (shared)

```bash
# Android — check first, only boot if no device attached
bin/wadb devices
# If empty:
#   export ANDROID_HOME=$HOME/Library/Android/sdk
#   export PATH=$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH
#   nohup emulator -avd <avd-name> -no-snapshot -no-boot-anim -memory 4096 -gpu auto & disown
#   adb wait-for-device

# iOS — check first, only boot if no sim booted
xcrun simctl list devices booted
# If empty:
#   xcrun simctl boot <UDID-or-name>
#   open -a Simulator
```

**Do NOT reboot a sim/emulator that's already running** — preserve installed apps and (WEB
mode) the persisted browser profile that holds the logged-in session.

Set the driver state for the rest of the phase:

```bash
export MOBILE_CLI_STATE=/tmp/<target>-state.json   # isolate this session's device/app state
MCLI="$PWD/bin/mcli"   # run from the repo root
$MCLI set-device <emulator-5554 OR ios-udid>
```

Use a dedicated `MOBILE_CLI_STATE` file per target so concurrent/sequential sessions don't
clobber each other's device/app state.

---

## Step 3 — NATIVE branch: verify / install / (optional rebuild) / launch

Skip this whole step in WEB mode.

### 3a. Verify the app is installed

```bash
# Android
bin/wadb shell pm list packages | grep <app.package>
# iOS
xcrun simctl get_app_container <udid> <app.bundle_id> 2>/dev/null
```

### 3b. Install if missing

If not installed and the config provides an artifact path, install from it:
- Android: `bin/wadb install -r <app.apk_paths[...]>`
- iOS: `xcrun simctl install <udid> <app.app_paths[...]>`

If not installed and no artifact path is configured, **stop and ask the user** how to obtain
a build (point them at the target's `source_repo.build_commands` if defined). Do NOT invent a
build command.

### 3c. OPTIONAL refresh against latest source

**Skip unless the user passed `--rebuild` OR the session goal explicitly mentions "latest" /
"fresh" / "newest" build.** Otherwise run against whatever is installed (faster, preserves
state). This skill does **not** assume any build framework — it runs the EXACT commands the
target config provides:

```bash
# 1. Drift check (using the target's source_repo.build_commands.refresh, if defined)
cd <source_repo.path>
git status -sb && git fetch && git log HEAD..@{u} --oneline

# 2. Decide WITH the user before pulling:
#    clean + behind → safe to pull then rebuild; dirty → ask (stash/commit/build-as-is);
#    intentionally pinned branch → do NOT switch branches.

# 3. Run the platform build command verbatim from source_repo.build_commands
#    (e.g. build_commands.android_release / build_commands.ios_debug). These are
#    project-defined; the skill does not hardcode them. Long builds: run in the
#    background and PID-wait so you get notified on completion:
#      nohup <the configured build command> > /tmp/mobile-build.log 2>&1 &
#      BUILD_PID=$!; until ! kill -0 $BUILD_PID 2>/dev/null; do sleep 15; done

# 4. After install, cold-start fresh: $MCLI relaunch-clean (Android) or stop+launch (iOS)
```

**Always log the source state in the report** (branch + sha + clean/dirty) so readers know
what code the session ran against.

### 3d. Launch the app

```bash
$MCLI set-app <app.bundle_id OR app.package>
$MCLI launch
$MCLI snapshot                                     # sanity check — first screen renders
```

---

## Step 4 — WEB branch: set browser, open URL, snapshot

Skip this step in NATIVE mode.

On Android, confirm the browser exists first (Safari ships with every iOS runtime; Chrome is
only guaranteed on **Google-APIs/Play** images — stock AOSP images may lack it):

```bash
bin/wadb shell pm list packages | grep chrome     # expect: package:com.android.chrome
```

If `com.android.chrome` is absent, use a Play-image AVD (or fall back to the iOS Safari
target) rather than assuming Chrome is installed. Do not attempt to install a browser.

```bash
$MCLI set-app <com.apple.mobilesafari OR com.android.chrome>
$MCLI launch
$MCLI open-url <web.base_url or web.start_url>
$MCLI snapshot                                     # sanity check — the page renders
```

On a fresh Chrome profile you may see a one-time first-run / "Open tabs" promo bubble —
`mobile-cli` filters the routine promo out of snapshots, but if a full-screen
first-run/sign-in-to-Chrome interstitial appears, it must be dismissed once by hand.

---

## Step 5 — Session directory (shared)

Same as qa-explore but include `platform` in the dir name:

```
output/sessions/<YYYY-MM-DD-HHmm>-<target>-<platform>/
  charter.md
  session-log.md
  screenshots/
  bugs/
  videos/            # mobile-only — for record-start output
```

## Step 6 — progress.json additions (shared)

Same base schema as qa-explore. Add a `platform` key including the resolved `mode`:

```json
"platform": {
  "mode": "native",
  "os": "android",
  "device": "emulator-5554",
  "app_id": "com.example.myapp",
  "app_version": "<from `adb shell dumpsys package <pkg> | grep versionName`>",
  "target_url": null
}
```

For WEB mode, set `"mode": "web"`, `app_id` to the browser bundle, and `target_url` to the
`base_url` (leave `app_version` null — it's the browser's, not the SUT's).

The `console_errors` counter from qa-explore becomes `app_log_errors` (app/browser-process
ERROR-level log matches — coarser than a real JS console, see Phase 3).

**Skip qa-explore's Step 6 (Playwright Test Agents bootstrap) entirely — not applicable when
the driver is mobile-cli/Maestro.**
