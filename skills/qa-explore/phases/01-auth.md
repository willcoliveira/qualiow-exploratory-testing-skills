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

`auth.credentials.username` and `auth.credentials.password` name env vars, resolved in the
order from `${CLAUDE_SKILL_DIR}/references/paths.md` (environment, `qa/.env`, then `.env`).
The username is not a secret and may be filled as a literal; it is often an email address,
which the redaction list still replaces in anything written to `output/`. The password is
**never read and never typed by you**: `qualiow auth fill` reads the variable named by
`auth.credentials.password`, fills the field through playwright-cli itself and prints the
result with the value redacted. Pass it the session id, not the `-s=` flag, and the target id:
it types only a variable the target declares as a login credential (`auth.credentials`,
`auth.token`, or `QA_USER`/`QA_PASS`/`QA_TOKEN`), so a page that asks for anything else gets
nothing.

```bash
playwright-cli open <login_url>
playwright-cli snapshot
playwright-cli fill <email_ref> "<username value>"
qualiow auth fill --session <sid> --ref <pass_ref> --env <the NAME from auth.credentials.password> --target <target id>
playwright-cli click <submit_ref>
playwright-cli state-save .auth/<target>.json
```

Exit 2 means the variable is not set: say which one and stop the credentials path — never
ask for the value in the conversation.

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
