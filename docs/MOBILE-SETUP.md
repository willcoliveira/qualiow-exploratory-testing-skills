# Mobile Setup — running `/qa-explore-mobile` on a fresh Mac

The mobile skill drives **real** simulator/emulator browsers and native apps via
`mobile-cli` (a Maestro / `xcrun simctl` / `adb` shim). Unlike the desktop web skill
(`/qa-explore`, which only needs `playwright-cli`), the mobile path depends on the iOS
and/or Android toolchains being installed on the machine. This guide gets a clean Mac to
the point where a session can start.

Paths below are written as `bin/…` (a git checkout or a plugin install). In a project you
ran `qualiow init` in, the same files are at `qa/bin/…`; a global npm install also puts
`mcli`, `wadb`, `wk-ios`, `qualiow-doctor-mobile` and `qualiow-setup-mobile` on your `PATH`.

## TL;DR

```bash
# 1. Install everything scriptable + create standard devices (idempotent, re-runnable)
bin/setup-mobile.sh                  # or --android / --ios; --yes for non-interactive

# 2. Confirm the machine is ready (read-only; installs nothing)
bin/doctor-mobile.sh                 # add --quiet to print only failures + the verdict

# 3. Run a mobile session (once doctor says READY)
/qa-explore-mobile --target my-mobile-target
```

`bin/setup-mobile.sh` automates everything it can and **prints clear MANUAL steps** for the
few things it can't (Xcode + the iOS runtime). It finishes by running the doctor.

## What gets installed / created

| Component | Needed for | Auto by `setup-mobile.sh`? |
|-----------|-----------|----------------------------|
| Homebrew | base | ✅ (offers to install; `curl \| bash`) |
| **Node ≥ 22.4** | runs `mobile-cli.mjs`, `wkeval.mjs` | ✅ |
| **Maestro** (pinned, default 2.10.0) | the driver (hierarchy/tap/input) | ✅ (`get.maestro.mobile.dev`, `curl \| bash`) |
| **JDK 17** | Maestro and the Android SDK tooling | ✅ `brew install openjdk@17` |
| Android cmdline-tools | `sdkmanager`/`avdmanager` | ✅ `brew install --cask android-commandlinetools` |
| platform-tools (`adb`), `emulator` | drive Android | ✅ `sdkmanager` |
| Google **Play** system image (API 35) | **Chrome must be present** | ✅ `sdkmanager` |
| SDK licenses | unblock installs | ✅ `sdkmanager --licenses` |
| Android AVD `qa_pixel_api35` | a device to boot | ✅ `avdmanager create avd` |
| **Xcode** + CLI tools | iOS simulators at all | ⚠️ **manual** (App Store, multi-GB) |
| iOS runtime | a simulator OS to run | ⚠️ **manual** if none installed (Xcode ▸ Settings ▸ Components) |
| iOS simulator device `qa-iphone` | a device to boot | ✅ `simctl create` (once Xcode + a runtime exist) |
| `ios-webkit-debug-proxy` + `python3` | the `bin/wk-ios` DOM bridge (iOS Safari) | ✅ `brew install ios-webkit-debug-proxy` (python3 warned if absent) |
| Safari / Chrome (the browsers) | web-mode SUT | ✅ preinstalled (Safari always; Chrome via the Play image) |

### Flags

```bash
bin/setup-mobile.sh                        # both platforms, interactive
bin/setup-mobile.sh --android              # scope to one platform
bin/setup-mobile.sh --ios
bin/setup-mobile.sh --yes                  # non-interactive: assume yes to prompts
bin/setup-mobile.sh --yes --allow-curl-bash  # ...and let the curl|bash installers run too
MAESTRO_VERSION=2.10.0 bin/setup-mobile.sh   # pin a specific Maestro release
```

The two `curl | bash` installers (Homebrew and Maestro) **always ask first**. Under `--yes`
they are *skipped* with the exact command printed, unless `--allow-curl-bash` is also given —
so an unattended run never pipes a remote script into a shell behind your back.

