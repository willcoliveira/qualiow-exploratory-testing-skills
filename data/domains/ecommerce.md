# Domain: E-Commerce

## Priority Areas

1. **Checkout Flow** - Cart to payment confirmation must be rock solid
2. **Payment Processing** - All payment methods work, edge cases handled
3. **Product Catalog** - Search, filter, sort, and display accuracy
4. **Pricing & Calculations** - Discounts, coupons, tax, and totals are precise
5. **Inventory Management** - Stock levels, availability, and oversell prevention
6. **User Accounts** - Registration, profiles, order history, saved addresses
7. **Shipping & Returns** - Rate calculation, tracking, return/refund flows

## Feature Risk Ranking

| Tier | Features                                              | Rationale                                                        |
|------|-------------------------------------------------------|------------------------------------------------------------------|
| P0   | Checkout, payment processing, cart, pricing/totals    | Direct revenue. A broken checkout = lost sales. A pricing bug = financial loss or legal liability. |
| P1   | Product catalog, search, authentication               | Users cannot buy what they cannot find. Auth gates the account experience. |
| P2   | Reviews & ratings, wishlist, filters & sort           | Enhance discovery and trust but do not block purchase.           |
| P3   | About page, contact page, social media links          | Informational. Rarely blocks a transaction.                      |

## Completeness Checklist

> Minimum features an e-commerce site should have. Verify these exist and function before deep-testing.

- [ ] Cart displays items with name, image, price, and quantity
- [ ] Cart quantity can be increased, decreased, and item removed
- [ ] Empty cart shows a helpful message and a link to continue shopping
- [ ] Delivery/shipping address form with validation
- [ ] Payment method selector (at least one method functional)
- [ ] Order summary visible before final confirmation with itemized totals
- [ ] Order confirmation page with a unique order ID
- [ ] Confirmation email or receipt sent after purchase
- [ ] Order history accessible from user account
- [ ] Guest checkout option (or clear account creation prompt)

## Data Integrity Checks

> After every state-changing action in e-commerce, verify these calculations and data flows.

1. **Item price x quantity = line total** -- Check for every line item in the cart and in the order confirmation. Watch for rounding issues with discounts.
2. **All line totals + shipping + tax - discounts = order total** -- Verify on the cart page, checkout summary, confirmation page, and confirmation email. All four should match.
3. **Inventory decremented after purchase** -- If stock count is visible, verify it decreases by the purchased quantity. Verify out-of-stock messaging appears when inventory hits zero.
4. **Order appears in history** -- After completing checkout, the order should immediately appear in the user's order history with correct items, quantities, totals, and status.
5. **Coupon/discount applied correctly** -- Discount shows as a line item, subtotal adjusts, and the discount does not apply to items it should not (e.g., excluded categories).
6. **Price consistency** -- The price on the product page, in the cart, at checkout, and on the confirmation must all match (accounting for any discounts applied).

## Cross-Feature Journeys

> These end-to-end flows cross multiple features. Bugs hide at the boundaries.

### Journey 1: Browse to Purchase
`Browse Catalog -> Add to Cart -> Proceed to Checkout -> Enter Shipping -> Select Payment -> Confirm Order -> View Order History`
- Verify: item details persist from catalog through confirmation, totals are correct at every step, order appears in history with correct status.

### Journey 2: Search to Purchase
`Search for Product -> Apply Filters -> Open Product Detail -> Select Variant -> Add to Cart -> Checkout`
- Verify: search results match filters, selected variant (size/color) carries into cart correctly, price reflects variant choice.

### Journey 3: Full Account Lifecycle
`Register -> Login -> Browse -> Add to Cart -> Purchase -> Logout -> Login Again -> View Order History`
- Verify: registration completes, cart persists across login, order history is accessible after re-login, all data is consistent.

## Must-Test Patterns

### Product Catalog
- Search returns relevant results for exact and partial matches
- Filters narrow results correctly (price range, category, size, color)
- Sort options work (price low-high, high-low, newest, rating)
- Product images load and zoom functions work
- Product variants (size, color) update price and availability
- Out-of-stock items display clear messaging
- Pagination or infinite scroll loads correctly
- Category navigation reflects accurate product counts
- Recently viewed and related products display correctly

### Search
- Exact product name search
- Misspelled search terms (fuzzy matching)
- Search with special characters
- Empty search submission
- Search suggestions and autocomplete
- No results page with helpful alternatives
- Search within category or filtered results

