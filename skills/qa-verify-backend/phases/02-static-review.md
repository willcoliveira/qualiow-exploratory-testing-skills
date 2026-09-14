# Phase 2: Static Review

Read the branch against every AC. Use `git show <branch>:<path>` and
`git diff <base>...<branch> -- <path>` — never check out.

## Step 1: Map the Diff to the ACs

```bash
git -C <repo> diff --stat <base>...<branch>
```

Group changed files by AC. Any file group that maps to **no** AC is either scope creep
or an undocumented dependency — both worth a line in the report. Any AC that maps to
**no** file is a candidate `FAIL` before you have read a single line.

**Gate on the size of the change.** 25 or more files, or 1,500 or more changed lines, in
the `--stat` output: invoke the `qa-diff-indexer-agent` sub-agent
(`qualiow:qa-diff-indexer-agent` under a plugin install) with the repo path, the base, the
branch and the AC list from phase 1. It returns an index — file, symbols or resources
touched, line ranges, candidate AC ids, note — plus the two lists that matter here: files
matching no AC, and ACs matching no file. It returns no verdicts and no severities; the
grouping above is still yours. Then read **only the ranges it names**, with
`git show <branch>:<path>`. Never diff the whole branch into context. If sub-agents are
unavailable, do the step yourself as in 2.1.0: read the diff by `--stat` first, then per
file.

## Step 2: Read the Implementation Against Each Claim

Work AC by AC. For each, open the actual resource or handler and compare it to the
claim you wrote in phase 1. Record file and line for evidence.

Read with these lenses:

**Spec drift** — names, types, key shapes, enum values. The ticket says one thing, the
code says another. Even a benign-looking rename (`newImage` → `newConfig`, `PK` →
`entityId`, Map → JSON string) is a finding, because the consumer ticket was written
against the ticket's names.

**Scope** — is anything here that the ticket put explicitly **out of scope**? Storing
data the design said was not needed is not a bonus; it is unreviewed data collection
with privacy and size consequences.

**Least privilege** — enumerate the actions each policy grants and compare to what the
component provably needs. Note permissions created but unattached, and permissions
attached but unused.

**Failure path** — for every asynchronous component: what happens on retry exhaustion,
partial batch failure, oversized payload, missing field, or a downstream throttle? Find
where the error surfaces. If it surfaces nowhere, that is your highest-value finding.

**Uniqueness and ordering** — for anything keyed by time: what is the actual timestamp
granularity, and what happens to two events inside one tick? Collisions in a
write-once store mean silent overwrites.

**Identity propagation** — trace the actor from the token, through the handler, into
the persisted item, into the derived record. Find every place it can silently default
to a placeholder. Check create, update **and delete** separately — deletes routinely
attribute to the wrong person because the only image available is the pre-delete one.

**Documentation** — does any README, diagram or runbook still describe the architecture
this ticket removed? Stale docs fail the DoD line "documentation is created/updated"
and mislead the next engineer.

## Step 3: Verify the Consumer Contract

If the ticket names a downstream ticket, write out the shape that consumer will need
and diff it against what this branch produces. Attribute names, types, key format,
sort semantics. Producer/consumer drift discovered here costs a rename; discovered in
the consumer's sprint it costs a migration of live data.

## Step 4: Check the Tests

```bash
git -C <repo> diff --stat <base>...<branch> -- '*.spec.*' '*.test.*'
```

For each AC, is there a test that would fail if the AC broke? Note tests that were
**deleted** by this branch and not replaced — especially tests whose names described
behaviour that still ought to hold. A deleted test is a removed guardrail.

Record every finding with file, line, AC reference and severity. Write findings to
`evidence/static-review.md` as you go — do not carry them all in context.
