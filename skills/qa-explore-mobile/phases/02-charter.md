# Phase 2: Business Context & Charter (Mobile)

Follow `../../qa-explore/phases/02-charter.md` for the structure (use the app as a user,
identify journeys, risk-rank, select heuristics, write charter). The mobile additions below
apply to both modes.

## Use the app as a real user — for ~3 min

Drive the system under test via `$MCLI snapshot` → `click` → `snapshot` loops to reach entry
points (NATIVE: navigate the app's screens; WEB: `open-url` plus in-page links). Don't test
yet — just observe what it exists to do, on a phone-sized screen, the way a real mobile user
would. Note the primary task, where money/data/trust is at stake, and what a frustrated user
on a flaky connection would feel.

Concrete examples:
- **WEB mode:** the SUT is the target's mobile web app (an SPA or responsive site used on
  phones in the field) — high-value areas are typically the login/SSO flow, checkout or the
  core transactional flow, settings, any onboarding wizard, and the mobile form elements.
- **NATIVE mode:** treat the installed app under test the same way — open it, walk its primary
  task (onboarding, the core create/transact/save flow, settings) and note the money/data/
  trust-bearing screens before risk-ranking.

## Optional — load gathered requirements as charter input

If requirements/context were prepared (e.g. via `/qa-gather`, or the user pasted tickets /
acceptance criteria), use them as **charter inputs, not a checklist** — exploratory testing
is not test execution. Requirements tell you what was *deliberately designed*; your job is to
also find what *wasn't* (missing states, unhandled errors, mobile-only gaps). Risk-rank the
feature areas yourself based on blast radius (data loss, money, security, trust) and adjust
from any provided priority order if your observation says otherwise.

## Heuristics — mobile-flavored picks

In addition to qa-explore's SFDIPOT picks, **always select at least 1 mobile-specific
dimension** appropriate to the feature under charter, e.g.:

- Submitting / paying / saving → **Lifecycle** (background mid-submit; airplane mode at submit — does it surface failure or hang?)
- Long forms / multi-step wizards → **Keyboard & rotation** (does the on-screen keyboard occlude the active input? does rotation reflow or break layout?)
- Auth / session-sensitive areas → **Lifecycle / storage** (background 10 min → return: still authenticated? page reloaded or restored?)
- Settings / content-heavy views → **Native a11y** (VoiceOver/TalkBack focus order, dynamic type, contrast)

## Start recording

Replace qa-explore's `tracing-start` with a video:

```bash
$MCLI record-start output/sessions/<session-dir>/videos/session.mp4
```

If recording fails or is too heavy, take frequent screenshots instead. Recording is
nice-to-have, not required.

## Charter additions (append to the qa-explore charter template)

```markdown
## Mobile Context
**Mode:** [native | web]
**Platform:** [android | ios]
**Device:** [device label]
**App under test:** [native: app id + version | web: browser bundle]
**Target URL:** [web mode only: base_url]
**Environment:** [preprod | staging | production]

## Requirements Input (if provided)
**Source:** [gathered context / ticket / acceptance criteria / none — blind]
**Areas referenced:** [list]
**Areas excluded from this session (and why):** [e.g. requires hardware not on sim, biometrics, etc.]
```

**Update progress:** charter complete + platform info recorded.
