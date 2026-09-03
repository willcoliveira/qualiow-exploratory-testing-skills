# Payload Verification — Is the Number Right, and Is It Still Right on Screen?

An endpoint returning `200` with a well-shaped body has proven almost nothing. Two
questions remain, and they fail independently:

1. **Are the values correct?** — and, more sharply, *what would prove they are not?*
2. **Does the value the user sees equal the value the service sent?**

Companion to `phases/03b-api-verification.md` and `phases/04-e2e-trigger.md`.

## 1. Recompute Every Derived Value From the Payload

Percentages, totals, ratios, deltas, aggregates and currency conversions are derived. Get
the formula from the specification — not from the code that implements it — and recompute
each one from the raw figures in the **same response**.

```
metric      raw            ÷ base          computed    API      ✓
rate A       12,500.00      ÷ 50,000.00     25.0000%    25.0     ok
rate B       −4,000.00      ÷ 50,000.00     −8.0000%    −8.0     ok
```

Choose the cases deliberately:

- **A negative.** Sign handling is where derivation breaks, and a screen full of positive
  numbers never exercises it.
- **A zero, and a zero denominator.** Division by zero, and the difference between `0`,
  `null` and "not applicable".
- **A large value and a small one.** Rounding, precision loss and scale bugs live at both ends.
- **One item and many.** An aggregate over a single item should equal that item — the
  cleanest apples-to-apples case there is, and the one to reach for first.

### Add the structural invariants

Relationships the values must satisfy regardless of magnitude — `gross ≤ net`, a derived
cost positive, a total equal to the sum of its parts, a percentage within its own range.
These catch a whole class of error without needing a second source, and they are cheap.

### Then say what it does not prove

**This is the part that gets left out.** When both sides of the check come from the same
payload, you have verified the *derivation*, not the *inputs*. The service can be
computing a percentage flawlessly from a figure that is itself wrong.

Write that limitation into the report explicitly, and name the **independent oracle** that
would close it — a second system holding the same figure, a report, a database the number
is sourced from, a spreadsheet the business already trusts. Then say whether you ran it.
"Internal consistency verified; the outstanding oracle is X and it has not been run" is an
honest and useful verdict. "The numbers are correct" is not, when they came from one place.

## 2. Compare the Rendered Value Against the Payload Value

For every number on screen, hold the raw response next to it. The API can be right and the
screen wrong — and that defect is invisible from any API tool, and invisible from the
screen alone unless you look at both.

The recurring cause is a **formatting helper that guesses**. A pipe or formatter that
inspects the value to decide what it is:

```
value > 1 ? value : value * 100      // "is this a ratio or a percentage?"
```

The guess is right for most of the range and silently wrong for the rest — here, for every
percentage at or below 1, which renders 100× too large. It is worth probing any formatter
for this shape directly: feed it a value on each side of whatever threshold it tests.

Other shapes to check, with the payload open beside the screen:

- **Rounding that changes the answer**, not just the display — a value rounded before a
  comparison or a threshold.
- **A unit or currency applied twice, or not at all.**
- **Truncation presented as a total** — "1/240" beside "42%" is a self-contradicting tile,
  and one of the two is a lie.
- **A field the client silently drops** because it does not render it — invisible until a
  consumer needs it.
- **Locale formatting that is consistent but never proven causal.** A setting whose current
  value happens to match the output proves nothing until you *change* the setting and watch
  the output follow.

When the rendered value is wrong, **attribute it to the right change**. A correct payload
corrupted on the way to the screen is not the backend ticket's defect; it usually belongs
to a different commit, frequently one that is deployed on one environment and not another.
Say which change owns it, and say plainly that the change under test is not at fault.

## 3. Measure Timing Where the User Experiences It

Wrap the request in the page rather than trusting a server-side metric:

```js
const t0 = performance.now();
const r = await fetch(url, { credentials: 'include' });
await r.text();
const ms = Math.round(performance.now() - t0);
```

Call each endpoint **cold and then warm** — first call, second, third — and record all
three. A cold path an order of magnitude slower than the warm one is a real user
experience that no averaged dashboard will show you, and it is the one every user gets
first. Note which records were inside whatever cache or recency window the feature has,
because that is usually what separates the two numbers.

## 4. What to Write Down

| Record | Why |
|--------|-----|
| The formula, and where it came from | A formula taken from the implementation cannot falsify the implementation |
| Every computed-vs-returned pair | The evidence, not the conclusion |
| The structural invariants checked | Cheap, and they generalise past the cases you picked |
| **What the check does not prove** | The single most important line in the section |
| The independent oracle, and whether it was run | Turns an open question into a next action |
| Cold and warm timings per endpoint | An average hides the number the user feels |
