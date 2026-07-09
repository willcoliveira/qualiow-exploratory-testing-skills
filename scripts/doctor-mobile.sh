#!/usr/bin/env bash
# doctor-mobile.sh — read-only preflight for the qa-explore-mobile skill.
#
# Verifies that everything mobile-cli needs to drive iOS Simulator Safari/native and
# Android Emulator Chrome/native is present on THIS machine. Installs NOTHING — it only
# reports ✓/✗ with the exact fix command for each gap. The mobile session's 00-setup
# phase runs this first so a fresh machine fails fast with actionable guidance instead of
# a cryptic error deep in a session.
#
# Usage:
#   scripts/doctor-mobile.sh            # check both platforms
#   scripts/doctor-mobile.sh --ios      # iOS only
#   scripts/doctor-mobile.sh --android  # Android only
#   scripts/doctor-mobile.sh --quiet    # only print failures + final verdict
#
# Exit code: 0 if all REQUIRED checks for the requested platform(s) pass, 1 otherwise.

set -uo pipefail

PLATFORM="both"
QUIET=0
for arg in "$@"; do
  case "$arg" in
    --ios) PLATFORM="ios" ;;
    --android) PLATFORM="android" ;;
    --quiet) QUIET=1 ;;
    -h|--help) sed -n '2,18p' "$0"; exit 0 ;;
    *) echo "unknown arg: $arg" >&2; exit 2 ;;
  esac
done

# ---- resolution helpers (mirror what bin/mcli does, with fallbacks) ----
ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
JAVA_HOME_RESOLVED="${JAVA_HOME:-}"
if [ -z "$JAVA_HOME_RESOLVED" ] && [ -x /usr/libexec/java_home ]; then
  JAVA_HOME_RESOLVED="$(/usr/libexec/java_home -v 17 2>/dev/null || true)"
fi
[ -z "$JAVA_HOME_RESOLVED" ] && [ -d /opt/homebrew/opt/openjdk@17 ] && JAVA_HOME_RESOLVED=/opt/homebrew/opt/openjdk@17
[ -z "$JAVA_HOME_RESOLVED" ] && [ -d /usr/local/opt/openjdk@17 ] && JAVA_HOME_RESOLVED=/usr/local/opt/openjdk@17
MAESTRO_BIN="$HOME/.maestro/bin/maestro"

PASS=0; FAIL=0; WARN=0
ok()   { PASS=$((PASS+1)); [ "$QUIET" = 1 ] || printf '  \033[32m✓\033[0m %s\n' "$1"; }
bad()  { FAIL=$((FAIL+1)); printf '  \033[31m✗\033[0m %s\n     ↳ fix: %s\n' "$1" "$2"; }
warn() { WARN=$((WARN+1)); [ "$QUIET" = 1 ] || printf '  \033[33m!\033[0m %s\n     ↳ %s\n' "$1" "$2"; }
hdr()  { [ "$QUIET" = 1 ] || printf '\n\033[1m%s\033[0m\n' "$1"; }

# ============================ COMMON ============================
hdr "Common"
if [ "$(uname -s)" = "Darwin" ]; then ok "macOS ($(sw_vers -productVersion 2>/dev/null))"; else
  bad "not macOS — iOS sims need macOS; Android may work on Linux but is unverified here" "use a Mac"; fi

if command -v brew >/dev/null 2>&1; then ok "Homebrew ($(brew --version 2>/dev/null | head -1))"; else
  bad "Homebrew not found" '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'; fi

if command -v node >/dev/null 2>&1; then
  NV="$(node -v | sed 's/^v//')"; NMAJ="${NV%%.*}"
  if [ "${NMAJ:-0}" -ge 18 ]; then ok "Node $NV (>=18)"; else bad "Node $NV is < 18" "brew install node  (or nvm install --lts)"; fi
else bad "Node not found" "brew install node"; fi

if [ -x "$MAESTRO_BIN" ] || command -v maestro >/dev/null 2>&1; then
  ok "Maestro present ($MAESTRO_BIN)"
else bad "Maestro not found" 'curl -Ls "https://get.maestro.mobile.dev" | bash'; fi

