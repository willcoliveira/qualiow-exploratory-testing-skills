# Mobile Setup — running `/qa-explore-mobile` on a fresh Mac

The mobile skill drives **real** simulator/emulator browsers and native apps via
`mobile-cli` (a Maestro / `xcrun simctl` / `adb` shim). Unlike the desktop web skill
(`/qa-explore`, which only needs `playwright-cli`), the mobile path depends on the iOS
and/or Android toolchains being installed on the machine. This guide gets a clean Mac to
the point where a session can start.

## TL;DR

```bash
# 1. Install everything scriptable + create standard devices (idempotent, re-runnable)
scripts/setup-mobile.sh            # or --android / --ios, add --yes for non-interactive

# 2. Confirm the machine is ready (read-only; installs nothing)
scripts/doctor-mobile.sh

# 3. Run a mobile session (once doctor says READY)
#    e.g. iOS Safari against your mobile web app:
#    drive via bin/mcli — see the target config notes in data/targets/_example-sim-*.yml
```

`scripts/setup-mobile.sh` automates everything it can and **prints clear MANUAL steps**
for the few things it can't (Xcode + the iOS runtime). It finishes by running the doctor.

## What gets installed / created

| Component | Needed for | Auto by `setup-mobile.sh`? |
|-----------|-----------|----------------------------|
| Homebrew | base | ✅ (offers to install) |
| Node ≥ 18 | runs `mobile-cli.mjs` | ✅ |
| **Maestro** | the driver (hierarchy/tap/input) | ✅ (`get.maestro.mobile.dev`) |
| **JDK 17** | Android SDK tooling | ✅ `brew install openjdk@17` |
| Android cmdline-tools | `sdkmanager`/`avdmanager` | ✅ `brew install --cask android-commandline-tools` |
| platform-tools (`adb`), `emulator` | drive Android | ✅ `sdkmanager` |
| Google **Play** system image (API 35) | **Chrome must be present** | ✅ `sdkmanager` |
| SDK licenses | unblock installs | ✅ `sdkmanager --licenses` |
| Android AVD `qa_pixel_api35` | a device to boot | ✅ `avdmanager create avd` |
| **Xcode** + CLI tools | iOS simulators at all | ⚠️ **manual** (App Store, multi-GB) |
| iOS runtime | a simulator OS to run | ⚠️ **manual** if none installed (Xcode ▸ Settings ▸ Components) |
| iOS simulator device `qa-iphone` | a device to boot | ✅ `simctl create` (once Xcode + a runtime exist) |
| Safari / Chrome (the browsers) | web-mode SUT | ✅ preinstalled (Safari always; Chrome via the Play image) |

### The two genuinely manual iOS steps
Xcode can't be reliably scripted:
```bash
# After installing Xcode from the App Store:
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
sudo xcodebuild -license accept
# If no iOS runtime is installed:
xcodebuild -downloadPlatform iOS        # or Xcode ▸ Settings ▸ Components
```
Then re-run `scripts/setup-mobile.sh` — it will create the `qa-iphone` device.

## Standard device names (referenced by the target configs)
- Android AVD: **`qa_pixel_api35`** (Google-Play API 35) — set `ANDROID_AVD_NAME` to override.
- iOS sim: **`qa-iphone`** — set `IOS_DEVICE_NAME` to override.

The `data/targets/_example-sim-*.yml` configs resolve the device **by name** (not a
hardcoded UDID) so they're portable across machines. `00-setup` boots the named device,
creating it if missing.

## Why a Google **Play** (or `google_apis`) Android image
A stock **AOSP** system image ships **no `com.android.chrome`** — only a basic AOSP
browser or none. Web-mode Android targets need Chrome, so `setup-mobile.sh` installs a
`google_apis_playstore` image. Verify on any AVD with:
```bash
adb shell pm list packages | grep chrome
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
  `/usr/libexec/java_home -v 17` and defaults `ANDROID_HOME` to `~/Library/Android/sdk`.
  Export them explicitly if your SDK lives elsewhere.
- **Intel Mac** → `setup-mobile.sh` selects `x86_64` system images automatically (`arm64`
  Macs get `arm64-v8a`).
- **Emulator slow/flaky to boot or Chrome absent** → fall back to the iOS Safari target;
  both engines are independent.

## Scope
This covers iOS Simulator + Android Emulator (browser **and** native modes). It does **not**
provision physical devices, CI runners, or the desktop web path (`/qa-explore`, which only
needs `playwright-cli`).
