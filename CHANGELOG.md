# Changelog

## [2.0.0] - 2026-09-08

A review of the 1.3.0 package (source, skill content, docs, packaging) verified against Playwright 1.63, `@playwright/cli` 0.1.19, the current Claude Code skill/sub-agent/plugin docs and Maestro 2.10 found sixty defects; this release fixes them and unifies the contracts the skills, the CLI and the formatters share. It is a **breaking** release — the migration notes are at the end of this section.

### Breaking

- **`qualiow init` now actually installs skills from the npm package.** Every 1.x release copied from `<pkg>/.claude/skills`, a directory the tarball never contained, so `init` installed nothing. It now copies the shipped `skills/` tree (falling back to `.claude/skills/` in a git checkout), the `qa-gather-agent` sub-agent, the data files, the mobile driver into `qa/bin/`, and `qa/.env.example`. It no longer writes a root `.env.example`, no longer adds `dist/` to `.gitignore`, respects `--force` uniformly (1.x overwrote `data/targets/_default.yml` unconditionally), merges `.gitignore` by exact line (1.x used substring matching, so an existing `.env.example` suppressed `.env`), never copies `local-*.yml`, and is idempotent. New `--dry-run`.
- **One session-directory scheme for every session kind:** `output/sessions/<YYYY-MM-DD-HHmm>-<kind>-<slug>/`, `kind ∈ explore|quick|mobile|backend`. 1.x used four incompatible patterns and `qualiow explore` a fifth that sorted after every skill-created directory, so `report -s latest` resolved to the empty CLI stub.
- **Quick sessions emit the standard artefacts** (`session-report.md`, `bugs/BUG-NNN.md`, `stats.json`, an INDEX row) instead of `quick-report.md`, so `/qa-explore-report`, `/qa-explore-feedback`, `/qa-explore-cleanup` and the CLI can see them.
- **One bug-report and session-report contract** shared by the templates, all four session skills, the fixtures and the parser: `# BUG-NNN: [Component] fails [Condition] causing [Impact]`, `**Severity:**`/`**Priority:**`/`**Component:**`/`**URL:**`/`**Environment:**`/`**Reproduction rate:**`, the coverage-map header `| Area | Risk | Status | Bugs | Notes |`, and a two-line confidentiality blockquote as the first lines of every artefact. 1.x had three incompatible formats and the shipped template could not be parsed (title became "Bug Report", severity always `medium`).
- **`output/sessions/INDEX.md` and `output/bugs/all-bugs.md` headers** are `| Date | Kind | Target | Bugs | Duration | Status | Report |` and `| ID | Session | Title | Severity | Status | Report |`; no placeholder rows (`list sessions` counted them).
- **Phase artefacts are numbered after their phase**: `phase-3-discovery.md` … `phase-6-edge-cases.md` (1.x wrote `phase-1-discovery.md` from phase 3 and the report skill looked for files nothing produced).
- **`stats.json` is the `SessionMetricsSchema` shape** (extended with optional `kind`, `coverage`, `evidence`, `areas_not_tested`, `blocked_by`), and `qualiow report` records it in `output/metrics.jsonl` once per session.
- **Target configs are validated strictly**: unknown keys anywhere fail, `.parse()` returns the validated object (1.x accepted and passed through anything), and a target's or domain's `id` must equal its file name. The `_example-*` and `_default` ids were renamed accordingly (`_default`, `_example-mobile-emulation`, `_example-native-mobile`, `_example-sim-ios-safari`, `_example-sim-android-chrome`).
- **Domain configs are YAML only.** `DomainConfigSchema` now matches the shape every file always had (`risk_ranking` p0–p3 map, `journeys[{name, steps}]`, `must_test_patterns` map, `common_bugs`, `compliance`, `guidance` string); the six `data/domains/*.md` files are removed and every skill reads `.yml`. `npm run validate` passes for the first time since the domain schema was written.
- **`qualiow gather` is removed** (it printed "output will be saved" and wrote nothing). Use `/qa-gather`.
- **`qualiow explore` is labelled what it is**: pre-flight only — validates inputs, creates the skeleton, prints the `/qa-explore … --session <dir>` command. `--time-box` defaults to and is capped at `45m`.
- **`qualiow report -f md`** writes `session-summary.md` (1.x wrote nothing for the default format). New `-o <file>` and `--stdout`; a partial `-s` match must be unique.
- **Node ≥ 22.4** (`engines`); `bin/wkeval.mjs` uses the global `WebSocket` and `fs.cp` is stable only from 22.3.
- **Mobile toolchain scripts moved** from `scripts/` to `bin/` (`bin/setup-mobile.sh`, `bin/doctor-mobile.sh`) and are exposed as `qualiow-setup-mobile` / `qualiow-doctor-mobile`; the driver and wrappers are exposed as `mcli`, `wadb`, `wk-ios` package binaries. The skill no longer uses `$MCLI` / `export MOBILE_CLI_STATE` (first-token permission rules never matched them); state is per-invocation via `--state <file>`.
- **`playwright-cli network` → `requests`.** The `network` command never existed; a quick session errored on its fourth command.
- **`.npmignore` removed** (with `files` present it was ignored by npm and its comments described a policy that was not applied). Sourcemaps no longer ship (they embedded all of `src/`).
- Library: `DomainConfig`/`Journey` types changed to the house shape; `ParsedBug` gained `priority`, `environment`, `reproduction_rate`, `summary` and `evidence.{videos,logs,network_failures}`; `redact()` output format is `key<sep>[REDACTED]` (key and separator preserved) and category names changed.

