# Phase 0: Setup

## Step 1: Resolve Inputs

Extract from the user message:
- **target**: id under `data/targets/` (must contain a `backend:` block) — or inline resource names
- **context**: path to a gathered ticket context file, or inline ticket text
- **flags**: `--static-only` (skip live probes), `--no-e2e` (skip phase 4)

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

Record the outcome. A blocked live lane changes verdicts, not effort — every AC that
needed a probe becomes `BLOCKED` with the exact command attached.

## Step 4: Create the Session Directory

`output/sessions/<YYYY-MM-DD-HHmm>-<ticket>-backend/` containing:
`charter.md`, `ac-matrix.md`, `evidence/`, `bugs/`, `session-log.md`

## Step 5: Write the Charter

```markdown
# Charter — <TICKET>
**Mission:** Verify <n> acceptance criteria for <ticket summary>
**Target:** <target id> (<environment kind>)
**Branch:** <branch> vs <base_branch>
**Lanes:** static: GO | live: GO/BLOCKED (<reason>) | e2e: GO/SKIPPED
**Out of scope:** <what the ticket defers to other tickets>
**Time box:** 45 min
```

Append to `session-log.md` after this and every later phase:
`[<ts>] [PHASE] setup complete — lanes: static GO, live BLOCKED (no creds for <account>)`
