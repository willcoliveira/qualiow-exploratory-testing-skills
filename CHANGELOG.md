# Changelog

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
