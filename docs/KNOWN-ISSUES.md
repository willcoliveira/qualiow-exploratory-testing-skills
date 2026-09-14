# Known Issues

Repo-only notes — this file is not shipped in the npm package. Last reviewed 2026-09-13
(2.2.0).

## ISSUE-001: Autonomous sub-agent sessions and Bash permissions

**Status:** Open — needs re-verification
**Impact:** Background exploratory sessions (a sub-agent driving `playwright-cli` unattended)
**Current position:** the v1 workaround is obsolete; the modern fix has not yet been measured

### The original problem

In v1 the full exploratory prompt was passed straight to the Agent tool, and the agent ran
~170–200 Bash calls unattended. When the skill was decomposed into phase files, sub-agents
started asking for approval on every `playwright-cli` call — which defeats the point of a
background session. The conclusion drawn at the time was that Bash permissions simply are not
inherited across the sub-agent boundary, and the recommended workaround was to go back to
embedding the entire instruction set in the Agent prompt.

### Why that conclusion no longer holds

Claude Code's sub-agent definitions (`.claude/agents/*.md`) support a `permissionMode`
frontmatter field (`default | acceptEdits | auto | dontAsk | bypassPermissions | plan`), and
per the Claude Code documentation `settings.json` `permissions.allow` rules and hooks **do**
apply inside sub-agents, with the parent's mode taking precedence when it is more permissive.
So the correct configuration is a permission rule plus an explicit mode — not a monolithic
prompt.

### What to try, and what to measure

```jsonc
// .claude/settings.json
{ "permissions": { "allow": ["Bash(playwright-cli:*)", "Bash(npx playwright-cli:*)"] } }
```

```yaml
# .claude/agents/<session-runner>.md
permissionMode: acceptEdits
```

Then run a full `/qa-explore` through the sub-agent and record how many approval prompts
appear. **Caveat:** a plugin-distributed agent cannot declare `permissionMode` (plugin agents
reject it), so a marketplace install would still depend on the consuming project's
`settings.json` allow rules alone.

Until that has actually been run and counted, this stays open. Note that `qualiow explore` is
deliberately pre-flight only today (it prints the command for you to run in Claude Code) —
turning it into a real orchestrator is the follow-up that would close this issue properly.

### Update 2026-09-13 (2.2.0)

`qualiow init --hooks` now writes the `permissions.allow` half of the experiment above —
`Bash(playwright-cli:*)`, `Bash(npx playwright-cli:*)` and `Bash(qualiow:*)` — into
`.claude/settings.json`, alongside the two `PreToolUse` guard entries. So the allow rules the
prescribed run needs are one command away instead of a hand-edit, and a plugin install carries
the hooks already.

The four sub-agents this release ships (`qa-gather-agent`, `qa-reporting-agent`,
`qa-diff-indexer-agent`, `qa-page-mapper-agent`) deliberately declare **no** `permissionMode`:
a plugin-distributed agent rejects the field, and these ship through the marketplace.
`tests/unit/agents-lint.test.ts` enforces that, so no agent in this repository can acquire one
by accident. Permission behaviour therefore comes from the consuming project's settings alone,
which is exactly the configuration the experiment is meant to measure.

None of that closes the issue: these four are bounded delegates for reads and report assembly,
not a session runner driving `playwright-cli` unattended. The measurement described above —
run a full `/qa-explore` through a sub-agent and count the approval prompts — has still not
been done, and the orchestrator follow-up is unchanged.

---

## ISSUE-002: playwright-cli negative number parsing

**Status:** ✅ **Closed** — fixed upstream
**Fixed in:** `@playwright/cli` 0.1.19 (2026-09-01), depended on by 2.0.0

`playwright-cli fill e54 "-100"` used to fail because `-100` was parsed as a CLI flag, which
made it impossible to type a negative amount into a field — an everyday case in fintech and
e-commerce testing. Upstream no longer parses negative positional arguments as flags, so:

```bash
playwright-cli fill e54 "-100"      # works
```

The old `eval` workaround is no longer needed. The upstream repository is
**microsoft/playwright-cli** (earlier notes here pointed at an anthropics/ repo, which was
wrong).

---

## ISSUE-003: The v2 benchmark was not clean

**Status:** Acknowledged — no clean benchmark has been run since
**Impact:** the v2 benchmark numbers are not comparable to v1, and neither should be quoted

### Problem

The v2 benchmark listed 21 of 27 known bugs in the agent prompt, and the agent then confirmed
they still existed. That is confirmation testing, not exploratory testing.

### What a fair re-run needs

- No bug list, and no hints about expected findings, in the prompt
- The same decomposed skill phases and the same time allocation as the run it is compared to
- Independently-found bugs scored against the known set afterwards, not before
- Several runs, since a single exploratory session is a high-variance sample

Until that exists, no benchmark claim belongs in the README, the package description, or
anywhere else.

---

## Hardening backlog (from the 2026-03 readiness review)

The security review that used to live in `PRODUCTION-READINESS-REVIEW.md`. Its still-open
items are kept here; everything else in that document is either done (below) or superseded by
the CHANGELOG.

### Still open

| Item | Why it matters |
|------|----------------|
| **Rate-limit browser actions** | Nothing stops a session from firing thousands of requests at a target. A cap per session (and a warning threshold) keeps an exploratory run from looking like a load test — or an attack — to the team that owns the app |
| **Signed session reports** | A session report is evidence. Nothing currently proves an artefact was not edited after the session ended, which is the first question anyone auditing it will ask |
| **SBOM generation** | No software bill of materials is produced at publish time, so a consumer cannot answer "what is in this package" without unpacking it |
| **`SECURITY.md` vulnerability-disclosure policy** | The repo is public and has no stated way to report a vulnerability privately |
| **Secret-scanning pre-commit hook** | Tracked files are clean today (verified), but nothing enforces that. A private target config or a live token is one `git add -A` away |
| **Benchmark suite** | See ISSUE-003. There is no repeatable way to tell whether a skill change made sessions better or worse |

### Done in 2.0.0

| Item | Where |
|------|-------|
| YAML schema validation for every shipped config | Zod schemas in `src/schemas/`, enforced by `qualiow validate --all` and by unit tests that run against the real `data/` tree — not only against fixtures |
| Content-Security-Policy on the HTML report | `<meta http-equiv="Content-Security-Policy">` plus `noindex` in `src/formatters/html-report.ts` |
| Redaction wired into every formatter | `src/utils/redact.ts` is applied by the html, json and jira exports — previously it was exported but never called |
| Confidentiality header on every artefact | The two-line blockquote is in every template, every session artefact and every formatter output |
| Session isolation actually applied | Skills carry `-s=<session-id>` on every `playwright-cli` call and end with `close` + `delete-data`, per `skills/qa-explore/references/security-rules.md` |