# ============================ ANDROID ============================
if [ "$PLATFORM" = "both" ] || [ "$PLATFORM" = "android" ]; then
  hdr "Android"
  # JDK 17
  if [ -n "$JAVA_HOME_RESOLVED" ] && [ -x "$JAVA_HOME_RESOLVED/bin/java" ]; then
    JV="$("$JAVA_HOME_RESOLVED/bin/java" -version 2>&1 | head -1)"
    case "$JV" in *\"17.*) ok "JDK 17 ($JAVA_HOME_RESOLVED)";; *) warn "Java found but not 17: $JV" "Android SDK tools expect JDK 17 — brew install openjdk@17";; esac
  else bad "JDK 17 not found" "brew install openjdk@17"; fi

  # SDK root
  if [ -d "$ANDROID_HOME" ]; then ok "Android SDK root ($ANDROID_HOME)"; else
    bad "Android SDK not found at $ANDROID_HOME" "scripts/setup-mobile.sh  (installs cmdline-tools + SDK)"; fi

  # adb / emulator / sdkmanager / avdmanager
  for tuple in \
    "platform-tools/adb:adb:sdkmanager 'platform-tools'" \
    "emulator/emulator:emulator:sdkmanager 'emulator'" ; do
    rel="${tuple%%:*}"; rest="${tuple#*:}"; label="${rest%%:*}"; fix="${rest#*:}"
    if [ -x "$ANDROID_HOME/$rel" ]; then ok "$label ($ANDROID_HOME/$rel)"; else bad "$label missing" "$fix"; fi
  done
  SDKMGR="$(ls "$ANDROID_HOME"/cmdline-tools/*/bin/sdkmanager 2>/dev/null | head -1)"
  AVDMGR="$(ls "$ANDROID_HOME"/cmdline-tools/*/bin/avdmanager 2>/dev/null | head -1)"
  if [ -n "$SDKMGR" ]; then ok "sdkmanager present"; else bad "sdkmanager (cmdline-tools) missing" "brew install --cask android-commandlinetools  (or Android Studio)"; fi
  [ -n "$AVDMGR" ] && ok "avdmanager present"

  # AVD existing? (Chrome needs a Google Play system image)
  if [ -x "$ANDROID_HOME/emulator/emulator" ]; then
    AVDS="$("$ANDROID_HOME/emulator/emulator" -list-avds 2>/dev/null)"
    if [ -n "$AVDS" ]; then ok "AVD(s) available: $(echo "$AVDS" | tr '\n' ' ')"; else
      bad "no Android AVD created" "scripts/setup-mobile.sh  (creates a Google-Play API-35 AVD)"; fi
  fi
  warn "Chrome-on-Android needs a Google **Play** (or google_apis) system image" "AOSP images have no com.android.chrome — verify with: adb shell pm list packages | grep chrome"
fi

# ============================ iOS ============================
if [ "$PLATFORM" = "both" ] || [ "$PLATFORM" = "ios" ]; then
  hdr "iOS"
  # Command Line Tools are the floor (xcode-select/xcrun exist at all); full Xcode is
  # still required on top of them for simulators.
  if xcode-select -p >/dev/null 2>&1; then
    ok "Xcode Command Line Tools path set ($(xcode-select -p))"
  else
    bad "Xcode Command Line Tools not installed" "xcode-select --install"
  fi
  if ! command -v xcrun >/dev/null 2>&1; then
    bad "xcrun not found (no Xcode command line tools)" "xcode-select --install"
  else
    XPATH="$(xcode-select -p 2>/dev/null)"
    case "$XPATH" in
      *Xcode*.app*|*/Xcode/*) ok "Full Xcode selected ($XPATH)";;
      *) bad "only Command Line Tools selected ($XPATH) — full Xcode is required for simulators" "install Xcode from the App Store, then: sudo xcode-select -s /Applications/Xcode.app && sudo xcodebuild -license accept";;
    esac
    if xcodebuild -version >/dev/null 2>&1; then ok "xcodebuild ($(xcodebuild -version 2>/dev/null | head -1))"; else
      warn "xcodebuild not runnable (license not accepted?)" "sudo xcodebuild -license accept"; fi
    RT="$(xcrun simctl list runtimes 2>/dev/null | grep -i 'iOS' | head -1)"
    if [ -n "$RT" ]; then ok "iOS runtime: $(echo "$RT" | sed 's/ (.*//')"; else
      bad "no iOS simulator runtime installed" "Xcode ▸ Settings ▸ Components ▸ install an iOS runtime (or: xcodebuild -downloadPlatform iOS)"; fi
    # A usable simulator device
    DEV="$(xcrun simctl list devices available 2>/dev/null | grep -iE 'iPhone' | head -1 | sed 's/^[[:space:]]*//')"
    if [ -n "$DEV" ]; then ok "iPhone simulator available: ${DEV%% (*}"; else
      bad "no available iPhone simulator device" "scripts/setup-mobile.sh  (creates one), or: xcrun simctl create qa-iphone com.apple.CoreSimulator.SimDeviceType.iPhone-16 <runtime>"; fi
    # Safari is always preinstalled on iOS sims — no check needed.
    # WebKit DOM bridge (bin/wk-ios): restores JS eval / DOM assertions in sim Safari.
    if command -v ios_webkit_debug_proxy >/dev/null 2>&1; then
      ok "ios-webkit-debug-proxy present (bin/wk-ios DOM bridge)"
    else
      warn "ios-webkit-debug-proxy missing — bin/wk-ios (Safari JS/DOM eval) unavailable" "brew install ios-webkit-debug-proxy"
    fi
  fi
fi

# ============================ VERDICT ============================
printf '\n\033[1mSummary:\033[0m %d ok, %d warning(s), %d failure(s)\n' "$PASS" "$WARN" "$FAIL"
if [ "$FAIL" -gt 0 ]; then
  printf '\033[31mNOT READY\033[0m — resolve the ✗ items above (or run: scripts/setup-mobile.sh) then re-run this doctor.\n'
  exit 1
fi
printf '\033[32mREADY\033[0m — mobile-cli can drive the requested platform(s).\n'
exit 0
