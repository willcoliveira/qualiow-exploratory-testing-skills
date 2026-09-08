---
name: qa-target-setup
description: >
  Interactive setup for a new target application. Navigates to the URL, detects auth requirements,
  walks through login flow creation, auto-detects scope, and saves target config.
  Use when user says: "setup target", "add target", "configure app", "new target".
argument-hint: "<url> [--name <id>] [--shared]"
allowed-tools: Bash(playwright-cli:*), Bash(npx playwright-cli:*), Bash(npx playwright:*), Read, Write, Glob, Grep
---

# Target Application Setup

Interactive wizard that writes a target config. By default it writes the **project-local**
`qa/target.yml` (the file every session skill reads when no `--target` is given; see
`${CLAUDE_SKILL_DIR}/../qa-explore/references/paths.md`). With `--shared`, it writes
`data/targets/<name>.yml` instead, for a target the whole team shares by name. Keep internal
hostnames in `qa/target.yml` or in `data/targets/local-*.yml` (both gitignored patterns).

Security: `${CLAUDE_SKILL_DIR}/../qa-explore/references/security-rules.md` applies (the
production rule decides the `safety:` block; never write a credential value into YAML).
The fields written here are what the session skills read to fill `**Environment:**` and the
session metadata in `${CLAUDE_SKILL_DIR}/../qa-explore/references/output-contract.md`, so
`id`, `environment.kind` and `base_url` must be the real ones.

## Flow

### 1. Gather Basic Info

Ask the user for:
- **Target name** (slug, e.g. `company-staging`; becomes `id:` and, with `--shared`, the filename)
- **Base URL** (e.g. `https://staging.company.com`)
- **Domain type** (`ecommerce`, `saas`, `fintech`, `marketing`, `identity`, or auto-detect against `<data>/domains/*.yml`)

Apply the production rule to the hostname now and tell the user what it decided.

### 2. Navigate and Analyze

Use the session id `-s=setup-<HHmm>-<name>` on every command (omitted below):

```bash
playwright-cli open <base_url>
playwright-cli snapshot
```

From the snapshot, detect:
- Is this a login page? (password fields, "Sign in" buttons)
- What's the main navigation structure?
- What kind of application is this? (helps auto-detect the domain)

### 3. Handle Authentication

**If no login detected:** set `auth.strategy: none` and skip to step 4.

**If login detected**, ask which strategy to use:

**Option A: Storage State (recommended)**
1. Ask the user for the env var **names** for username and password (values go in `qa/.env`).
2. Log in via playwright-cli, reading the values from `qa/.env` (never echo them):
   ```bash
   playwright-cli snapshot  # find form fields
   playwright-cli fill <email_ref> "<username value>"
   playwright-cli fill <password_ref> "<password value>"
   playwright-cli click <submit_ref>
   ```
   If the identity provider needs MFA, reopen headed (`playwright-cli open <login_url> --headed`) and let the user complete it by hand; never automate an MFA challenge.
3. Verify login succeeded (snapshot shows dashboard/profile).
4. Save state: `playwright-cli state-save .auth/<name>.json`
5. Set `auth.strategy: storage_state` with `state_file: ".auth/<name>.json"`, plus `auth.credentials.username` / `auth.credentials.password` naming the env vars so a session can re-login when the state expires.

**Option B: Token**
1. Ask for the token env var name and the injection method (cookie or localStorage).
2. Set `auth.strategy: token`, `auth.token: <ENV_VAR_NAME>`.

### 4. Detect Scope

After login (or on the landing page):
```bash
playwright-cli snapshot
```

From the snapshot, identify:
- Top-level navigation sections → suggest as `scope.start_pages`
- Suggest `scope.include_patterns` based on the URL structure
- Suggest `scope.exclude_patterns` for common exclusions (`/admin`, `/api`, `*.pdf`)
- `scope.max_depth` (default 3)

Ask the user to confirm/modify scope.

### 5. Configure Browser Settings

Suggest defaults:
- `headless: false` (so the user can watch)
- `viewport: { width: 1280, height: 720 }`
- Ask whether mobile emulation is needed (`browser.device`, e.g. `iPhone 15`, used with `playwright-cli open --device="iPhone 15"`, or `--mobile` for a generic mobile device — the two flags are mutually exclusive, and `--mobile` is unsupported on Firefox)

### 6. Safety Settings

- If the production rule fired, or the user says this is production: `safety.read_only: true`, `safety.no_form_submit: true`.
- Otherwise: `safety.read_only: false`, `safety.no_form_submit: false`.

### 7. Save Config

Write `qa/target.yml` (default) or `data/targets/<name>.yml` (`--shared`) with all gathered
configuration; `id` equals the target name. Then close the session:

```bash
playwright-cli close
playwright-cli delete-data
```

Update `qa/.env.example` (create it if missing) with every env var name the config references,
each as a commented `# NAME=` line. Never write values.

### 8. Confirm

Present the saved config to the user:
- Target name and URL
- Auth strategy configured
- Scope defined
- How to use: `/qa-explore` (picks up `qa/target.yml`) or `/qa-explore --target <name>` for a shared target

### 9. Optional — Offer Playwright Test Agents Bootstrap

If the user plans to author full Playwright tests against this target later (not just
exploratory sessions), offer to scaffold the Test Agents workspace now while credentials and
scope are already loaded:

```bash
npx playwright init-agents --loop=claude
```

With `--loop=claude` this writes the planner / generator / healer definitions into
`.claude/agents/`, a `.mcp.json` registering the `playwright-test` server, and a `specs/`
scaffold with a seed spec if the project has none (Playwright 1.56+; other loops: `codex`,
`copilot`, `opencode`, `vscode`, `vscode-legacy`). It is **strictly optional**; declining does not affect
the target config just written. If the user accepts, note in the config's `notes` field that
Test Agents are scaffolded.

This step requires `@playwright/test` and a `playwright.config.*` in the target project. If
either is missing, skip it silently.