### Added

- **Claude Code plugin manifest** `.claude-plugin/plugin.json` (`name: qualiow`): `claude --plugin-dir <repo>` or a marketplace install exposes the skills as `/qualiow:qa-explore` etc. `skills/` and the new `agents/` are the generated mirrors of `.claude/skills` and `.claude/agents` (`npm run sync:plugin`, `npm run check:mirror`; CI fails on drift).
- **Project-local configuration** completed: `qa/target.yml` and `qa/.env` are honoured by every session skill and by the CLI (`resolveTargetPath`: `--target` → `qa/target.yml` → `_default.yml`); `/qa-target-setup` writes `qa/target.yml` by default (`--shared` for `data/targets/`); `qa/.env` is gitignored by `init`; `qualiow validate` checks it. The resolution order is written once in `references/paths.md`.
- **`references/output-contract.md`** (bug/session-report/stats/INDEX contract) and **`references/security-rules.md`** as the single rule set: one production rule (`prod|production|prd|live` against the hostname with an explicit exclusion list — 1.x tripped read-only mode on `staging.example.com/products`), one redaction list, one confidentiality header, and session isolation (`-s=<kind>-<HHmm>-<slug>` on every command, `close` then `delete-data` at the end — mandated in 1.x, executed nowhere). Every skill links it.
- **Redaction is wired in.** `redact()` was exported but never called; every formatter now redacts the report body and every bug field. New categories: bare JWTs, `Authorization`/`Set-Cookie` headers, AWS access/secret keys, `sk-`, GitHub, Slack tokens, private-key blocks, emails (except `example.*`/`localhost`); key/value patterns require an actual `=`/`:` so "Password field accepts…" and "the secret sauce" are left alone; card numbers are Luhn-checked so timestamps and order ids survive.
- **Confidentiality header on every output**: templates, session artefacts, the HTML report (banner + `Content-Security-Policy` and `noindex` meta), JSON (`meta.classification`), Jira CSV (note in every description). Jira cells are formula-neutralised (`= + - @` prefixed with `'`).
- **Knowledge-base integrity**: `KnowledgeReleaseSchema`, `KnowledgeChangelogSchema`, `validateKnowledgeBase()` (registry ↔ entry files ↔ stats ↔ `loading_strategy` ↔ changelog), `qualiow kb sync|check`, `scripts/kb-sync.mjs`. The manifest registry had 27 of 29 entries (both v0.6.0 entries were invisible) and `v0.1.0/release.yml` declared 6 of its 13.
- **CLI** `validate --kb`, `report -o/--stdout`, `init --dry-run`, `list` shows `qa/target.yml` and unindexed session directories; `qualiow --version` reads `package.json` (1.x hard-coded `1.0.0`).
- **Mobile driver hardening** (`bin/mobile-cli.mjs`): Maestro flows are built from JSON-escaped scalars (text containing a quote and a newline could inject a `launchApp` step; `tap-id`/`fill-id` escaped nothing); flow files go to a `0600` `mkdtemp` directory instead of a predictable world-readable `/tmp` path; refs expire 60 s after the snapshot that produced them and off-screen nodes get no ref; platform detection uses `adb devices` and `simctl list devices -j` (an iOS simulator *name* was classified as Android by string length); exit codes 0/1/2/3/4; new `boot` (adopts an already-running emulator/simulator instead of spawning a second one), `version`, `info` documented with `tap-id`, `fill-id`, `wait-text`, `logs-clear`; Android recordings are real `.mp4` files. `bin/doctor-mobile.sh` checks Node ≥ 22.4, `python3` and Maestro ≥ 2.6; `bin/setup-mobile.sh` pins `MAESTRO_VERSION` (default 2.10.0) and refuses `curl | bash` under `--yes` without `--allow-curl-bash`.
- **playwright-cli 0.1.16–0.1.19 features** adopted in the skills: `find "<text>"`, `open --mobile --device=`, `requests --filter=`, `video-chapter`/`video-show-actions`, `recording-start/stop`, `--raw snapshot` diffs, `run-code "async page => …"` for the Playwright-library observation helpers (`consoleMessages()`, `pageErrors()`, `requests()`).
- **CI** (`.github/workflows/ci.yml`, ubuntu + macOS): lint, build, mirror check, tests, `validate --all`, `kb:check`, tarball assertions (`scripts/check-pack.mjs`), an end-to-end `qualiow init` into a fresh project (second run must be a no-op), shell syntax, plugin manifest. Dependabot for npm and actions.
- **Tests**: 98 → a suite that validates the real `data/` tree, the knowledge base, `init` in a temp project, redaction gaps and false positives, the canonical fixtures, formatters, session-dir/table/gitignore helpers, the mobile flow builder (injection cases), the skills mirror and a skills lint (frontmatter, forbidden strings, link resolution, `allowed-tools` coverage of every first token in every bash fence).

