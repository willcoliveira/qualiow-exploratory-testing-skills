# Release Readiness — Verifying a Set of Tickets at Once

A release check is not a longer ticket verification. Fifteen tickets in one environment
raise a different question — *what is actually in this build, and what does that make each
ticket's result mean?* — and the answer changes if a deploy lands mid-session.

Use this when the ask is "is this release good to go" rather than "does this ticket meet
its ACs".

## Step 1: Establish the Build, Once, for Everything

Fingerprint every component before touching any ticket
(`references/environment-fingerprinting.md`). Then list, per ticket, whether the commit it
depends on is actually in the deployed build:

```bash
git -C <repo> merge-base --is-ancestor <ticket-commit> <deployed-commit> \
  && echo DEPLOYED || echo NOT DEPLOYED
```

This single table reclassifies half the session before any testing happens. A ticket whose
backend is not deployed is **not testable here** — it is not a failure, and testing its UI
will produce a convincing, meaningless result: the frontend ships the feature, the API does
not answer, and it renders as dashes, zeros or empty values that look exactly like a data bug.

## Step 2: Give Every Ticket a Result From a Fixed Vocabulary

| Result | Means |
|--------|-------|
| **Clean pass** | Every AC met, with evidence |
| **Pass with caveats** | The feature works; named ACs remain unproven or a defect is open against it |
| **Fail** | An AC is not met in this build |
| **Not testable here** | The dependency is not deployed or not selected in this environment |
| **Not tested** | In scope, not reached. Say so — never let it disappear into a summary |

Lead with the counts, then one row per ticket carrying the evidence. A reader deciding
whether to ship needs the shape of the release in the first ten seconds.

## Step 3: Keep a Coverage Map That Admits What It Did Not Do

The most valuable column in a release report is the empty one. Use four states, not two:

| State | Means |
|-------|-------|
| ✅ tested and passing | Observed, with evidence |
| ⚠️ partially tested | Exercised, but a named part of the AC was not |
| ❌ not tested | In scope, never reached |
| 🔍 code-verified only | Read in the source and believed. **Not a pass** — this is `UNVERIFIABLE` |

Two distinctions worth being pedantic about, because both routinely produce a false pass:

- **Consistent is not causal.** A setting whose current value matches the output proves
  nothing. Change the setting and watch the output follow, or record it as partial.
- **The data has to reach the case.** "Negative values render in the negative colour"
  cannot be verified against records that are all zero. If no reachable record exercises
  the AC, that AC is untested — find one, create one, or say plainly that it is unproven
  and name what data would settle it.

Then say, in one line, **which untested item is the biggest risk**. That sentence is what
the reader acts on.

## Step 4: Separate Carry-Overs From This Release's Findings

Defects you find that pre-date the change under test get their own section: *pre-existing,
not caused by these tickets, tracked separately*. Mixing them into the release's results
inflates the apparent risk of shipping and buries the findings that actually belong to it.

The same applies in reverse — a defect that only appears because two changes met in this
build belongs to the release even though neither ticket owns it alone.

## Step 5: Handle a Deploy Landing Mid-Session

It happens, and it invalidates everything measured before it. When it does:

- Re-fingerprint immediately, and record both build ids.
- Keep the pre-deploy findings in their own file rather than deleting them — they are the
  evidence for what the previous build did.
- Re-run the affected checks and state clearly which build each result refers to.
- Never merge pre- and post-deploy results into one table.

## Step 6: Recommend a Disposition, and Say What Would Change It

End with one line: **ship**, **ship with follow-ups**, or **hold** — followed by the
condition that would change your mind. Where the scope of your check was narrower than the
question being asked, say so in the same breath: *"feature functionality verified;
absolute value accuracy is out of scope and validated by the product team"* is a
recommendation someone can act on. A recommendation with an unstated scope is one someone
will over-read.

## Comparing Against a Baseline

When a ticket's effect is a change in a number — more results, faster responses, a
different count — get the before figure from the same place you will get the after figure,
and state the tolerance. Data drifts: a few per cent on a large, live collection is churn,
not a regression. And where a system-wide figure and a per-user figure disagree, name which
one describes the behaviour the feature actually changed.
