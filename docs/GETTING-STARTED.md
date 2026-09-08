# Getting Started with Qualiow

Step-by-step guide to running your first AI-powered exploratory testing session.

## 1. Install

### System requirements

- **Node.js >= 22.4** (`node --version`)
- **Claude Code**, installed and configured — the skills run as slash commands inside it
- `playwright-cli` arrives as a dependency of this package. There is nothing else to install
  for the web path.

### Install the package

```bash
npm install -g qualiow-exploratory-testing
qualiow --version        # prints the installed package version, e.g. 2.0.0
```

### Initialise a project

```bash
cd my-project
qualiow init
```

That writes:

| What | Where |
|------|-------|
| the 11 skills | `.claude/skills/qa-*/` |
| the `qa-gather-agent` sub-agent | `.claude/agents/qa-gather-agent.md` |
| knowledge base, domain profiles, templates, security policy | `data/knowledge/`, `data/domains/`, `data/templates/`, `data/security/` |
| the `_default` target (add `--include-examples` for the `_example-*` templates and `testers-ai.yml`) | `data/targets/` |
| the mobile driver plus `setup-mobile.sh` and `doctor-mobile.sh`, executable | `qa/bin/` |
| the credential template | `qa/.env.example` |
| empty session/bug/context trees and the auth directory | `output/sessions/`, `output/bugs/`, `output/context/`, `.auth/` |
| a `# Qualiow` block appended to `.gitignore` | `.gitignore` |

Re-running `qualiow init` changes nothing unless you pass `--force`. Use `--dry-run` to see
the plan first.

```bash
cp qa/.env.example qa/.env             # credentials go here, never in a YAML file
npx playwright-cli install --skills    # optional: the official Playwright skill alongside
```

Alternative install paths — the Claude Code plugin (`claude --plugin-dir <repo>`, skills
appear as `/qualiow:qa-explore`) and a plain git checkout — are described in the project
README.

## 2. Run your first session

### Option A: explore a public site

Point `/qa-explore` at any public site. A good first target is
<https://testers.ai/testing/>, which ships as the `testers-ai` target config.

```bash
/qa-explore https://testers.ai/testing/
```

Claude will:

1. Resolve the target config and credentials, and create the session directory
2. Authenticate if the target requires it
3. Write a charter — what is being tested, why, and what "done" looks like
4. Read the knowledge base for the heuristics that apply to this domain
5. Explore across eight phases, saving findings to disk between each
6. File one bug report per finding in `bugs/`
7. Write `session-report.md` and update the session index

The eight phases and their share of the 45-minute cap:

| # | Phase | Minutes | What happens |
|---|-------|---------|--------------|
| 0 | Setup | 2 | Resolve config, create session dir, open the browser session |
| 1 | Auth | 2 | Log in (storage state or adaptive login) |
| 2 | Charter | 5 | Understand the business, risk-rank features P0–P3 |
| 3 | Discovery | 6 | Map the app: pages, forms, roles, console and network health |
| 4 | Journeys | 10 | End-to-end user journeys with data-integrity checks |
| 5 | Features | 10 | Deep testing of the highest-risk features |
| 6 | Edge cases | 6 | Boundaries, negative input, security, "what is missing?" |
| 7 | Reporting | 4 | Reflection, coverage map, session report, cleanup |

### Option B: quick check on one page

```bash
/qa-explore-quick https://app.example.com/checkout
```

A 15-minute focused session — no full site mapping. It produces the same artefacts as a full
session, so reports, feedback and cleanup all work on it.

### Option C: give it the requirements first

```bash
/qa-gather
```

Point it at a ticket, a PR, a design doc, a URL or pasted text. It writes
`output/context/<TICKET>-context.md`, which you then pass to a session:

```bash
/qa-explore --target my-app --context output/context/TICKET-123-context.md
```

## 3. Understand the output

Every session — web, quick, mobile or backend — lands in
`output/sessions/<YYYY-MM-DD-HHmm>-<kind>-<slug>/`, where `kind` is `explore`, `quick`,
`mobile` or `backend`:

```
output/sessions/2026-09-08-1813-explore-parabank/
  charter.md              # what is being tested and why
  session-log.md          # real-time findings, with the WHY not just the WHAT
  progress.json
  phase-3-discovery.md    # phase artefacts — the file number is the phase number
  phase-4-journeys.md
  phase-5-features.md
  phase-6-edge-cases.md
  bugs/
    BUG-001.md            # one bug = one report
    BUG-002.md
  screenshots/
    BUG-001.png
  videos/
  session-report.md       # the deliverable
  stats.json              # machine-readable session metrics
```

Plus, at the top level:

- `output/sessions/INDEX.md` — one row per session
  (`| Date | Kind | Target | Bugs | Duration | Status | Report |`)
- `output/bugs/all-bugs.md` — every bug across every session

### Bug report structure

Each report opens with the confidentiality blockquote, then:

- **Title** — `# BUG-NNN: [Component] fails [Condition] causing [Impact]`
- **Severity** — Critical, High, Medium or Low (conservative by design) — plus Priority,
  Component, URL, Environment and reproduction rate
- **Summary**, **Expected Behavior**, **Actual Behavior**
- **Steps to Reproduce** — numbered, specific enough for someone else to follow
- **Business Impact** — revenue, trust, regulatory, data and scale. Mandatory
- **Evidence** — screenshot, video, logs, console errors, network failures
- **Recommended Fix Priority**

