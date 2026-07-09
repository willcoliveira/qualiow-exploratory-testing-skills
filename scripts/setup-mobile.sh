#!/usr/bin/env bash
# setup-mobile.sh — idempotent bootstrap for the qa-explore-mobile skill on a fresh Mac.
#
# Installs everything mobile-cli needs that CAN be scripted, and creates standard-named
# devices the target configs expect. Re-runnable: every step checks before acting.
#
# What it can do automatically:
#   - Homebrew (offers to install if missing), Node, JDK 17, Maestro
#   - Android: cmdline-tools, platform-tools, emulator, a Google-Play system image,
#     license acceptance, and a standard AVD ($ANDROID_AVD_NAME, default qa_pixel_api35)
#   - iOS: a standard simulator device ($IOS_DEVICE_NAME, default qa-iphone) from an
#     installed iOS runtime
#
# What stays MANUAL (printed as guidance, never silently skipped):
#   - Xcode itself (multi-GB App Store install) + `xcodebuild -license accept`
#   - iOS runtime download (Xcode ▸ Settings ▸ Components) if none is installed
#
# Usage:
#   scripts/setup-mobile.sh                 # both platforms
#   scripts/setup-mobile.sh --android       # Android only
#   scripts/setup-mobile.sh --ios           # iOS only
#   scripts/setup-mobile.sh --yes           # non-interactive (assume yes to prompts)
#
# After it finishes it runs doctor-mobile.sh to confirm the result.

set -uo pipefail

PLATFORM="both"; ASSUME_YES=0
for arg in "$@"; do
  case "$arg" in
    --android) PLATFORM="android" ;;
    --ios) PLATFORM="ios" ;;
    --yes|-y) ASSUME_YES=1 ;;
    -h|--help) sed -n '2,28p' "$0"; exit 0 ;;
    *) echo "unknown arg: $arg" >&2; exit 2 ;;
  esac
done

HERE="$(cd "$(dirname "$0")" && pwd)"
ARCH="$(uname -m)"   # arm64 | x86_64
ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
ANDROID_AVD_NAME="${ANDROID_AVD_NAME:-qa_pixel_api35}"
ANDROID_API="${ANDROID_API:-35}"
IOS_DEVICE_NAME="${IOS_DEVICE_NAME:-qa-iphone}"
if [ "$ARCH" = "arm64" ]; then ABI="arm64-v8a"; else ABI="x86_64"; fi
SYS_IMAGE="system-images;android-${ANDROID_API};google_apis_playstore;${ABI}"

say()  { printf '\n\033[1m▸ %s\033[0m\n' "$1"; }
info() { printf '  %s\n' "$1"; }
skip() { printf '  \033[32m✓ already present:\033[0m %s\n' "$1"; }
manual(){ printf '  \033[33m⚠ MANUAL STEP:\033[0m %s\n' "$1"; }
confirm() {
  [ "$ASSUME_YES" = 1 ] && return 0
  printf '  %s [y/N] ' "$1"; read -r ans </dev/tty 2>/dev/null || ans=n
  case "$ans" in y|Y|yes) return 0;; *) return 1;; esac
}

# ----------------------------------------------------------------- Homebrew
say "Homebrew"
if command -v brew >/dev/null 2>&1; then skip "brew $(brew --version | head -1)"; else
  if confirm "Homebrew not found. Install it now?"; then
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  else manual "Install Homebrew, then re-run: https://brew.sh"; fi
fi
BREW="$(command -v brew || true)"
[ -z "$BREW" ] && [ -x /opt/homebrew/bin/brew ] && BREW=/opt/homebrew/bin/brew
[ -z "$BREW" ] && [ -x /usr/local/bin/brew ] && BREW=/usr/local/bin/brew

# ----------------------------------------------------------------- Node
say "Node.js (>=18)"
if command -v node >/dev/null 2>&1 && [ "$(node -v | sed 's/v//;s/\..*//')" -ge 18 ]; then
  skip "node $(node -v)"
elif [ -n "$BREW" ]; then info "installing node..."; "$BREW" install node || manual "brew install node failed — install Node >=18 manually"; fi

# ----------------------------------------------------------------- Maestro
say "Maestro"
if [ -x "$HOME/.maestro/bin/maestro" ] || command -v maestro >/dev/null 2>&1; then
  skip "maestro present"
else
  if confirm "Install Maestro now?"; then curl -Ls "https://get.maestro.mobile.dev" | bash || manual 'curl -Ls "https://get.maestro.mobile.dev" | bash'; fi
fi

