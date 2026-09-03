# Backend & Infrastructure AC Verification

A guide to `/qa-verify-backend` — the lane for tickets whose acceptance criteria cannot be
seen in a browser.

## Why this exists

`/qa-explore` drives a browser. A backend ticket — a stream, a table, an IAM policy, a queue
consumer, a webhook — has most of its acceptance criteria below the UI, where a browser cannot
reach. Those ACs get waved through on "it works in the dev env", and the gaps surface months
later during an incident.

Three failure modes this skill is built against, all subtler than a missed bug:

- **A confident `PASS` backed by a code reading** looks exactly like a `PASS` backed by a
  measurement, and is worth far less. Refusing to fake that is what makes the other verdicts
  credible.
- **A client-side guard is not the endpoint's behaviour.** "The button is disabled until you
  type" describes the browser. Every other client — mobile, integration, script — sends the
  request the guard was preventing, and that request is frequently the one that fails.
- **A verdict is a claim about code; a probe is an observation of an environment.** They
  coincide only when that environment runs the change. One identical build can hold two
  implementations of one feature with a flag choosing between them.

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
`--api-only` (skip the cloud lane and verify the HTTP surface), `--no-e2e` (skip the
write-path phase), `--parity <target-id>` (run the same API matrix in a second environment
and compare).

### 4. Explore the UI, if the ticket has one

```bash
/qa-explore --target local-my-service --context output/context/TICKET-123-context.md
```

### 5. Hand off

`ac-matrix.md` is the headline deliverable. Bug reports land in `bugs/`, one per finding, each
with a Business Impact written in terms of consequence rather than mechanism — nobody funds a
fix for "StreamViewType is NEW_AND_OLD_IMAGES".

## The four lanes

| Lane | Reads | Never |
|------|-------|-------|
| **Static** | The implementation branch via `git show <ref>:<path>` | Checks out, fetches without asking, or creates branches — you may have uncommitted work |
| **Live** | `describe-*`, `get-*`, `list-*`, `query`, `scan`, `simulate-principal-policy` | Mutates anything, or probes an account other than the one the target declares |
| **API** | The service's own endpoints, from the authenticated session — the cases a browser cannot send | Calls anything outside `api.probe_allowlist`, or anything that creates, mutates or deletes |
| **End-to-end** | The real write path in a non-production environment, then the data layer again | Runs against production, or writes directly to a data store (that bypasses the path under test and proves nothing) |

### Before any lane: fingerprint the environment

A green result against an environment that does not run the changed code proves nothing, and a
red result there is not the ticket's bug. Phase 0 establishes, with evidence, which build is
deployed in **every** component of the request path, whether the changed path is *selected*
here (a flag, a config value, a routing rule), and whether the commit under test is genuinely
an ancestor of what is running.

> **Same build, different behaviour ⇒ configuration, not deploy lag.**

The consequence is a verdict: an environment that does not run the change gets
`NOT-REACHABLE`. And a fix that only lands behind a flag which is off in the environments
users are in has reached nobody — that is a finding in its own right, because flipping the
flag is a separate decision carrying its own risk.

### The API lane, specifically

The request runs **inside the already-authenticated page**, so it carries the same session
cookie, CSRF token and interceptors the UI has. There is no token to obtain, nothing to store,
and it works with SSO and MFA that no scripted login can pass:

```bash
playwright-cli -s=my-env open https://service.example.com/ --headed --profile .auth/my-env
playwright-cli -s=my-env eval "$(cat probes/search-cases.js)" --raw
```

Cases come from the ACs plus the standard families — length boundaries, tokenisation,
metacharacters of whatever query language sits underneath, the four different kinds of
nothing (`""`, `null`, whitespace-only, field absent), enum values valid and invalid,
pagination bounds, type confusion, a second identity and a second scope.

If the ticket also has a screen, run the overlapping cases through it too and sort every
finding into **both** (the UI is faithful — fix it in the service), **API only** (a real
defect the client's guard is hiding, reachable by every other client), **UI only** (the client
invents or masks behaviour the service does not have) and **neither**.

## Verdicts

| Verdict | Means |
|---------|-------|
| `PASS` | Verified, with cited evidence |
| `PARTIAL` | The intent is met but something material deviates from the stated spec |
| `FAIL` | The AC as written is not true |
| `BLOCKED` | Not verifiable with available access — the probe command is attached, ready to run |
| `NOT-REACHABLE` | This environment does not run the changed code path — a flag, a config value, or an undeployed commit. Not a pass and not a failure |
| `UNVERIFIABLE` | The AC has no falsifier as written — a DoR defect |

Every verdict names the observation mode that produced it **and the environment it holds in**.
`PASS (dev)` and `PASS` are different claims, and only one of them is honest when the change is
behind a flag that is off everywhere else. A row is never left at `PENDING`: if it was not
checked, it is `BLOCKED` and says why.

## Choosing how to observe

Each AC is routed to the channel that can actually falsify it
(`technique-verification-mode-selection`):

- **API-behind-the-screen** — a user flow reaches the changed code, but you assert on the
  network calls underneath, not the rendered screen. The UI is a lossy renderer: it hides
  fields it does not display, coerces types, and swallows partial failures.
- **Direct request** — webhooks, internal endpoints, queue consumers, scheduled jobs, and the
  inputs a screen's own guards prevent. Nothing in any product flow reaches these, so you fire
  the request yourself and follow through to what it produced
  (`technique-authenticated-api-probing`).
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
- **The API lane is read-only in every environment.** It calls only what
  `api.probe_allowlist` declares. An endpoint whose verb is safe but whose effect is not —
  billed per call, queues a job, rate-limited into an outage — needs explicit confirmation.
  Matrix volume stays proportionate: a few dozen requests is verification, thousands is a load
  test nobody agreed to.
- **Session credentials never leave the machine.** An authenticated browser profile and any
  cookie taken from it are live credentials for a real account. They stay in `.auth/` and are
  never inlined into a probe script, a committed file, a report or a message.
- **Redaction before disk.** Tokens, keys, real user emails, PII and any account id not already
  in the target config become `[REDACTED]`. Raw probe output is the most common leak — it is
  convenient to paste whole, and it is full of identifiers. API response bodies are the worst
  offender: they are whole records, and an error body routinely carries the internal hostname,
  the query that failed and a stack frame.
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
| `technique-environment-fingerprinting` | Every session, before the first probe — which build and which implementation is actually running |
| `technique-authenticated-api-probing` | Any AC about an endpoint's own behaviour: validation, filters, pagination, error contract, payload shape |
| `technique-ui-api-differential` | The ticket has both a screen and an endpoint |
| `technique-silent-failure-audit` | Any read path with an error branch — failures rendered as ordinary-looking empty or zero results |

Browse them with `/qa-knowledge-list`.

## Templates

`data/templates/api-probe-matrix.md` — the environment fingerprint, the case table with a
column per environment, the four-bucket findings table, and the evidence index. Copy it into
the session directory at the start of the API lane.
