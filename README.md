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

### Mobile session (simulator/emulator)

Runs a full exploratory session on an iOS Simulator or Android Emulator — either a
**native app** (the installed app is the system under test) or a **mobile web app in the
real device browser** (iOS Simulator Safari / Android Emulator Chrome — the genuine
engines, which Playwright cannot drive). The mode comes from the target config.

#### 1. One-time machine setup

```bash
# installs everything scriptable: Maestro, JDK 17, Android SDK + Google-Play AVD
# (qa_pixel_api35), ios-webkit-debug-proxy, and the qa-iphone simulator device
scripts/setup-mobile.sh              # add --android or --ios to scope; --yes for non-interactive
```

Two iOS steps are genuinely manual (the script prints them if needed):

```bash
# a) install Xcode from the App Store, then:
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
sudo xcodebuild -license accept
# b) if no iOS runtime is installed:
xcodebuild -downloadPlatform iOS
# then re-run scripts/setup-mobile.sh --ios (creates the qa-iphone simulator)
```

#### 2. Verify readiness (read-only, run before every first session on a machine)

```bash
scripts/doctor-mobile.sh             # or --ios / --android; fix each ✗ until READY
```

#### 3. Create a target and run

Copy a template from `data/targets/`, rename it, and point it at your app:

| Template | What it tests | Driver |
|----------|---------------|--------|
| `_example-native-mobile.yml` | An installed iOS/Android app (native mode) | mobile-cli (Maestro) |
| `_example-sim-ios-safari.yml` | A mobile web app in REAL iOS Simulator Safari | mobile-cli (Maestro) |
| `_example-sim-android-chrome.yml` | A mobile web app in REAL Android Emulator Chrome | mobile-cli (Maestro) |
| `_example-mobile-emulation.yml` | A mobile web app via Playwright device emulation (no simulator) | `/qa-explore` (playwright-cli) |

```bash
/qa-explore-mobile --target my-mobile-target     # real sim/emulator (native or web)
/qa-explore --target my-emulation-target         # Playwright mobile emulation
```

#### 4. Driving the device manually (what the skill does under the hood)

```bash
# Android: boot the standard AVD              # iOS: boot the standard simulator
~/Library/Android/sdk/emulator/emulator \
  -avd qa_pixel_api35 -no-snapshot &          xcrun simctl boot qa-iphone && open -a Simulator

export MOBILE_CLI_STATE=/tmp/my-target-state.json   # isolate this session's device/app state
bin/mcli set-device emulator-5554            # or the iOS sim UDID (xcrun simctl list devices)
bin/mcli set-app com.android.chrome          # or com.apple.mobilesafari, or your app's id
bin/mcli launch
bin/mcli open-url https://staging.m.example.com     # web mode only
bin/mcli snapshot                            # page/app as tappable refs e1, e2, ...
bin/mcli fill e4 my-username
bin/mcli snapshot                            # ALWAYS re-snapshot after the keyboard appears
bin/mcli click e7
bin/mcli screenshot /tmp/evidence.png
bin/mcli logs --errors --since 60
bin/mcli --help                              # full command surface
```

iOS Safari web targets additionally get real JS/DOM access via the WebKit bridge:

```bash
bin/wk-ios 'document.title'                                   # eval JS in the sim's Safari
bin/wk-ios 'document.querySelectorAll(".cart_item").length'   # exact-DOM assertions
bin/wk-ios --stop                                             # stop the proxy after the session
```

Notes that save time:
- **Never `relaunch-clean` a web target** — it wipes the logged-in browser profile.
- SSO/MFA logins are done **once, by hand, on the device**; the browser profile persists
  the session. There is no transferable `storage_state` on a real device browser.
- Use `bin/wadb` for raw adb commands (logcat, `pm`, `am`) — it sets `ANDROID_HOME` for you.
- Full setup guide + troubleshooting: `docs/MOBILE-SETUP.md`.

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
| `/qa-explore-mobile` | Exploratory session on a simulator/emulator — native apps or mobile web in the real device browser (iOS Safari / Android Chrome) |
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