# ============================================================ ANDROID
if [ "$PLATFORM" = "both" ] || [ "$PLATFORM" = "android" ]; then
  say "Android — JDK 17"
  if /usr/libexec/java_home -v 17 >/dev/null 2>&1; then skip "JDK 17 ($(/usr/libexec/java_home -v 17))"; else
    if [ -n "$BREW" ]; then info "installing openjdk@17..."; "$BREW" install openjdk@17 || manual "brew install openjdk@17"; fi
  fi
  JAVA_HOME_17="$(/usr/libexec/java_home -v 17 2>/dev/null || echo /opt/homebrew/opt/openjdk@17)"
  export JAVA_HOME="$JAVA_HOME_17"

  say "Android — SDK command-line tools"
  if ls "$ANDROID_HOME"/cmdline-tools/*/bin/sdkmanager >/dev/null 2>&1; then skip "cmdline-tools present"; else
    if [ -n "$BREW" ] && confirm "Install android-commandlinetools via Homebrew?"; then
      "$BREW" install --cask android-commandlinetools || manual "install Android Studio or cmdline-tools manually"
    else manual "Install Android cmdline-tools (Android Studio ▸ SDK Manager, or brew install --cask android-commandlinetools)"; fi
  fi
  SDKMGR="$(ls "$ANDROID_HOME"/cmdline-tools/*/bin/sdkmanager 2>/dev/null | head -1)"
  # Homebrew installs the cask under its own prefix (share/android-commandlinetools,
  # older cask versions used share/android-commandline-tools) and links the binaries
  # into $(brew --prefix)/bin — fall back through those locations. ANDROID_HOME stays
  # at its default: packages are installed there via --sdk_root, matching what
  # bin/mcli, bin/wadb and doctor-mobile.sh expect.
  if [ -z "$SDKMGR" ]; then
    for CASK_SHARE in /opt/homebrew/share/android-commandlinetools /opt/homebrew/share/android-commandline-tools /usr/local/share/android-commandlinetools /usr/local/share/android-commandline-tools; do
      CAND="$(ls "$CASK_SHARE"/cmdline-tools/*/bin/sdkmanager 2>/dev/null | head -1)"
      if [ -n "$CAND" ]; then SDKMGR="$CAND"; break; fi
    done
  fi
  [ -z "$SDKMGR" ] && command -v sdkmanager >/dev/null 2>&1 && SDKMGR="$(command -v sdkmanager)"
  AVDMGR="$(dirname "${SDKMGR:-/x}")/avdmanager"
  [ ! -x "$AVDMGR" ] && command -v avdmanager >/dev/null 2>&1 && AVDMGR="$(command -v avdmanager)"

  if [ -n "$SDKMGR" ] && [ -x "$SDKMGR" ]; then
    say "Android — SDK packages + licenses (into $ANDROID_HOME)"
    export ANDROID_SDK_ROOT="$ANDROID_HOME"
    mkdir -p "$ANDROID_HOME"
    # yes exits via SIGPIPE when sdkmanager closes stdin — under `set -o pipefail`
    # that marks the pipeline failed even though sdkmanager succeeded, so run the
    # licenses pipe with pipefail off, and the installs with no pipe at all
    # (licenses are already accepted; </dev/null prevents any interactive hang).
    info "accepting licenses..."; ( set +o pipefail; yes 2>/dev/null | "$SDKMGR" --sdk_root="$ANDROID_HOME" --licenses >/dev/null 2>&1 ) || true
    # cmdline-tools;latest goes FIRST: it puts sdkmanager/avdmanager INSIDE the SDK
    # root. avdmanager resolves the SDK from its own install location, so the copy
    # under the brew cask prefix cannot see packages installed into $ANDROID_HOME
    # ("Package path is not valid ... null") — the in-SDK copy can.
    for pkg in "cmdline-tools;latest" "platform-tools" "emulator" "platforms;android-${ANDROID_API}" "$SYS_IMAGE"; do
      info "ensuring: $pkg"; "$SDKMGR" --sdk_root="$ANDROID_HOME" "$pkg" >/dev/null 2>&1 </dev/null || manual "sdkmanager --sdk_root=\"$ANDROID_HOME\" \"$pkg\" failed — install via Android Studio SDK Manager"
    done
    # Prefer the in-SDK binaries from here on (see comment above).
    IN_SDK_SDKMGR="$(ls "$ANDROID_HOME"/cmdline-tools/*/bin/sdkmanager 2>/dev/null | head -1)"
    [ -n "$IN_SDK_SDKMGR" ] && SDKMGR="$IN_SDK_SDKMGR" && AVDMGR="$(dirname "$SDKMGR")/avdmanager"

    say "Android — standard AVD ($ANDROID_AVD_NAME)"
    if "$ANDROID_HOME/emulator/emulator" -list-avds 2>/dev/null | grep -qx "$ANDROID_AVD_NAME"; then
      skip "AVD $ANDROID_AVD_NAME"
    elif [ -x "$AVDMGR" ]; then
      info "creating AVD $ANDROID_AVD_NAME from $SYS_IMAGE..."
      echo "no" | "$AVDMGR" create avd -n "$ANDROID_AVD_NAME" -k "$SYS_IMAGE" -d "pixel_7" \
        && info "created $ANDROID_AVD_NAME" \
        || manual "avdmanager create avd -n $ANDROID_AVD_NAME -k \"$SYS_IMAGE\" -d pixel_7"
    else manual "avdmanager not found — create an AVD in Android Studio using a Google Play API-$ANDROID_API image"; fi
  fi
