# Phase 1: Authentication (mode-aware)

In both modes there is **NO transferable `storage_state` you can inject** — auth happens on
the device. Pick the branch by the target's `auth.strategy`:

- `auth.strategy: in-app` → **NATIVE branch** (account creation / login inside the app).
- `auth.strategy: interactive-sso` (or any interactive web SSO) → **WEB branch** (one-time
  human login the browser profile persists).
- `auth.strategy: none` → skip this phase.

Set up once per Bash block:

```bash
export MOBILE_CLI_STATE=/tmp/<target>-state.json
MCLI="$PWD/bin/mcli"   # run from the repo root
```

---

## NATIVE branch — in-app login / signup

Drive the app's own auth screens via the snapshot→click→fill loop, following the steps the
target's `auth.strategy` describes. There is no shared session, so you authenticate inside
the app each run (or reuse an existing account already on the device).

### Account creation (when the charter targets signup, or as one-time setup)

```bash
# Optional cold start (Android): relaunch-clean wipes app data, then cold-starts.
$MCLI relaunch-clean

$MCLI snapshot                                  # welcome / landing
$MCLI click <create-account / sign-up ref>
$MCLI snapshot                                  # email / details screen
$MCLI fill <email input ref> "<config test_email_pattern, e.g. qa+$(date +%s)@example.com>"
$MCLI click <continue ref>
$MCLI snapshot                                  # OTP / verification screen
```

**OTP on staging:** if the target config records a fixed code (`auth.static_otp`), use it
instead of waiting for a real OTP. Multi-cell OTP inputs often **do not accept a single
`fill`** — tap each cell and send one digit at a time:

```bash
$MCLI snapshot                                  # find the per-cell OTP refs
for d in <digits of static_otp>; do
  $MCLI click <next-cell-ref>
  $MCLI fill <that-ref> "$d"
done
```

### Existing-user login (faster for post-auth flows)

```bash
$MCLI launch                                    # do NOT relaunch-clean — preserves the existing account
$MCLI snapshot                                  # if on landing, tap Log In
$MCLI click <login ref>
$MCLI fill <email/username input ref> "<existing test account>"
$MCLI click <continue ref>
# OTP same as above (static_otp on staging)
```

Generalize email/validation rules from the target config or prior findings (e.g. some backends
reject disposable-email domains, or client vs server validation diverges) — do not assume any
specific provider's quirks.

---

## WEB branch — one-time interactive SSO/MFA login

The browser keeps its own profile (cookies/session) on the device, persisted across `launch`
/ `open-url`. Do the login **once per device per session-lifetime; a HUMAN performs the MFA
step — never script it.** This applies to any interactive IdP (Microsoft Entra, Okta,
Google Workspace, Auth0, …) — see the web target templates (`_example-sim-ios-safari.yml`,
`_example-sim-android-chrome.yml`).

```bash
$MCLI launch                                    # do NOT relaunch-clean — that wipes the profile
$MCLI open-url <web.start_url e.g. .../auth/login>
$MCLI snapshot                                  # login surface / SSO button
$MCLI click <sign-in / SSO button ref>
# → hands off to the identity provider (e.g. login.microsoftonline.com, your Okta org, …).
# A HUMAN completes username + password + MFA by hand in the sim/emulator UI.
```

Once login completes, subsequent `launch` / `open-url` / exploration reuse the session until
it expires or the profile is wiped. **Never automate the MFA challenge.** If the IdP domain
reappears mid-session, the session lapsed — hand back to a human; do not fill credentials.

### Returning session (already logged in)

```bash
$MCLI launch
$MCLI open-url <web.base_url>
$MCLI snapshot                                  # expect an authenticated landing view, not login
```

If you see the login screen or IdP domain, re-do the interactive login above.

### Profile hygiene (WEB) — what NOT to do

- **Do not run `relaunch-clean`** on a browser target — on Android it `pm clear`s the browser and forces a fresh SSO+MFA login.
- **Do not** inject cookies / storage_state — no supported path on a real sim browser.
- Boot, don't erase, the device — erasing the sim wipes the profile.

---

## Verify Auth (shared)

After auth, `$MCLI snapshot` and confirm authenticated indicators are present:
- NATIVE: the app's post-login home/landing controls.
- WEB: a known post-login heading, nav, or the user's name.

If stuck on a login/IdP screen, capture the log:

```bash
$MCLI logs --errors --since 60
```

**Auth issues to flag as bugs (not session blockers):**
- OTP rejected even with the documented static/staging code (NATIVE).
- A valid session dropped far sooner than expected (forced re-login mid-flow).
- A broken/blank state instead of redirecting to login when the session expires.
- Login surface renders but inputs / SSO button are unreachable in the a11y tree (blocks automation AND assistive tech).
- Client-side input validation (email format, required fields) diverges from server-side behavior.

**Update progress:** mark auth phase complete with `branch: native|web`, `user: <redacted>`.
