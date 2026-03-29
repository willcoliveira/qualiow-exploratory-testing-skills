# Getting Started with Qualiow

Step-by-step guide to running your first AI-powered exploratory testing session.

## 1. How to Install

### System requirements

- Node.js >= 18 (check with `node --version`)
- npm >= 9 (ships with Node.js 18+)
- Claude Code installed and configured

### Install the package

```bash
npm install -g @qualiow/exploratory-testing
```

### Install Playwright CLI

Playwright CLI is the browser control layer. Install it as a project dependency or globally.

```bash
npm install @playwright/cli
```

### Verify the installation

```bash
qualiow --version
```

## 2. How to Run Your First Session

### Option A: Explore a public test site

Pick a public test application. Good candidates for a first run:

| Site | URL | Domain |
|------|-----|--------|
| SauceDemo | https://www.saucedemo.com | ecommerce |
| ParaBank | https://parabank.parasoft.com/parabank/index.htm | fintech |
| DemoQA | https://demoqa.com | general |

Start a session inside Claude Code:

```bash
/qa-explore https://www.saucedemo.com
```

Claude will:
1. Launch a browser via Playwright CLI
2. Read the knowledge base for applicable heuristics
3. Explore the site across 3-4 phases (discovery, functional, edge cases, synthesis)
4. File individual bug reports in `output/sessions/<session-id>/bugs/`
5. Write a session report at `output/sessions/<session-id>/session-report.md`

### Option B: Quick check on a specific page

If you only want to test one page or feature:

```bash
/qa-explore-quick https://app.example.com/checkout
```

This runs a 15-minute focused session on the target page.

## 3. How to Understand the Output

After a session, qualiow creates this directory structure:

```
output/sessions/<session-id>/
  charter.md              # what was tested and why
  phase-1-discovery.md    # discovery phase findings
  phase-2-functional.md   # functional testing findings
  phase-3-edge-cases.md   # edge case and adversarial findings
  session-report.md       # final report with all bugs, observations, recommendations
  bugs/
    BUG-001.md            # individual bug report
    BUG-002.md
    ...
  screenshots/
    01-login-page.png     # evidence screenshots
    ...
```

### Bug report structure

Each bug report contains:

- **Title** -- `[Component] fails [Condition] causing [Impact]`
- **Severity** -- Critical, High, Medium, or Low (conservative by design)
- **Steps to Reproduce** -- numbered list, specific enough to reproduce
- **Expected vs Actual Behavior** -- clear comparison
- **Business Impact** -- revenue, trust, regulatory, data risk, and scale
- **Evidence** -- screenshots, console errors, network failures

### Session report structure

The session report aggregates all findings:

- Executive summary with key risk areas
- Bug table with severity distribution
- Coverage map showing which areas were tested
- Observations (not bugs, but worth discussing)
- Recommendations for follow-up testing

## 4. How to Configure a Target

For repeated testing of the same application, create a target config.

### Generate a target config interactively

```bash
/qa-target-setup
```

### Or create one manually

Create a YAML file at `data/targets/<target-name>.yml`:

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

### Run with the target config

```bash
/qa-explore --target my-app
```

### Authentication strategies

| Strategy | When to use | Setup |
|----------|-------------|-------|
| `none` | Public sites, no login required | Default |
| `storage_state` | Sites with cookie/session auth | Run `state-save` in Playwright CLI after manual login |
| `credentials` | Username/password login | Set in `.env`, reference with env vars |
| `token` | API token or bearer auth | Set in `.env` |

Store credentials in `.env` (gitignored), never in YAML:

```bash
# .env
MY_APP_USERNAME=testuser
MY_APP_PASSWORD=testpass123
```

## 5. How to Add Knowledge

The knowledge base drives Claude's testing strategy. Add domain-specific heuristics, techniques, or checklists.

### Add knowledge interactively

```bash
/qa-knowledge-add
```

### Browse existing knowledge

```bash
/qa-knowledge-list
```

### Knowledge types

| Type | Purpose | Example |
|------|---------|---------|
| `heuristic` | Mental model or framework for exploration | SFDIPOT, FEW HICCUPPS |
| `technique` | Specific testing method | boundary testing, error guessing |
| `checklist` | Verification list for a specific area | WCAG accessibility checks |
| `reference` | Background material | exploratory testing type definitions |

Knowledge entries are YAML files in `data/knowledge/releases/<version>/entries/`.

## 6. How to Use CLI Commands

### Validate all configuration files

```bash
qualiow validate
```

Checks all target configs, knowledge entries, and domain configs against their schemas.

### List resources

```bash
# list all sessions
qualiow list sessions

# list knowledge entries
qualiow list knowledge

# list configured targets
qualiow list targets

# list domain profiles
qualiow list domains
```

### Generate reports from an existing session

```bash
qualiow report
```

Or use the skill for more control:

```bash
/qa-explore-report output/sessions/2026-03-28-parabank
```

### Export session data programmatically

```typescript
import {
  generateHtmlReport,
  generateJsonReport,
  generateJiraExport,
} from '@qualiow/exploratory-testing';

// HTML report (standalone, dark-mode, print-friendly)
const html = await generateHtmlReport('output/sessions/2026-03-28-parabank');

// JSON report (structured data for dashboards and CI)
const json = await generateJsonReport('output/sessions/2026-03-28-parabank');

// Jira CSV (bulk import into Jira)
const csv = await generateJiraExport('output/sessions/2026-03-28-parabank');
```

## What to Do Next

After your first session:

1. Review the session report and bug reports
2. Use `/qa-explore-feedback` to mark false positives or note missed bugs
3. Configure a target for your own application
4. Add domain-specific knowledge for better coverage
5. Run `/qa-explore-cleanup` to archive completed sessions