fi

# ============================================================ iOS
if [ "$PLATFORM" = "both" ] || [ "$PLATFORM" = "ios" ]; then
  say "iOS — Xcode Command Line Tools"
  if xcode-select -p >/dev/null 2>&1; then
    skip "CLT/Xcode path selected ($(xcode-select -p))"
  else
    if confirm "Xcode Command Line Tools not found. Trigger the install now? (opens a GUI dialog)"; then
      xcode-select --install 2>/dev/null || true
      manual "Complete the Command Line Tools install dialog, then re-run this script."
    else
      manual "xcode-select --install"
    fi
  fi

  say "iOS — WebKit DOM bridge (ios-webkit-debug-proxy for bin/wk-ios)"
  if command -v ios_webkit_debug_proxy >/dev/null 2>&1; then
    skip "ios-webkit-debug-proxy present"
  elif [ -n "$BREW" ]; then
    info "installing ios-webkit-debug-proxy..."
    "$BREW" install ios-webkit-debug-proxy || manual "brew install ios-webkit-debug-proxy  (enables bin/wk-ios JS/DOM eval in sim Safari)"
  else
    manual "brew install ios-webkit-debug-proxy  (enables bin/wk-ios JS/DOM eval in sim Safari)"
  fi

  say "iOS — Xcode"
  XPATH="$(xcode-select -p 2>/dev/null || true)"
  case "$XPATH" in
    *Xcode*.app*|*/Xcode/*) skip "full Xcode ($XPATH)";;
    *) manual "Install Xcode from the App Store (multi-GB), then run:"
       manual "  sudo xcode-select -s /Applications/Xcode.app/Contents/Developer"
       manual "  sudo xcodebuild -license accept" ;;
  esac

  if command -v xcrun >/dev/null 2>&1 && xcodebuild -version >/dev/null 2>&1; then
    say "iOS — runtime + simulator device ($IOS_DEVICE_NAME)"
    RUNTIME_ID="$(xcrun simctl list runtimes 2>/dev/null | grep -i 'iOS' | grep -oE 'com\.apple\.CoreSimulator\.SimRuntime\.iOS[^ ]*' | head -1)"
    if [ -z "$RUNTIME_ID" ]; then
      manual "No iOS runtime installed. Install one via Xcode ▸ Settings ▸ Components (or: xcodebuild -downloadPlatform iOS), then re-run."
    else
      if xcrun simctl list devices 2>/dev/null | grep -q "$IOS_DEVICE_NAME"; then
        skip "simulator device $IOS_DEVICE_NAME"
      else
        # devicetypes are listed NEWEST FIRST, and modern ids have non-numeric
        # suffixes (iPhone-17-Pro, iPhone-Air, iPhone-16e) — take the first match.
        DTYPE="$(xcrun simctl list devicetypes 2>/dev/null | grep -oE 'com\.apple\.CoreSimulator\.SimDeviceType\.iPhone-[0-9A-Za-z-]+' | head -1)"
        [ -z "$DTYPE" ] && DTYPE="com.apple.CoreSimulator.SimDeviceType.iPhone-16"
        info "creating simulator $IOS_DEVICE_NAME ($DTYPE)..."
        xcrun simctl create "$IOS_DEVICE_NAME" "$DTYPE" "$RUNTIME_ID" >/dev/null 2>&1 \
          && info "created $IOS_DEVICE_NAME" \
          || manual "xcrun simctl create $IOS_DEVICE_NAME $DTYPE $RUNTIME_ID"
      fi
    fi
  else
    manual "Xcode not runnable yet — finish the Xcode steps above, then re-run scripts/setup-mobile.sh"
  fi
fi

# ----------------------------------------------------------------- verify
say "Verifying with doctor-mobile.sh"
DOCTOR_ARGS=""; [ "$PLATFORM" = "ios" ] && DOCTOR_ARGS="--ios"; [ "$PLATFORM" = "android" ] && DOCTOR_ARGS="--android"
bash "$HERE/doctor-mobile.sh" $DOCTOR_ARGS || {
  echo
  echo "Some checks still fail — resolve the MANUAL steps above (Xcode / iOS runtime are the usual ones) and re-run."
  exit 1
}
echo
echo "Done. Standard devices: Android AVD '$ANDROID_AVD_NAME', iOS sim '$IOS_DEVICE_NAME'."
echo "Target configs (data/targets/_example-sim-*.yml) reference these names."
