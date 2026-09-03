# Backend & Infrastructure AC Verification

A guide to `/qa-verify-backend` — the lane for tickets whose acceptance criteria cannot be
seen in a browser.

## Why this exists

`/qa-explore` drives a browser. A backend ticket — a stream, a table, an IAM policy, a queue
consumer, a webhook — has most of its acceptance criteria below the UI, where a browser cannot
reach. Those ACs get waved through on "it works in the dev env", and the gaps surface months
later during an incident.

The failure mode this skill is built against is subtler than a missed bug: it is a confident
`PASS` backed by a code reading, which looks exactly like a `PASS` backed by a measurement and
is worth far less. Refusing to fake that is what makes the other verdicts credible.

## The workflow

### 1. Analyse the ticket → `output/context/<TICKET>-context.md`

Run `/qa-gather` on the ticket, or write the context file by hand. The job is to turn prose
ACs into falsifiable claims **before** reading the implementation — doing it in that order is
what stops you rationalising whatever the code happens to do.

Flag **DoR gaps** while you are here: ACs with no observable falsifier, missing criteria for
behaviour the change clearly has, internal contradictions. Take each AC literally and ask what
observation would prove it false. An AC whose spec is wrong is worth finding before anyone
implements it.

### 2. Create a target config

```bash
cp data/targets/_example-backend.yml data/targets/local-my-service.yml
```

Fill in `base_url`, `environment.kind`, the `backend.resources` names, and `source.branch`.

Two rules:

- **Credentials are referenced by env var NAME, never by value.** `aws_profile_env:
  QA_AWS_PROFILE` — the value lives in `.env`, which is gitignored.
- **Name a private target `local-*.yml`.** That prefix is gitignored, so internal hostnames,
  account ids and resource names stay on your machine. Add your own prefix to `.gitignore` if
  you prefer a different convention.

### 3. Verify

```bash
/qa-verify-backend --target local-my-service --context output/context/TICKET-123-context.md
```

Flags: `--static-only` (skip live probes — use when you have no cloud credentials),
`--no-e2e` (skip the write-path phase).

### 4. Explore the UI, if the ticket has one

```bash
/qa-explore --target local-my-service --context output/context/TICKET-123-context.md
```

### 5. Hand off

`ac-matrix.md` is the headline deliverable. Bug reports land in `bugs/`, one per finding, each
with a Business Impact written in terms of consequence rather than mechanism — nobody funds a
fix for "StreamViewType is NEW_AND_OLD_IMAGES".

## The three lanes

| Lane | Reads | Never |
|------|-------|-------|
| **Static** | The implementation branch via `git show <ref>:<path>` | Checks out, fetches without asking, or creates branches — you may have uncommitted work |
| **Live** | `describe-*`, `get-*`, `list-*`, `query`, `scan`, `simulate-principal-policy` | Mutates anything, or probes an account other than the one the target declares |
| **End-to-end** | The real write path in a non-production environment, then the data layer again | Runs against production, or writes directly to a data store (that bypasses the path under test and proves nothing) |

## Verdicts

| Verdict | Means |
|---------|-------|
| `PASS` | Verified, with cited evidence |
| `PARTIAL` | The intent is met but something material deviates from the stated spec |
| `FAIL` | The AC as written is not true |
| `BLOCKED` | Not verifiable with available access — the probe command is attached, ready to run |
| `UNVERIFIABLE` | The AC has no falsifier as written — a DoR defect |

Every verdict names the observation mode that produced it. A row is never left at `PENDING`:
if it was not checked, it is `BLOCKED` and says why.

## Choosing how to observe

Each AC is routed to the channel that can actually falsify it
(`technique-verification-mode-selection`):

- **API-behind-the-screen** — a user flow reaches the changed code, but you assert on the
  network calls underneath, not the rendered screen. The UI is a lossy renderer: it hides
  fields it does not display, coerces types, and swallows partial failures.
- **Direct request** — webhooks, internal endpoints, queue consumers, scheduled jobs. Nothing
  in any product screen reaches this code, so you fire the request yourself and follow through
  to what it produced.
- **LLM / agent output** — a prompt, tool definition, model version or retrieval step changed.
  Run a fixed input set against a written rubric; assert on properties and tool trajectory, not
  on generated text (`technique-llm-output-verification`).
- **Needs a human** — a pure refactor, or something you lack the access to observe. Say so and
  write out what someone with access should run.

## Safety

The full policy is in
`.claude/skills/qa-verify-backend/references/safety-rules.md`. The parts worth knowing before
your first session:

- **Production hard stop.** If the account, profile, resource name or URL contains `prod`,
  `prd` or `live`, probes are read-only and the end-to-end phase is skipped and reported as
  skipped. If you cannot tell whether an environment is production, it is treated as production.
- **Account confirmation first.** `sts get-caller-identity` runs before the first probe and is
  compared to the target's declared account. A probe fired at the wrong account is an access
  event in someone else's environment.
- **Destructive runbooks are findings, not instructions.** A cleanup script with `delete-item`
  commands found in a repo gets reported ("cleanup documented, no evidence of execution"), never
  executed.
- **Redaction before disk.** Tokens, keys, real user emails, PII and any account id not already
  in the target config become `[REDACTED]`. Raw probe output is the most common leak — it is
  convenient to paste whole, and it is full of identifiers.
- **Session output is confidential and local.** It maps internal resources, effective
  permissions and unfixed defects. It never goes to an external service.

## The techniques behind it

Knowledge base entries loaded by the skill (`data/knowledge/`):

| Entry | Use it when |
|-------|-------------|
| `technique-verification-mode-selection` | Every session, at AC decomposition |
| `technique-functional-diff-analysis` | The static lane — eight passes that read a diff for behaviour, not style |
| `technique-contract-narrowing` | Any ticket that swaps a data source on a read path |
| `technique-test-suite-audit` | The change rewrites the tests meant to prove it works |
| `technique-llm-output-verification` | The change touches a prompt, tool, model or retrieval step |

Browse them with `/qa-knowledge-list`.
