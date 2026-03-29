# @qualiow/exploratory-testing

qualiow -- AI-powered exploratory testing skills using Claude Code + Playwright CLI.

Claude acts as a Principal QA Engineer: it explores web applications systematically, finds bugs, and generates structured reports. No test scripts, no framework -- just AI reasoning, browser commands, and QA heuristics.

## How to Install This Project

### Prerequisites

- Node.js >= 18
- Playwright CLI (`npm install @playwright/cli`)
- Claude Code (for running exploratory sessions)

### Quick Start

```bash
# install globally
npm install -g @qualiow/exploratory-testing

# initialize in your project
qualiow init

# run your first session
/qa-explore https://your-app.com
```

### Local Development

```bash
# clone the repository
git clone https://github.com/willcoliveira/qualiow-exploratory-testing-skills.git
cd qualiow-exploratory-testing-skills

# install dependencies
npm install

# build
npm run build

# run tests
npm test
```

## How to Run the CLI

| Command | Description |
|---------|-------------|
| `qualiow init` | Initialize qualiow in the current project |
| `qualiow explore [url]` | Run an exploratory testing session |
| `qualiow validate` | Validate all configuration files (targets, knowledge, domains) |
| `qualiow report` | Generate a report from an existing session |
| `qualiow list <type>` | List sessions, knowledge, targets, or domains |
| `qualiow gather` | Gather and analyze requirements for testing context |

## How to Run Exploratory Sessions

### Full session (45 minutes)

```bash
# explore a public site by URL
/qa-explore https://testers.ai/testing/
```

```bash
# explore using a saved target configuration
/qa-explore --target company-staging
```

### Quick focused session (15 minutes)

```bash
# check a single page or feature
/qa-explore-quick https://app.example.com/checkout
```

### Generate or regenerate a report

```bash
# regenerate report for an existing session
/qa-explore-report output/sessions/2026-03-28-parabank
```

### Add knowledge to the base

```bash
# add new heuristics, techniques, or documentation
/qa-knowledge-add
```

### Set up a new target

```bash
# configure authentication, scope, and domain for a target app
/qa-target-setup
```

## How to Generate Reports

qualiow produces three report formats from session data.

### HTML report

Self-contained dark-mode HTML with severity cards, bug details, coverage map, and recommendations. Print-friendly.

```bash
# from TypeScript
import { generateHtmlReport } from '@qualiow/exploratory-testing';
const html = await generateHtmlReport('output/sessions/2026-03-28-parabank');
```

### JSON report

Structured JSON for programmatic consumption -- dashboards, CI integrations, metrics tracking.

```bash
# from TypeScript
import { generateJsonReport } from '@qualiow/exploratory-testing';
const data = await generateJsonReport('output/sessions/2026-03-28-parabank');
```

### Jira CSV export

CSV importable via Jira bulk import. Maps severity to Jira priority (Critical -> Blocker, High -> Critical, Medium -> Major, Low -> Minor).

```bash
# from TypeScript
import { generateJiraExport } from '@qualiow/exploratory-testing';
const csv = await generateJiraExport('output/sessions/2026-03-28-parabank');
```

## How to Use Skills in Claude Code

| Skill | Purpose |
|-------|---------|
| `/qa-explore` | Full exploratory testing session (45 min) |
| `/qa-explore-quick` | Quick focused session on a single page or feature (15 min) |
| `/qa-explore-report` | Generate or regenerate report from existing session |
| `/qa-explore-feedback` | Post-session feedback capture (false positives, missed bugs) |
| `/qa-explore-cleanup` | Session cleanup and archival |
| `/qa-knowledge-add` | Add new heuristics, techniques, docs to knowledge base |
| `/qa-knowledge-list` | Browse the knowledge base |
| `/qa-target-setup` | Configure a new target application (auth, scope, domain) |
| `/qa-gather` | Gather and analyze requirements from files, URLs, or text |

## Project Structure

```
qualiow-exploratory-testing-skills/
  src/
    cli/
      index.ts                # CLI entry point (commander)
      commands/               # CLI command handlers
    formatters/
      html-report.ts          # standalone dark-mode HTML report
      json-report.ts          # structured JSON report
      jira-export.ts          # Jira-importable CSV
      index.ts                # re-exports
    schemas/                  # Zod validation schemas
    types/                    # TypeScript type definitions
    utils/
      metrics.ts              # session metrics (JSONL append/read)
      parse-session.ts        # parse session dirs into structured data
      redact.ts               # credential and secret redaction
      validate.ts             # YAML config validation
    index.ts                  # public API re-exports
  data/
    knowledge/                # YAML knowledge base (heuristics, techniques)
    templates/                # bug report, session report, charter templates
    targets/                  # target application configs
    domains/                  # domain-specific testing focus
    security/                 # security policy
  output/
    sessions/                 # session outputs (reports, bugs, screenshots)
  tests/
    unit/                     # unit tests (vitest)
    fixtures/                 # test fixture data
    benchmarks/               # performance benchmarks
  docs/
    GETTING-STARTED.md        # detailed setup and usage guide
    ARCHITECTURE-DECISIONS.md # architecture decision records
```

## Tech Stack

| Technology | Purpose |
|------------|---------|
| TypeScript | type-safe source code |
| Node.js >= 18 | runtime |
| Playwright CLI | browser control for AI agents |
| Claude Code | AI reasoning and session orchestration |
| Handlebars | HTML report templating |
| Zod | runtime schema validation |
| Commander | CLI argument parsing |
| Vitest | unit and integration testing |
| tsup | TypeScript bundling |
| YAML | configuration and knowledge base format |

## Key Principles

- Systematic exploration, not random clicking
- Understand the business first, then test what matters
- Risk-rank features: P0 (40% time), P1 (30%), P2 (20%), P3 (10%)
- Apply heuristics as thinking tools, not checklists
- One bug = one report, with mandatory business impact
- Log findings in real-time with WHY reasoning, not just WHAT
- Cap sessions at 45 min to avoid context overflow
- Save phase findings to disk between phases
- Verify data integrity after every state-changing action
- Never store credentials in YAML -- use env vars via .env

## License

MIT -- see [LICENSE](LICENSE) for details.
