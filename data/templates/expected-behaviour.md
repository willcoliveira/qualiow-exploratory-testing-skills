# Expected Behaviour Specification

> CONFIDENTIAL — internal QA artifact.

Use this when a verification session finds behaviour nobody wrote an acceptance criterion
for — which is most of what an API probe turns up. A bug report says *this is wrong*. This
says *here is what right looks like*, in enough detail that someone can implement it and
someone else can verify it. It is frequently the most valuable artifact a session produces,
because it converts a pile of findings into one reviewable decision.

Write it **per area**, not per case. Ten failing inputs that share a cause are one section.

## Header

| Property | Value |
|----------|-------|
| Date | [YYYY-MM-DD] |
| Endpoint / surface | [`POST /api/v1/…` — note the verb] |
| Environment(s) observed | [name, and the build each one was running] |
| Source findings | [link to the session that produced the observations] |
| Status | [proposed / agreed / implemented] |

---

## [N]. [Area — e.g. Minimum input length]

**Observed**

> What the system does today, as evidence. Exact request, exact status, exact response.
> Note which environments it holds in — behaviour frequently differs, and that difference
> is part of the finding.

```
{"query":"L"}  →  200 / <the entire collection>   [alpha]
{"query":"L"}  →  200 / 0                        [beta]
```

**Expected**

> What it should do. Numbered, falsifiable statements — each one a testable assertion, not
> a sentiment. Include the boundary values themselves.

- An input whose tokens are all below the minimum → **`400`**, with the minimum named in
  the message.
- "No usable tokens after filtering" and "no query supplied" are **different branches**.
  Neither falls through to a match-all.
- The match-all path is not reachable from this parameter at any input. If "browse
  everything" is wanted, it is an explicit endpoint with a hard server-side cap.
- The minimum is **N**, matching the existing rule, so that [known-good short inputs] keep
  working.
- Client: no request fires below N; the user sees a hint rather than an empty result.

### Decisions this section forces

State them explicitly — leaving them implicit is how a spec gets implemented three
different ways:

- **Reject, or clamp?** *Reject.* Silently serving a different page size than was asked for
  breaks every caller that trusts the value back.
- **`400`, or a silent empty result?** *`400`.* A silent zero is indistinguishable from a
  genuine no-match, and it will be read as data.
- **Where does validation live?** At the layer that covers **every** implementation of the
  feature — not in one of two code paths, and never only in the client.
- **What must not change?** List the valid inputs and their current answers, so the fix is
  verifiable as non-breaking.

---

## Priority

Rank the areas by what is reachable by real users **today**, not by how bad each one reads.
Name explicitly which finding is live in production right now, and which only appears in an
environment nobody ships from — the two need very different urgency, and the difference is
invisible unless someone says it.

---

## Reply — plain English

> Ready to paste into a ticket comment, a pull request or a chat reply. Same content, no
> jargon, no status codes unless they carry meaning to the reader. Written for the person
> who has to decide whether to fund the fix.

For each area, in a short paragraph:

- **What happens**, in a sentence a non-engineer can picture.
- **Whether it is live for users**, and where.
- **What the fix is**, in outline — enough to size it, not enough to design it.
- **Where you agree with their reading**, if they proposed one, and precisely where you do
  not, and why.

Close with the one thing you would put ahead of everything else in the list, and the reason
— usually that it is the only one users are hitting today.