### Fixed

- `page.accessibility` is described as removed in Playwright 1.57 (not deprecated); `npx playwright trace` uses the `open` subcommand; `init-agents --loop=claude` is described as generating `.claude/agents/` and `.mcp.json` (not `tests/agents/` or a config rewrite), loops `claude|codex|copilot|opencode|vscode|vscode-legacy`; `page.pickLocator()` marked human-only.
- `allowed-tools` now covers every command the phases run (mobile: `qa/bin/mcli`, `bin/mcli`, `mcli`, `${CLAUDE_SKILL_DIR}/../../bin/mcli` and the same for `wadb`, `wk-ios`, `doctor-mobile.sh`; backend: `node`; target-setup: `npx playwright`).
- Phase links use `${CLAUDE_SKILL_DIR}/phases/…`; broken relative links in `mobile-edges.md` and four `qa-verify-backend` files; the report skill's phase-file list; `press HOME` works on iOS; the mobile `logs/` directory is created; `qa-verify-backend` summary line lists all six verdicts and its knowledge list includes the two v0.6.0 entries; `04-e2e-trigger` reads `environment.kind`, `00-setup` reads `api.browser_profile`; the `qa-gather-agent` sub-agent is referenced by `/qa-gather` and reads `.yml` domains; the `tool-qa-workflow` name is gone.
- Time budgets sum to 45 minutes (1.x allocated ≥ 50).
- Formatters parse the coverage header the skills actually write and no longer shift columns on empty cells; `extractDomain` dead parameter removed; `metrics.jsonl` tolerates a corrupt line.
- Data: `.env.example` documents the variables the targets use (`QA_USER`, `QA_PASS`, `QA_TOKEN`, `QA_AWS_PROFILE`, `QA_AWS_REGION`, `QA_API_TOKEN`, `EXAMPLE_API_KEY`); `changelog.yml` v0.2.0 block completed and entry names aligned with the entry files; `_example-native-mobile.yml` names the standard `qa-iphone` simulator; `technique-business-logic-race-conditions` no longer recommends the non-existent `network` command.
- Packaging: `data/security/` and `data/targets/_example-api-only.yml` ship (both were referenced by shipped docs and absent); the CLI shebang is injected by the build rather than relying on the first line of a source file; `tsconfig` type-checks the tests; `@playwright/cli` bumped to `^0.1.19`, which also closes KNOWN-ISSUES ISSUE-002 (negative positional args).
- Docs: package name (`qualiow-exploratory-testing`, not `@qualiow/exploratory-testing`), CLI flags and honest command status, session paths, the Homebrew cask name (`android-commandlinetools`), env var names, phase count, shipped targets; `PROJECT-STATUS.md` and `PRODUCTION-READINESS-REVIEW.md` removed (their open items live in `KNOWN-ISSUES.md`); `CHANGELOG` 1.3.0 errata below.

### Errata for earlier entries