Other environment overrides: `ANDROID_API` (default 35), `ANDROID_AVD_NAME`, `IOS_DEVICE_NAME`,
`ANDROID_HOME`.

### The two genuinely manual iOS steps

Xcode can't be reliably scripted:

```bash
# After installing Xcode from the App Store:
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
sudo xcodebuild -license accept
# If no iOS runtime is installed:
xcodebuild -downloadPlatform iOS        # or Xcode ▸ Settings ▸ Components
```

Then re-run `bin/setup-mobile.sh` — it will create the `qa-iphone` device.

## The preflight

```bash
bin/doctor-mobile.sh            # check both platforms
bin/doctor-mobile.sh --ios      # iOS only
bin/doctor-mobile.sh --android  # Android only
bin/doctor-mobile.sh --quiet    # only failures + the final verdict
```

Read-only: it installs nothing and prints `✓`/`✗` with the exact fix command for each gap.
The mobile session's `00-setup` phase runs it first, so a fresh machine fails fast with
actionable guidance instead of a cryptic error deep in a session. Exit code 0 means every
REQUIRED check for the requested platform passed.

It checks macOS, Homebrew, **Node ≥ 22.4**, **Maestro ≥ 2.6.0** (`MAESTRO_MIN_VERSION` —
`mobile-cli` parses the JSON-only `maestro hierarchy` introduced in 2.6), then per platform:
JDK 17, the SDK root, `adb`, `emulator`, `sdkmanager`/`avdmanager` and an AVD for Android;
Xcode CLT + full Xcode, an iOS runtime and an iPhone simulator for iOS. `ios-webkit-debug-proxy`
and `python3` are reported as **warnings** — without them the `bin/wk-ios` DOM bridge is
unavailable, but a session can still run.

## Standard device names (referenced by the target configs)

- Android AVD: **`qa_pixel_api35`** (Google-Play API 35) — set `ANDROID_AVD_NAME` to override.
- iOS sim: **`qa-iphone`** — set `IOS_DEVICE_NAME` to override.

The `data/targets/_example-sim-*.yml` configs resolve the device **by name** (not a
hardcoded UDID) so they're portable across machines. `00-setup` boots the named device,
creating it if missing.

## Driving the device

```bash
bin/mcli boot qa_pixel_api35        # boots an AVD or an iOS sim by name, waits, set-devices it
bin/mcli set-device emulator-5554 --platform android   # adb serial, iOS UDID, or iOS sim NAME
bin/mcli set-app com.android.chrome                    # or com.apple.mobilesafari, or your app id
bin/mcli launch
bin/mcli open-url https://staging.m.example.com        # web mode (alias of deep-link)
bin/mcli snapshot                   # a11y tree as refs e1, e2, … — refs expire after 60 s
bin/mcli fill e4 my-username
bin/mcli snapshot                   # ALWAYS re-snapshot after the keyboard appears
bin/mcli click e7
bin/mcli info                       # resolved device/app + which state file is in use
bin/mcli --help                     # the full command surface
```

`set-device` resolves the platform by matching the id against `xcrun simctl list devices` and
`adb devices`; pass `--platform ios|android` when it cannot tell. `boot` handles the
`emulator -avd …` / `simctl boot && open -a Simulator` dance for you.

**State.** Device and app selection is stored in a small JSON file. `--state <file>` (or
`$MOBILE_CLI_STATE`) picks it explicitly; otherwise `set-device` chooses
`~/.mobile-cli/<device>.json`. Give each concurrent session its own state file:

```bash
bin/mcli --state /tmp/run-a.json set-device qa-iphone
bin/mcli --state /tmp/run-a.json set-app com.apple.mobilesafari
```

**Exit codes.** `0` ok · `1` command failed · `2` usage · `3` stale or unknown ref (re-run
`snapshot`) · `4` no device or app set. A stale ref is not a flake: the tree is renumbered on
every snapshot, so a ref older than `MCLI_REF_TTL_MS` (default 60 000) is rejected rather than
tapped at a coordinate that has since moved.

