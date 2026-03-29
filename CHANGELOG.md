# Changelog

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
