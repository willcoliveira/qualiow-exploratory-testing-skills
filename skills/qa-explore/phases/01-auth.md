# Phase 1: Authentication (2 min)

Skip if `auth.strategy: none`. Every command below carries the session id `-s=<sid>` (omitted here).

## Storage State (fastest)

```bash
playwright-cli state-load .auth/<target>.json
playwright-cli goto <base_url>
```

If the state file is older than 24 hours, expect it to have expired and fall through to
credentials when the login page appears.

## Credentials (adaptive: uses snapshot to find form fields)

Resolve the values named by `auth.credentials.username` / `auth.credentials.password` in the
order from `${CLAUDE_SKILL_DIR}/references/paths.md` (`qa/.env`, then `.env`). Read the value,
pass it to the command, and never echo it into the log or the report.

```bash
playwright-cli open <login_url>
playwright-cli snapshot
playwright-cli fill <email_ref> "<username value>"
playwright-cli fill <pass_ref> "<password value>"
playwright-cli click <submit_ref>
playwright-cli state-save .auth/<target>.json
```

## Token (`auth.strategy: token`)

Inject the token named by `auth.token` where the app expects it, then reload:

```bash
playwright-cli open <base_url>
playwright-cli cookie-set <cookie-name> "<token value>" --domain=<host> --httpOnly --secure   # cookie-based
playwright-cli localstorage-set <key> "<token value>"                                       # localStorage-based
playwright-cli reload
```

## Verify Login

After authentication, `playwright-cli snapshot` and confirm user indicators are present
(username display, avatar, dashboard access).

If login fails:
1. Check the console: `playwright-cli console error`
2. Check the last requests: `playwright-cli requests --filter="login|auth|session"`
3. Verify the credentials are the ones the target names
4. Check for MFA. Never automate an MFA challenge; hand it to the user in a headed browser
   (`playwright-cli open <login_url> --headed`) and continue once they confirm
5. Log the failure and attempt an alternative strategy if the target defines one

**Update progress:** set the auth phase complete (or failed) in `progress.json`. Append to `session-log.md`:
`[<timestamp>] [PHASE] Auth complete — strategy: <strategy>, result: <success/failed>, user: <redacted>`