- Commit `db5c923` (2026-09-04) shipped on `main` after 1.3.0 without a version, tag or changelog entry: `api.auth: api-key-env` + `api.header_name`, `data/targets/_example-api-only.yml`, the `.env.example` API-key block, and knowledge base v0.6.0 (`technique-exactly-once-verification`, `technique-async-callback-contracts`). It is part of 2.0.0.
- 1.3.0: `/qa-verify-backend` has four lanes (the entry says three, then adds a fourth); it shipped 7 phase files and 6 references (not 6 and 2); the knowledge base reached 27 entries in 1.3.0 and 29 with v0.6.0. 1.0.0: nine skills were listed under a "10 skills" heading.

### Migrating from 1.x

1. Re-run `qualiow init` in each project (it is safe; use `--force` to take the new skill versions over locally edited copies). Move `.env` values you keep per project to `qa/.env`.
2. Rename any tooling that read `quick-report.md`, `phase-1-discovery.md`, the old INDEX columns, or session directories without a `-<kind>-` segment.
3. Targets whose `id` differed from the file name must be renamed (`qualiow validate` tells you which).
4. If you referenced `data/domains/<domain>.md`, read the `.yml`.
5. `scripts/setup-mobile.sh` → `bin/setup-mobile.sh` (or `qualiow-setup-mobile`); `scripts/doctor-mobile.sh` → `bin/doctor-mobile.sh`.
6. Library consumers: `DomainConfig`, `Journey`, `ParsedBug`, `SessionMetrics` and `redact()` changed as listed under Breaking.

## [1.3.0] - 2026-09-03

All changes in this release are **additive and backward-compatible** with v1.2.0. No skill names, frontmatter fields, CLI commands, bin entries, library exports, or `files` whitelist entries were renamed or removed.

### Added — Backend & infrastructure AC verification (`/qa-verify-backend`)
- New skill `skills/qa-verify-backend/` (SKILL.md + 6 phase files + 2 references): verifies acceptance criteria that have **no UI surface** — tables and streams, queue consumers, Lambda triggers, IAM policies, webhooks, IaC. Three lanes: **static** (reads the implementation branch against each AC with `git show`, never checking out), **live** (read-only `aws-cli` probes, one per AC, raw output saved as evidence), and **end-to-end** (drives the real write path in a non-production environment, then re-probes the data layer — including same-tick writes, deletes, bulk saves, a second identity, and DLQ depth).
- Output is an **AC traceability matrix** — `PASS` / `PARTIAL` / `FAIL` / `BLOCKED` / `UNVERIFIABLE`, each with cited evidence — plus one bug report per finding. Every verdict names the observation mode that produced it; a verdict backed only by a code reading is `UNVERIFIABLE`, never `PASS`. `BLOCKED` is a first-class outcome: missing credentials produce ready-to-run probe commands rather than a verdict inferred from source.
- `references/aws-readonly-probes.md` — probe catalogue per resource type (DynamoDB streams and key schema, Lambda event source mappings, IAM `simulate-principal-policy` for both allows and denies, SQS DLQ depth, CloudWatch metrics and log hygiene, Terraform) with guidance on reading each output.
- `references/safety-rules.md` — read-only discipline, the production hard stop, account confirmation before the first probe, destructive runbooks treated as findings rather than instructions, redaction before disk, and untrusted-content handling. Extends `data/security/SECURITY-POLICY.md`.

