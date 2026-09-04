# Phase 0: Setup

## Step 1: Resolve Inputs

Extract from the user message:
- **target**: id under `data/targets/` (with a `backend:` and/or `api:` block) — or inline
  resource names
- **context**: path to a gathered ticket context file, or inline ticket text
- **flags**: `--static-only` (skip live probes), `--api-only` (skip the cloud lane),
  `--no-e2e` (skip phase 4), `--parity <target-id>` (run the API matrix in a second
  environment too)

Read the target config. Read `data/domains/<domain>.md` for the domain's data-integrity
checks — they become extra checks beyond the ticket's own ACs.

## Step 2: Resolve the Source Branch

From `target.source`, confirm the repo and branch exist:

```bash
git -C <repo_path> rev-parse --verify <branch>
git -C <repo_path> diff --stat <base_branch>...<branch>
```

If the branch is not fetched, ask before running `git fetch` — it touches the user's repo.
Never check the branch out; read it with `git show <branch>:<path>` so the working tree
is untouched.

## Step 3: Establish AWS Access (skip if `--static-only`)

```bash
aws sts get-caller-identity --profile "$<aws_profile_env>"
```

Compare the returned account to `backend.account_id`.

| Result | Action |
|--------|--------|
| Matches | Live lane is GO |
| Different account | **STOP the live lane.** Report it. Do not probe an account the ticket does not concern. |
| No credentials | Live lane is **BLOCKED**, not failed. Continue with static + write the probe commands into the report so a human can run them. |
| Account looks like production | Read `references/safety-rules.md` and apply the production hard stop. |

## Step 3b: Establish the API Lane (skip if the ticket has no HTTP surface)

From `target.api`, confirm the endpoints under test, the `probe_allowlist` (read-only,
callable now) and the `write_allowlist` (state-changing, phase 4 only). How you get a
request context depends on `api.auth`:

### `session-cookie` — the service sits behind a UI

Open an authenticated session once — headed, against a persistent profile, because an
interactive identity provider cannot complete headless:

```bash
playwright-cli -s=<target-id> open <base_url> --headed --profile .auth/<profile>
```

Confirm the session is live before building any matrix — a probe run against a logged-out
page returns a login page with a `200`, which reads exactly like a passing case.

### `api-key-env` / `bearer-env` — the service has no UI

**Open no browser.** There is no session to inherit and no profile to persist. The request
context is an out-of-browser runner under `probes/` that reads the credential from the env
var named by `api.token_env` and sends it in `api.header_name` (default `X-Api-Key`), or as
`Authorization: Bearer` for `bearer-env`. The value is read from the environment at run
time and never written into a script, a report or this repo.

Prove the credential before the first probe, and record both calls in
`evidence/fingerprint.md`:

```bash
curl -s -o /dev/null -w '%{http_code}\n' "$BASE/<a read endpoint>"                    # expect 401/403
curl -s -o /dev/null -w '%{http_code}\n' -H "X-Api-Key: $KEY" "$BASE/<same endpoint>"  # expect 200
```

A service that answers the same either way is not authenticating, which is a finding
before it is a setup step. If the key is missing the lane is **BLOCKED**, not failed —
write the commands into the report and continue.

Charter line for this shape: `api: GO (out-of-browser, api-key)`.

If the target declares `api.parity_targets` or `--parity` was passed, prime that context
too. Same matrix, both environments, or the comparison is not one.

## Step 3c: Fingerprint the Environment

**Before the first probe of any lane.** Read
`references/environment-fingerprinting.md` and answer its three questions: which build is
deployed in every component of the path, whether the changed code path is *selected*
here, and whether the commit under test is genuinely an ancestor of what is running.

Write the answers to `evidence/fingerprint.md`. If the changed path is not reachable in
this environment, every AC that depends on it is `NOT-REACHABLE` — record that now, and
say which environment *would* answer the question.

Record the outcome. A blocked live lane changes verdicts, not effort — every AC that
needed a probe becomes `BLOCKED` with the exact command attached.

## Step 4: Create the Session Directory

`output/sessions/<YYYY-MM-DD-HHmm>-<ticket>-backend/` containing:
`charter.md`, `ac-matrix.md`, `evidence/`, `bugs/`, `probes/`, `session-log.md`

`probes/` holds the probe scripts and case files, so the run is repeatable by someone
else — and by you, against the next environment.

## Step 5: Write the Charter

```markdown
# Charter — <TICKET>
**Mission:** Verify <n> acceptance criteria for <ticket summary>
**Target:** <target id> (<environment kind>)
**Branch:** <branch> vs <base_branch>
**Lanes:** static: GO | live: GO/BLOCKED (<reason>) | api: GO/SKIPPED | e2e: GO/SKIPPED
**Build under test:** <component: build id / commit>, <component: build id / commit>
**Changed path selected here:** yes / no (<flag or config that decides it>)
**Out of scope:** <what the ticket defers to other tickets>
**Time box:** 45 min
```

Append to `session-log.md` after this and every later phase:
`[<ts>] [PHASE] setup complete — lanes: static GO, live BLOCKED (no creds for <account>)`
