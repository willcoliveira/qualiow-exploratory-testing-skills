# Contributing to qualiow

Thanks for helping make AI exploratory testing better.

## Good first contributions

- **QA knowledge** — a heuristic, technique or checklist for `data/knowledge/` (use `/qa-knowledge-add`).
- **Domain profiles** — a YAML profile in `data/domains/` for a domain you know well.
- **False positives** — a session where the agent reported a bug that was not real. These improve the judge.
- **Docs** — anything that confused you while getting started.

## Development

```bash
git clone https://github.com/willcoliveira/qualiow-exploratory-testing-skills
cd qualiow-exploratory-testing-skills
npm ci
npm run build
npm test          # full gate before a PR: npm run lint && npm run check:mirror
```

- Skills and agents are edited in `.claude/skills/` and `.claude/agents/` only; run
  `npm run sync:plugin` to regenerate the `skills/` and `agents/` mirrors (CI fails on drift).
- Never commit credentials, session output or `.auth/`.
- Use [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`).

## Code of conduct

By taking part you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## Security

Please report vulnerabilities privately — see [SECURITY.md](SECURITY.md).