**Evidence.** `screenshot <path>` needs no app. `logs [--since <sec>] [--errors]` reads logcat
or `simctl log`; `logs-clear` empties the Android buffer. `record-start <path>.mp4` /
`record-stop` produce mp4 on both platforms (Android caps a single recording at 180 s).

## The helper wrappers

`bin/mcli`, `bin/wadb` and `bin/wk-ios` exist because Claude Code permission rules match on
the **first token** of a Bash command — a compound `export JAVA_HOME=…; node …` line can never
be pre-approved. Each wrapper resolves the environment internally and then execs the real tool.

### `bin/wadb` — raw adb, environment resolved

```bash
bin/wadb devices
bin/wadb logcat -d | tail -50
bin/wadb shell pm list packages | grep chrome
```

It uses the `adb` already on `PATH` when there is one, else the SDK copy under `ANDROID_HOME`
(default `~/Library/Android/sdk`).

### `bin/wk-ios` — real JS/DOM in iOS Simulator Safari

Maestro reads the native XCUITest accessibility tree, which collapses Safari's web content
into unlabeled nodes. The DOM itself is fully addressable through WebKit's Remote Inspector,
and `wk-ios` wires `ios-webkit-debug-proxy` up to the running Simulator so you can evaluate JS
in the frontmost page — the same power `playwright-cli eval` gives you on desktop, but on the
real iOS engine.

```bash
bin/wk-ios 'document.title'
bin/wk-ios 'document.querySelectorAll(".cart_item").length'
bin/wk-ios --url        # print the page WebSocket URL
bin/wk-ios --stop       # stop the proxy this script started (never anyone else's)
```

Requires `ios-webkit-debug-proxy`, `python3`, Node ≥ 22.4 (`wkeval.mjs` uses the global
`WebSocket`), and a booted Simulator with Safari on a page. `WK_IOS_PORT` (default 9221) sets
the iwdp device-list port; pages are served on `WK_IOS_PORT + 1`.

## Why a Google **Play** (or `google_apis`) Android image

A stock **AOSP** system image ships **no `com.android.chrome`** — only a basic AOSP
browser or none. Web-mode Android targets need Chrome, so `setup-mobile.sh` installs a
`google_apis_playstore` image. Verify on any AVD with:

```bash
bin/wadb shell pm list packages | grep chrome
```

## Auth reality (web targets)

There is **no transferable `storage_state`** for a real device browser (unlike Playwright).
SSO + MFA logins are done **once, interactively, by a human** in the sim/emulator browser;
the device persists the browser profile across launches. Never script MFA. Never
`relaunch-clean` a web target (it `pm clear`s the logged-in Chrome profile). See the
`notes:` blocks in `data/targets/_example-sim-*.yml`.

## Troubleshooting

- **`doctor-mobile.sh` says NOT READY** → fix each `✗` with the printed command, or run
  `setup-mobile.sh`, then re-run the doctor.
- **`JAVA_HOME` / `adb` not found mid-session** → `bin/mcli` resolves JDK 17 via
  `/usr/libexec/java_home -v 17` (falling back to the Homebrew `openjdk@17` prefixes) and
  defaults `ANDROID_HOME` to `~/Library/Android/sdk`. Export them explicitly if your SDK lives
  elsewhere.
- **Maestro too old** → `mobile-cli` needs the JSON-only `maestro hierarchy` of 2.6.0+.
  Reinstall pinned: `curl -Ls https://get.maestro.mobile.dev | MAESTRO_VERSION=2.10.0 bash`.
- **Every tap hits the wrong element** → your refs expired. Re-run `snapshot`; exit code 3
  means exactly this.
- **Intel Mac** → `setup-mobile.sh` selects `x86_64` system images automatically (`arm64`
  Macs get `arm64-v8a`).
- **Emulator slow/flaky to boot or Chrome absent** → fall back to the iOS Safari target;
  both engines are independent.

## Scope

This covers iOS Simulator + Android Emulator (browser **and** native modes) on macOS. It does
**not** provision physical devices, CI runners, Windows/Linux hosts, or the desktop web path
(`/qa-explore`, which only needs `playwright-cli`).