### Added — The API verification lane (`phases/03b-api-verification.md`)
- A fourth lane for the surface most backend tickets actually have: **the service's own HTTP endpoints**. The request runs inside the already-authenticated page (`playwright-cli eval` + `fetch(…, {credentials: 'include'})`), so it carries the same session cookie, CSRF token and client interceptors as the UI — no token plumbing, no stored credential, and it works with SSO/MFA that no scripted login can pass. Read-only in every environment, limited to the endpoints the target's `api.probe_allowlist` declares.
- **Environment fingerprinting runs before the first probe of any lane** (phase 0 step 3c, `references/environment-fingerprinting.md`). Which build is deployed in every component of the request path; whether the changed code path is *selected* here — a flag, a config value or a routing rule can pick between two implementations of one feature inside a single identical build; and whether the commit under test is genuinely an ancestor of what is running (`git merge-base --is-ancestor`). *Same build, different behaviour ⇒ configuration, not deploy lag.* Includes behavioural fingerprinting for services with no version endpoint.
- New verdict **`NOT-REACHABLE`** — this environment does not run the changed code path. Not a pass and not a failure, and the honest answer to "it works in dev" when the flag is off everywhere else. Every verdict is now scoped to the environment it holds in.
- **The UI-vs-API differential pass.** When a ticket has both a screen and an endpoint, the overlapping cases run at both surfaces and every finding is sorted into *both* (fix it in the service), *API only* (a real defect the client's guard is hiding, reachable by every other client), *UI only* (the client invents or masks behaviour the service does not have) or *neither*. This closes the most common false `PASS` in exploratory testing: recording a client-side guard as evidence that the endpoint behaves correctly.
- `references/api-probes.md` — getting an authenticated request context in three modes and what each one actually proves; ten case families to fire at any endpoint (length boundaries, tokenisation, metacharacters, the four kinds of nothing, enum values, pagination bounds, type confusion, casing, second identity, second scope); a signal-to-meaning table for reading results; evidence hygiene.
- New template `data/templates/api-probe-matrix.md` — environment fingerprint, case table with a column per environment, four-bucket findings table, evidence index.
- Cross-environment rule enforced throughout: **compare status codes and response shapes, never absolute counts.** Different environments hold different data and it drifts between runs.

### Added — Payload correctness and release-level verification
- `references/payload-verification.md` — **a well-shaped `200` is not a correct answer.** Every derived value (percentage, total, ratio, delta, aggregate) is recomputed from the raw figures in the same response, using the formula from the **specification** rather than from the code under test, with cases chosen to stress sign, zero, scale and cardinality, plus the structural invariants that hold regardless of magnitude. The report then states what the check does not prove — when both sides come from one payload the *derivation* is verified and the *inputs* are not — and names the **independent oracle** that would close the gap, along with whether it was run.
- The same reference covers **presentation integrity**: the payload held next to the screen, because a correct response still reaches the user as a wrong number when a formatter guesses what a value is (`value > 1 ? value : value * 100` is wrong for every value at or below the threshold it tests), a unit is applied twice, rounding crosses a threshold, or a truncated figure is shown as a total. Includes attributing the corruption to the change that owns it — usually not the change under test, and frequently one deployed on a single environment. Also: in-page cold/warm timing with `performance.now()`.
- `references/release-readiness.md` — verifying many tickets against one build. The deployment table comes first for everything (`git merge-base --is-ancestor`), so a ticket whose backend is not deployed is **not testable here** rather than tested against a UI that will render convincing nonsense. A fixed result vocabulary keeps *not testable here* and *not tested* visible; a four-state coverage map marks 🔍 *code-verified only* as `UNVERIFIABLE` rather than green; carry-over defects get their own section; a deploy landing mid-session is handled explicitly; and the report closes with a disposition and the condition that would reverse it.
- New template `data/templates/expected-behaviour.md` — the specification that should have existed, for the majority of API findings that have no acceptance criterion to be filed against. Observed against expected, grouped by cause rather than by case, with the decisions the fix forces made explicit (**reject, do not clamp**; an error rather than a silent zero; validation at the layer covering every implementation, never only the client), ranked by what real users can reach *today*, and closed with a plain-English reply for whoever decides to fund the work.
- `data/templates/coverage-map.md` gains the **code-verified-only** state and two distinctions that routinely produce a false pass: *consistent is not causal* (a setting whose value happens to match the output proves nothing until it is changed), and *the data has to reach the case* (an AC about negative values cannot be verified against records that are all zero).

### Added — Knowledge base v0.2.0 through v0.5.0 (13 → 27 entries)
- `technique-contract-narrowing` (v0.2.0) — verifying a swapped data source. When a full-record read is replaced by a projection, the request's field-selection list silently becomes the payload specification; unrequested fields vanish with no error, no DLQ, and a green suite.
- `technique-test-suite-audit` (v0.2.0) — auditing the branch's own tests. When a change rewrites the tests meant to prove it works, those tests become part of the change under review.
- `technique-verification-mode-selection` (v0.3.0) — routing each AC to the channel that can actually falsify it: API-behind-the-screen, direct request to a no-UI endpoint, LLM output judgement, or needs-a-human. Makes `UNVERIFIABLE` a first-class verdict.
- `technique-functional-diff-analysis` (v0.3.0) — eight passes that read a backend/API/LLM diff for behaviour at the service boundary rather than code quality, producing falsifiable hypotheses attached to ACs.
- `technique-llm-output-verification` (v0.3.0) — fixed input set, written rubric, before-and-after on the same inputs, N runs to expose variance, assertions on properties and tool trajectory rather than generated text.
- `technique-environment-fingerprinting` (v0.4.0) — proving what an environment actually runs before any verdict is written: build id per component of the path, whether the changed path is selected here, commit ancestry, and the verdict mapping that follows from the answers.
- `technique-authenticated-api-probing` (v0.4.0) — calling the endpoint behind the screen. Three ways to get a request context and what each proves, ten case families, a signal-to-meaning table, and the credential and volume rules that keep the lane safe.
- `technique-ui-api-differential` (v0.4.0) — the same matrix at both surfaces, sorted into four buckets. "API only" is not reassurance: the browser guard is the only thing preventing it, and no other client has one.
- `technique-silent-failure-audit` (v0.4.0) — seven shapes of failure that render as a legitimate empty, zero or neutral result, how to force each one, and why they recur as a class (no shared error-state component) rather than as individual bugs.
- `technique-derived-value-verification` (v0.5.0) — recomputing the number and naming what it does not prove; choosing cases that stress sign, zero, scale and cardinality; structural invariants; finding an independent oracle.
- `technique-presentation-integrity` (v0.5.0) — does the screen show what the service sent? The formatter that guesses, units applied twice, rounding across a threshold, truncation shown as a total — and attributing the corruption to the right change.
- `technique-expected-behaviour-specification` (v0.5.0) — writing the spec that should have existed, including the recurring decisions and the plain-English reply that gets the work scheduled.
- `technique-config-surface-verification` (v0.5.0) — when the configuration mechanism *is* the change: values matching the deployed config rather than the source default, nothing leaking alongside them, the runtime genuinely reading through the surface rather than around it, and the route existing in every environment the change will be promoted to.
- `technique-release-readiness-verification` (v0.5.0) — many tickets, one build: establish what is deployed before testing anything, keep not-testable and not-tested visible, mark a code reading differently from an observation, separate carry-overs, and close with a disposition and its reversal condition.
- `data/knowledge/learned-patterns.md` now carries a backend/API/event-driven section, an **HTTP endpoints** subsection, a **calculated values and what reaches the screen** subsection, a **reporting a set of tickets** subsection, a **findings with no acceptance criterion** subsection, a **triage and re-verification** section ("closed: no legitimate user vector" is a hypothesis to falsify; "partial fix" is the most common re-test outcome; re-verify against a build, not a date), and an expanded set of **disqualifiers** — findings that look real on a first read and do not survive tracing.

### Added — Configuration surface
- New target template `data/targets/_example-backend.yml` documenting the four optional blocks consumed by the skill: `environment:` (what the skill may do here), `backend:` (cloud resources to probe read-only), `api:` (the service's HTTP surface — auth mode, browser profile, version endpoint, endpoints, `probe_allowlist`, `parity_targets`, and where each feature flag's deployed value is declared) and `source:` (the implementation branch to review). Credentials are referenced by env var **name** or by gitignored profile directory; values stay in `.env`.
- New domain profile `data/domains/identity.{yml,md}` (identity and access platforms, and the admin consoles that configure them) — audit trail integrity, identity propagation, consent and privacy, configuration correctness, admin RBAC, log and data hygiene.
- New doc `docs/BACKEND-VERIFICATION.md` — the end-to-end workflow, the three lanes, the verdict vocabulary, and the safety rules worth knowing before a first session.
- `.env.example` documents `QA_AWS_PROFILE` / `QA_AWS_REGION`; `.gitignore` now excludes `data/targets/local-*.yml` and `output/context/*.md` so private target configs and gathered ticket content stay local.

### Changed
- Schema/library: new `EnvironmentConfigSchema`, `BackendConfigSchema`, `ApiSurfaceConfigSchema` and `SourceBranchConfigSchema`, with matching `EnvironmentConfig`, `BackendConfig`, `ApiSurfaceConfig` and `SourceBranchConfig` TS types. `WebTargetConfigSchema` accepts all four blocks as optional — a target without them is still a valid `/qa-explore` target, so existing configs are unaffected.
- `/qa-verify-backend` gains `--api-only` (skip the cloud lane) and `--parity <target-id>` (run the same API matrix in a second environment and compare shapes).
- `phases/05-reporting.md` gains a carry-over section, a four-state coverage map, and a step that produces an expected-behaviour specification where the findings have no acceptance criterion behind them. The disposition line now carries the scope of what was checked when it is narrower than the question being asked.
- `references/safety-rules.md` gains a session-credential rule (an authenticated profile or a cookie taken from it is a live credential and never enters a script, a committed file, a report or a message), makes the API lane read-only in every environment with an allowlist and a volume limit, and extends untrusted-content handling to API response bodies and error strings.
- `package.json` `files` now ships `data/targets/_example-backend.yml` and `docs/BACKEND-VERIFICATION.md`.

### Fixed
- `.gitignore` ignored `.auth/*.json` but not `.auth/<profile>/` directories. The API lane uses **persistent browser profile directories**, which hold live session cookies for a real account, so the pattern is now `.auth/*` with the `.gitkeep` placeholder negated. Without this, following the documented setup would stage a working credential.
- `package.json` `files` shipped `data/domains/*.yml` only, so no `data/domains/<domain>.md` has ever reached an installed copy — while `qa-explore` and `qa-verify-backend` both instruct reading that file for the domain's data-integrity checks. Now ships `data/domains/`, which also covers the new `identity.md`.

### Known issues
- `data/domains/identity.yml` fails `npm run validate`, in exactly the same way as the five domain files already in the repo (`_default`, `ecommerce`, `fintech`, `marketing`, `saas`): `DomainConfigSchema` has drifted from the shape every domain file actually uses (`risk_ranking` as a map, `journeys` without `id`/`description`/`risk`, `guidance` as a string). The new file follows the existing house format rather than a schema nothing conforms to. Reconciling the two is a separate change.

## [1.2.0] - 2026-07-09

All changes in this release are **additive and backward-compatible** with v1.1.0. No skill names, frontmatter fields, CLI commands, bin entries, or library exports were renamed or removed.

### Added — Mobile exploratory testing (`/qa-explore-mobile`)
- New skill `skills/qa-explore-mobile/` (SKILL.md + 8 phase files + `references/mobile-edges.md`): full exploratory sessions on iOS Simulators / Android Emulators, in two modes selected by the target config — **NATIVE** (an installed app is the system under test) and **WEB** (a mobile web app in the REAL device browser: iOS Simulator Safari / Android Emulator Chrome — engines Playwright cannot drive).
- New mobile driver `bin/mobile-cli.mjs` — a Maestro / `xcrun simctl` / `adb` shim mirroring the `playwright-cli` command surface (`set-device`, `set-app`, `launch`, `open-url`, `snapshot` with a11y refs, `click`, `fill`, `clear`, `press`, `screenshot`, `logs`, `record-start/stop`, `wait-text`, `tap-id`/`fill-id`). Node built-ins only, no install step. Wrappers: `bin/mcli` (resolves JAVA_HOME/ANDROID_HOME/PATH), `bin/wadb` (wrapped adb), `bin/wk-ios` + `bin/wkeval.mjs` (WebKit Remote Inspector JS eval in sim Safari via ios-webkit-debug-proxy).
- New scripts: `scripts/setup-mobile.sh` (idempotent toolchain bootstrap — Homebrew, Node, Maestro, JDK 17, Android cmdline-tools/platform-tools/emulator, Google-Play system image, standard AVD `qa_pixel_api35`, iOS sim `qa-iphone`; checks Xcode Command Line Tools and prints guided-manual steps for Xcode + the iOS runtime) and `scripts/doctor-mobile.sh` (read-only readiness preflight with per-item fix commands).
- New target templates: `data/targets/_example-native-mobile.yml` (native app), `_example-sim-ios-safari.yml` / `_example-sim-android-chrome.yml` (mobile web on real sim browsers), `_example-mobile-emulation.yml` (mobile web via Playwright device emulation — the `/qa-explore` path, no simulator needed).
- New doc `docs/MOBILE-SETUP.md` — fresh-Mac setup guide (device names, the two genuinely manual iOS steps, Play-image rationale, auth reality, troubleshooting).
- Schema/library: `MobileTargetConfigSchema` (+ device/app/web/source_repo/mobile-scope sub-schemas) and matching TS types; `TargetConfigSchema` now accepts web AND mobile targets, discriminated on the `platform` key with per-field error paths preserved. Auth strategies extended with mobile-only `in-app` and `interactive-sso` (+ `identity_provider`, `static_otp`, `test_email_pattern`). `BrowserConfigSchema` documents optional `engine`/`channel`/`device` for mobile-web emulation targets.
- `package.json` `files` now ships `bin/`, the two mobile scripts, the mobile target templates, and `docs/MOBILE-SETUP.md`.

### Fixed
- `data/targets/_default.yml` (ad-hoc target) no longer fails validation: `base_url` may be `''` when the URL is provided at session start.

## [1.1.0] - 2026-04-11

All changes in this release are **additive and backward-compatible** with v1.0.0. No skill names, frontmatter fields, CLI commands, bin entries, library exports, or `files` whitelist entries were renamed or removed. Consumers can upgrade from 1.0.0 → 1.1.0 without changing their workflows.

### Added
- New reference file `skills/qa-explore/references/playwright-agents-integration.md` documenting opt-in integration with the Playwright Test Agents framework (planner / generator / healer) introduced in Playwright 1.56. Includes a bug-to-regression-test workflow, prerequisites, limitations, and a feature cross-reference table.
- Optional peer dependency on `@playwright/test ^1.59.1` (declared with `peerDependenciesMeta.optional: true` so v1.0.0 consumers upgrading see no `EPEERINVALID` warning). Consumers who want to use Test Agents can install it; everyone else is unaffected.
- `qa-explore` phase files now surface Playwright 1.56–1.59 features where each is most useful:
  - `phases/00-setup.md` — new optional Step 6: bootstrap Test Agents via `npx playwright init-agents --loop=claude` when prerequisites are present.
  - `phases/03-discovery.md` — API-level observation helpers (`page.consoleMessages()`, `page.pageErrors()`, `page.requests()`) and a note on Service Worker network routing (all 1.56).
  - `phases/05-features.md` — locator stabilization helpers (`page.pickLocator()`, `locator.normalize()`, 1.59) and a Test Agents handoff recipe for converting reproducible bugs into regression specs.
  - `phases/06-edge-cases.md` — note that `page.accessibility` is deprecated in Playwright 1.57 and `page.ariaSnapshot()` (1.59) is the replacement.
  - `phases/07-reporting.md` — trace analysis callouts for `npx playwright trace` CLI (1.59), HTML reporter "Speedboard" timeline (1.58), Trace Viewer themes (1.58), and optional `page.screencast()` (1.59) for premium evidence on Critical/High bugs.
- `qa-explore-quick/SKILL.md` — inline bullet on `page.pickLocator()` / `locator.normalize()` for locator stability during 15-minute sessions.
- `qa-target-setup/SKILL.md` — new optional Step 9 offering to scaffold Test Agents while target credentials and scope are already loaded.
- `qa-explore/SKILL.md` — `Bash(npx playwright:*)` added to `allowed-tools` to permit `npx playwright init-agents` and `npx playwright trace` when used from any phase. Sessions that never invoke `npx playwright ...` are unaffected.
- `qa-explore/SKILL.md` References section now lists `playwright-agents-integration.md` alongside the existing references.
- New npm scripts: `sync:skills` (mirrors `.claude/skills/` → `skills/` via `rm -rf skills && cp -R .claude/skills skills`) and `prebuild` (runs `sync:skills` before every `tsup` build). The existing `prepublishOnly` chain automatically picks this up, so every publish ships a fresh mirror.

### Changed
- `@playwright/cli` dependency pinned from `"latest"` to `"^0.1.6"` for reproducible installs. The caret stays inside the 0.1.x line.

### Deprecated
- Use of `page.accessibility` for accessibility checks is discouraged in `phases/06-edge-cases.md` guidance. This is an upstream Playwright 1.57 deprecation; **no qualiow API is deprecated**.

## [1.0.0] - 2026-03-29

### Added
- 10 Claude Code skills for exploratory testing
  - `/qa-explore` — Full 45-min session with business context, risk ranking, data integrity
  - `/qa-explore-quick` — 15-min focused session
  - `/qa-explore-report` — Report generation from sessions
  - `/qa-explore-feedback` — Post-session learning
  - `/qa-explore-cleanup` — Session management
  - `/qa-gather` — Requirements analysis
  - `/qa-knowledge-add` — Knowledge base curation
  - `/qa-knowledge-list` — Knowledge browsing
  - `/qa-target-setup` — Target app configuration
- Decomposed skill architecture (8 phases + 4 references)
- 13 YAML knowledge entries (5 heuristics, 5 techniques, 1 checklist, 2 references)
- 5 structured domain configs (ecommerce, fintech, saas, marketing, default)
- TypeScript CLI with 6 commands (init, validate, list, report, explore, gather)
- Zod schema validation for all YAML configs
- Credential redaction utility (JWT, API keys, passwords, SSN, card numbers)
- HTML report generator (dark-mode, standalone, severity-colored bug cards)
- JSON and Jira CSV export formatters
- Session metrics collection (JSONL)
- Security policy (prompt injection resistance, credential protection, production safety)
- 83 unit tests passing
- Community-seeded learned patterns from 8 exploratory sessions