### Cart
- Add single and multiple items
- Update quantity (increase, decrease, zero, negative, decimal)
- Remove items from cart
- Cart persists across sessions (logged in)
- Cart persists across sessions (guest via cookie)
- Cart reflects current prices (not stale cached prices)
- Cart handles out-of-stock items added before stock depletion
- Maximum quantity limits enforced
- Cart total updates in real time
- Empty cart state displays correctly
- Cart icon badge count updates immediately

### Checkout
- Guest checkout flow end to end
- Registered user checkout with saved details
- Address validation and autocomplete
- Shipping method selection updates total
- Order summary accuracy before payment
- Back button behavior during checkout
- Checkout with expired session
- Checkout with empty cart (direct URL access)
- Order confirmation page with correct details
- Confirmation email sent with correct content

### Payments
- Credit/debit card processing (valid card)
- Credit card with invalid number, expired date, wrong CVV
- PayPal or third-party payment redirect and return
- Payment failure and retry flow
- Insufficient funds handling
- 3D Secure authentication flow
- Saved payment methods selection
- Payment timeout handling (gateway slow response)
- Refund to original payment method
- Currency display matches user locale

### Shipping
- Shipping rate calculation by weight, destination, method
- Free shipping threshold display and application
- Multiple shipping addresses (split shipment)
- International shipping with customs information
- Estimated delivery date accuracy
- Shipping to PO boxes and military addresses
- Express vs standard shipping option differences
- Shipping cost updates when address changes

### Returns & Refunds
- Return request initiation within policy window
- Return request outside policy window (should be denied)
- Return label generation
- Refund processing and confirmation
- Partial returns from multi-item orders
- Exchange flow for different size or color
- Return status tracking

### Pricing
- Regular price display
- Sale price with original price strikethrough
- Percentage and fixed amount discount application
- Coupon code entry (valid, invalid, expired, case sensitivity)
- Stacking rules for multiple discounts
- Tax calculation by jurisdiction
- Bundle pricing accuracy
- Bulk pricing tiers
- Currency conversion if multi-currency supported
- Price updates when variant is changed

### User Accounts
- Registration with email verification
- Social login (Google, Facebook, Apple)
- Profile update (name, email, password)
- Address book management (add, edit, delete, set default)
- Order history with status and details
- Reorder from previous order
- Wishlist add, remove, move to cart
- Account deletion and data removal

### Reviews & Ratings
- Submit a review with star rating and text
- Review with photo upload
- Review moderation (pending state)
- Sort reviews by date, rating, helpfulness
- Average rating calculation accuracy
- Review filtering by star count
- Verified purchase badge display

## Common Bugs

- **Cart calculation errors** - Rounding issues with discounts, tax computed on wrong subtotal, quantity multiplier off by one
- **Checkout flow breaks** - Back button causes duplicate order, session timeout loses cart, address validation rejects valid addresses
- **Payment gateway timeouts** - Order created but payment status unknown, user charged but order not confirmed, retry creates duplicate charge
- **Inventory sync issues** - Item shows in stock but fails at checkout, overselling due to race condition, stock not restored on cancelled order
- **Coupon stacking exploits** - Applying multiple exclusive coupons, coupon applied after order total goes negative, expired coupon still works via direct URL
- **Price display mismatches** - Cart shows different price than product page, currency rounding differs between pages, tax-inclusive vs exclusive confusion
- **Search relevance issues** - Exact match not in top results, filters reset after pagination, zero results for valid product names
- **Account edge cases** - Guest checkout email conflicts with existing account, social login does not merge with email account, order history missing after password reset
- **Mobile checkout** - Payment form keyboard covers input, autofill breaks card number formatting, touch targets too small on shipping options

## Compliance Requirements

- **PCI DSS** - Payment card data handled securely, no card numbers in logs or URLs
- **GDPR** - Cookie consent, data export, right to deletion, privacy policy
- **Consumer protection** - Clear return policy, accurate product descriptions, transparent pricing
- **Accessibility (WCAG 2.1 AA)** - Full checkout flow usable by keyboard and screen reader
- **Tax compliance** - Correct tax rates by jurisdiction, tax displayed before final purchase
- **Email compliance** - CAN-SPAM Act for marketing emails, transactional email opt-out separation
