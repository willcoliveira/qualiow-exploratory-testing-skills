# Learned Patterns

_Seeded from community exploratory testing sessions. Add your own via /qa-explore-feedback._

## False Positive Patterns (skip these)

_None yet — patterns added here will be skipped in future sessions._

## Missed Bug Patterns (always check these)

- **Empty state messaging**: Always check what lists/carts/search results show when empty — should display a user-friendly message, not blank space
- **Brute force / account lockout**: Try 5+ failed login attempts — system should lock account or add delay
- **Footer legal links**: Always verify "Terms of Service" and "Privacy Policy" are clickable and lead somewhere
- **Menu active state**: Navigation items should visually indicate the current page/section
- **Checkout completeness**: Real e-commerce checkouts need delivery address, payment method selection, unique order/shipment IDs
- **Quantity controls**: In e-commerce, always test adding multiple of the same item — is there a quantity selector or just add/remove?
- **Content consistency**: Compare all product/item names for consistent formatting patterns
- **Invalid input in ALL text fields**: Try spaces-only, single characters, emojis in every text input — not just injection payloads
- **Duplicate identifiers**: Order IDs, shipment numbers, transaction IDs should be unique across multiple operations
- **Cart state isolation**: Verify cart/session data is cleared on logout — no leakage between users
- **Password storage**: Check forgot-password flow — if it shows the actual password, passwords aren't hashed
- **API surface exposure**: Check for public Swagger UI, API docs, or WSDL/WADL endpoints accessible without auth

## Domain-Specific Insights

### E-commerce
- Empty cart should show "Your cart is empty" message with CTA to continue shopping
- Product descriptions should not contain code syntax visible to end users
- Checkout flow should collect: name, address, payment method, and generate unique order ID
- Price calculations: test with discounts, tax, multiple quantities, $0 totals
- Test ALL user personas if multiple exist — each may have different bugs

### Fintech
- Session IDs should never appear in URLs (security risk)
- Admin pages should require authentication
- Transfer operations need validation: $0, negative amounts, overdraft, same-account transfer
- Financial calculations must handle decimal precision correctly
- Verify transactions appear in BOTH sender and receiver account histories
- Check for MFA/2FA on sensitive operations
- Loan approval should enforce documented requirements (down payment thresholds, terms disclosure)