### Session report structure

- Session metadata and executive summary
- Summary stats and the bug table
- **Coverage map** (`| Area | Risk | Status | Bugs | Notes |`) — including what was *not* tested
- Observations that are not bugs but are worth discussing
- Recommendations, reflection, session stats

## 4. Configure a target

For repeated testing of the same application, save a target config.

### Interactively

```bash
/qa-target-setup
```

It navigates to the URL, detects the auth requirement, walks you through the login flow, and
writes `qa/target.yml` — the project-local target. Pass `--shared` to write
`data/targets/<id>.yml` instead, for a config the whole team uses.

### Or by hand

`qa/target.yml`:

```yaml
id: my-app
name: My Application
base_url: https://staging.my-app.com
domain: saas

auth:
  strategy: storage_state
  state_file: .auth/my-app.json
  login_url: https://staging.my-app.com/login

browser:
  headless: true
  viewport:
    width: 1280
    height: 720

scope:
  start_pages:
    - /dashboard
    - /settings
  max_depth: 3
  exclude_patterns:
    - /admin/*
    - /api/*
```

Validate it before you use it:

```bash
qualiow validate --all
```

### Resolution order

```
--target <name>  →  qa/target.yml  →  data/targets/_default.yml
```

Domains come from `data/domains/*.yml` (`_default`, `ecommerce`, `fintech`, `identity`,
`marketing`, `saas`), and drive the risk ranking, completeness checklist and data-integrity
checks a session applies.

### Authentication strategies

| Strategy | When to use | Setup |
|----------|-------------|-------|
| `none` | Public sites, no login required | Default |
| `storage_state` | Cookie/session auth | Log in once by hand, then `playwright-cli state-save .auth/<id>.json` |
| `credentials` | Username/password login | Values in `qa/.env`, referenced by variable name |
| `token` | API token or bearer auth | Value in `qa/.env`, referenced by variable name |

### Credentials

Secrets live in `qa/.env` (gitignored), falling back to `.env`. YAML files reference them **by
variable name only** — never by value. The names the shipped configs use:

```bash
# qa/.env
QA_USER=testuser
QA_PASS=...
QA_TOKEN=...

# /qa-verify-backend
QA_AWS_PROFILE=...          # read-only profile. Never point this at production
QA_AWS_REGION=eu-west-1
QA_API_TOKEN=...            # only for a target declaring api.auth: bearer-env
EXAMPLE_API_KEY=...         # a no-UI service names its own variable; see _example-api-only.yml
```

## 5. Add knowledge

The knowledge base drives Claude's testing strategy: 29 entries across releases v0.1.0–v0.6.0,
indexed by `data/knowledge/manifest.yml`.

```bash
/qa-knowledge-add     # add a heuristic, technique, checklist or reference
/qa-knowledge-list    # browse what is there, by type, domain or tag
```

| Type | Purpose | Example |
|------|---------|---------|
| `heuristic` | Mental model or framework for exploration | SFDIPOT, FEW HICCUPPS |
| `technique` | A specific testing method | boundary testing, authenticated API probing |
| `checklist` | Verification list for a specific area | WCAG accessibility checks |
| `reference` | Background material | exploratory testing type definitions |

Entries are YAML files in `data/knowledge/releases/<version>/entries/`. After editing by hand,
run `qualiow kb sync` to regenerate the manifest and `qualiow kb check` to verify it.

## 6. CLI commands

```bash
qualiow init --dry-run              # preview what init would write
qualiow validate --all              # targets + qa/target.yml + domains + knowledge base
qualiow list sessions               # also: knowledge | targets | domains
qualiow report -s latest -f html -o report.html
qualiow kb check
```

`qualiow explore [url]` is **pre-flight only**: it validates the inputs, creates the session
directory, and prints the `/qa-explore … --session <dir>` command to run inside Claude Code.
It does not drive a browser itself.

There is no `qualiow gather` — it was removed in 2.0.0. Use the `/qa-gather` skill.

### Export session data programmatically

```typescript
import {
  generateHtmlReport,
  generateJsonReport,
  generateJiraExport,
} from 'qualiow-exploratory-testing';

const session = 'output/sessions/2026-09-08-1813-explore-parabank';

// HTML report (standalone, dark-mode, print-friendly)
const html = await generateHtmlReport(session);

// JSON report (structured data for dashboards and CI)
const json = await generateJsonReport(session);

// Jira CSV (bulk import into Jira)
const csv = await generateJiraExport(session);
```

Every export carries the confidentiality header and runs through the same redaction list the
skills apply.

## 7. Beyond the desktop browser

- **Mobile** — `/qa-explore-mobile` runs a session on an iOS Simulator or Android Emulator,
  against a native app or a web app in the real device browser. The machine needs the mobile
  toolchain first: run `qa/bin/setup-mobile.sh`, then `qa/bin/doctor-mobile.sh` until it says
  READY. Full guide: **MOBILE-SETUP.md**.
- **Backend, API and infrastructure** — `/qa-verify-backend` verifies acceptance criteria that
  never reach a screen and produces an AC traceability matrix. Full guide:
  **BACKEND-VERIFICATION.md**.

## What to do next

1. Review the session report and the bug reports
2. Run `/qa-explore-feedback` to mark false positives or note bugs the session missed
3. Configure a target for your own application with `/qa-target-setup`
4. Add domain-specific knowledge so the next session starts smarter
5. Run `/qa-explore-cleanup` to archive completed sessions
