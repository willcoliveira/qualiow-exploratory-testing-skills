> CONFIDENTIAL: This report may contain internal URLs, security vulnerabilities,
> and application details. Do not share outside your organization without review.

# Session Charter

## Context Source
**Mode:** blind
**Source:** none -- discovering from app

## Business Context
**What this app does:** A small example shop: sign in, search the catalogue, check out.
**Who uses it:** Guest and registered shoppers.
**What matters most:** Completed, correctly priced orders.
**What would break trust:** A charge that does not match the cart.

## Critical User Journeys
1. Sign in -> search -> add to cart -> check out -> order confirmation

## Feature Risk Ranking
| ID | Feature | Risk | Why | Time |
|----|---------|------|-----|------|
| A1 | Login | P0 | Gate to every account action | 15% |
| A2 | Checkout | **P0 -- Critical** | The revenue path | 25% |
| A3 | Search | `P1` | How shoppers find products | 20% |
| A4 | Account settings | P2 | Profile and password changes | 10% |
| A5 | Help pages | P3 | Appended in discovery: static content | 5% |

## Heuristics Selected
- SFDIPOT dimensions: Function, Data, Interfaces
- Test Tours: Money Tour, Bad Neighborhood

## Session Parameters
- Time box: 45 min
- Domain: ecommerce
- Focus: full exploration
- Read-only: false
