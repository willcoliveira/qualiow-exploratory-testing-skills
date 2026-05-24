# Phase 1: Authentication

Skip if `auth.strategy: none`. Otherwise:

## Storage State (fastest)

```bash
playwright-cli state-load .auth/<target>.json
playwright-cli goto <base_url>
```

## Credentials (adaptive -- uses snapshot to find form fields)

Before filling credentials, resolve their values:
1. If `qa/.env` exists in CWD, read it — use the values for the env var names specified in `auth.credentials.username` / `auth.credentials.password` in the target config
2. Otherwise read from the skill root `.env`

```bash
playwright-cli open <login_url>
playwright-cli snapshot
playwright-cli fill <email_ref> "$QA_USER"
playwright-cli fill <pass_ref> "$QA_PASS"
playwright-cli click <submit_ref>
playwright-cli state-save .auth/<target>.json
```

## Verify Login

After authentication, verify login via `playwright-cli snapshot` -- confirm user indicators are present (e.g., username display, avatar, dashboard access).

If login fails:
1. Check console for errors: `playwright-cli console error`
2. Verify credentials are correct
3. Check for MFA requirements
4. Log the failure and attempt alternative auth strategy if available

**Update progress:** Set auth phase complete (or failed) in progress.json. Append to session-log.md:
`[<timestamp>] [PHASE] Auth complete — strategy: <strategy>, result: <success/failed>, user: <redacted>`
