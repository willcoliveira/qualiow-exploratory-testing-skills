# Domain: Marketing Website

## Priority Areas

1. **Landing Pages & CTAs** - Conversion-critical elements must work flawlessly
2. **Forms** - Contact, signup, and newsletter forms capture and submit correctly
3. **SEO** - Meta tags, structured data, canonical URLs, crawlability
4. **Analytics & Tracking** - Events fire correctly, attribution works
5. **Mobile Responsiveness** - Layout and interactions work on all devices
6. **Page Load Speed** - Fast load times directly impact conversion rates
7. **Content Quality** - No broken links, typos, or placeholder content

## Feature Risk Ranking

| Tier | Features                                          | Rationale                                                        |
|------|---------------------------------------------------|------------------------------------------------------------------|
| P0   | Forms/lead capture, CTAs, page load speed         | Direct revenue pipeline. Broken forms = lost leads. Broken CTAs = lost conversions. Slow pages = high bounce rate. |
| P1   | SEO, analytics tracking, responsive design        | Discoverability and measurement. Without SEO, no traffic. Without analytics, no insight. Without responsive, lost mobile users. |
| P2   | Content pages, images/media, social sharing       | Supports brand and engagement but does not directly block conversion. |
| P3   | Blog, careers page, press/media section           | Informational. Rarely impacts lead generation or conversion.     |

## Completeness Checklist

> Minimum features a marketing website should have. Verify these exist and function before deep-testing.

- [ ] All CTAs lead to a valid destination (no dead links, no 404s, no "#" hrefs)
- [ ] All forms submit successfully and display a confirmation message or redirect to a thank-you page
- [ ] Meta tags present on every page (title, description, og:title, og:description, og:image)
- [ ] Structured data valid (JSON-LD for Organization, BreadcrumbList, FAQ, etc.)
- [ ] Cookie consent banner present and functional (blocks non-essential cookies until accepted)
- [ ] Privacy policy page linked from footer and accessible
- [ ] Mobile responsive -- layout does not break at 320px, 375px, or 768px
- [ ] No placeholder content (lorem ipsum, "TODO", sample images)
- [ ] Favicon present
- [ ] 404 page is custom and helpful (not a raw server error)

## Data Integrity Checks

> Marketing sites are lighter on data, but lead capture and tracking integrity are critical.

1. **Form submission arrives in CRM/inbox** -- Submit every form with test data and verify the submission appears in the destination system (CRM, email inbox, marketing automation platform). Check all fields map correctly.
2. **Analytics events fire correctly** -- Open browser dev tools or a tag debugger. Verify page view events fire on load, CTA click events fire on click (with correct labels), and form submission events fire on successful submit. No duplicate events.
3. **UTM parameters preserved through redirects** -- Navigate to the site with UTM parameters (e.g., `?utm_source=test&utm_medium=cpc&utm_campaign=spring`). Click through CTAs and form submissions. Verify UTM values are captured in analytics and/or CRM fields. Check that redirects (301, 302) do not strip the parameters.
4. **Cookie consent respected** -- Before accepting cookies, non-essential scripts (analytics, ad pixels) should not load. After accepting, they should load. After rejecting, they should remain blocked.

## Cross-Feature Journeys

> End-to-end flows that cross feature boundaries. Conversion path bugs are costly.

### Journey 1: Landing Page to Lead Capture
`Land on Page (with UTM params) -> Scroll to CTA -> Click CTA -> Fill Form -> Submit -> See Thank-You Page -> Verify Lead Captured in CRM`
- Verify: UTM parameters preserved, CTA links to correct form, form submits without error, thank-you page loads, lead appears in CRM with correct source/campaign data.

### Journey 2: Content Discovery to Social Sharing
`Homepage -> Navigate to Blog -> Read Article -> Click Share Button -> Verify OG Tags in Share Preview`
- Verify: blog navigation works, article loads fully, share buttons function, Open Graph tags produce correct title, description, and image in the share preview. Check og:image dimensions meet platform minimums (1200x630).

### Journey 3: Organic Search Entry
`Enter via Search (simulate with direct URL + UTM) -> Browse Multiple Pages -> Click CTA -> Convert`
- Verify: page has correct canonical URL, meta tags match page content, internal links work, CTA conversion tracked as organic in analytics.

## Must-Test Patterns

### Landing Pages
- Hero section renders correctly with image, headline, subheading
- Primary CTA button is visible above the fold
- CTA links to correct destination (signup, demo, pricing)
- Multiple CTAs on the page all function correctly
- Social proof elements display (testimonials, logos, stats)
- Video embeds play without error
- Responsive layout does not break the visual hierarchy
- A/B test variants load correctly when configured
- UTM parameters preserved through CTA clicks
- Page loads correctly when accessed from paid ad link

### Forms
- Contact form submits successfully with valid data
- Required field validation on all mandatory fields
- Email format validation
- Phone number format handling (international formats)
- Form submission sends confirmation email
- Form data reaches CRM or email marketing system
- Honeypot or reCAPTCHA spam prevention works
- Form does not submit with empty honeypot field triggered
- Newsletter signup with double opt-in flow
- Unsubscribe link works in marketing emails
- Form error messages are clear and positioned near the field
- Form submit button shows loading state and prevents double click

### SEO
- Unique title tag on every page (under 60 characters)
- Meta description present and relevant (under 160 characters)
- Only one h1 per page
- Heading hierarchy is logical (h1 > h2 > h3, no skips)
- Canonical URL set on all pages
- Canonical URL is self-referencing or points to correct primary page
- Hreflang tags for multi-language sites
- Structured data (JSON-LD) for organization, breadcrumbs, FAQ, articles
- Structured data validates in Google Rich Results Test
- XML sitemap includes all indexable pages
- XML sitemap excludes noindex pages
- Robots.txt does not block critical resources
- Image alt text present and descriptive
- Clean URL slugs (no query parameters for main content)
- 301 redirects in place for moved or renamed pages
- No broken internal links (404 errors)
- Open Graph tags (og:title, og:description, og:image) present
- Twitter Card tags present
- og:image dimensions meet minimum (1200x630)

### Analytics & Tracking
- Google Analytics (GA4) or equivalent loads on all pages
- Page view events fire on every page load
- CTA click events tracked with correct labels
- Form submission events fire on successful submit
- Scroll depth tracking active
- UTM parameters captured in analytics
- Conversion goals or events configured for key actions
- Cross-domain tracking works if multi-domain setup
- Cookie consent does not block analytics before acceptance
- Analytics data matches actual behavior (no duplicate events)
- Facebook Pixel, LinkedIn Insight, or other ad pixels fire correctly
- Event parameters contain correct values (page name, CTA label)

### A/B Testing
- Control and variant pages render correctly
- Traffic split is approximately correct
- Variant does not flash original before changing (no flicker)
- A/B test tool does not significantly impact page load time
- Conversion tracking attributes to correct variant
- Test preview mode works for QA

### Social Sharing
- Share buttons for major platforms (Facebook, Twitter, LinkedIn, email)
- Share URL includes correct page link
- Shared content preview shows correct title, description, image
- Share count displays (if applicable)
- Copy link button works and shows confirmation

### Mobile Responsiveness
- Layout at 320px (small phone), 375px (standard phone), 768px (tablet)
- Navigation hamburger menu opens and closes
- Touch targets at least 44x44px
- No horizontal scrolling
- Images scale without overflow or distortion
- Text is readable without zooming (minimum 16px body text)
- Fixed headers do not cover content
- Phone numbers are clickable (tel: links)
- Maps and embeds resize correctly
- Popup and modal overlays work on mobile

### Page Load Speed
- Largest Contentful Paint (LCP) under 2.5 seconds
- First Input Delay (FID) under 100ms
- Cumulative Layout Shift (CLS) under 0.1
- Images use modern formats (WebP, AVIF) with fallbacks
- CSS and JS are minified
- No render-blocking resources above the fold
- Fonts load without causing layout shift (font-display: swap)
- Third-party scripts do not block main thread significantly
- Lazy loading for images below the fold
- CDN caching configured for static assets

### Content Quality
- No lorem ipsum or placeholder text
- No broken images (missing files or wrong paths)
- No typos or grammatical errors in headlines and CTAs
- Legal pages accessible (Privacy Policy, Terms of Service, Cookie Policy)
- Copyright year is current
- External links open in new tab and have rel="noopener"
- Downloads work (PDF brochures, whitepapers)
- Pricing page is accurate and up to date
- Team photos and bios are current

## Common Bugs

- **CTA link errors** - Primary CTA links to wrong page or staging URL, UTM parameters stripped on redirect, anchor link targets missing element
- **Form delivery failures** - Form submits with success message but data never reaches inbox or CRM, email integration token expired silently, spam filter catches legitimate submissions
- **SEO regressions** - New deploy removes meta tags, sitemap not updated after adding pages, canonical URL points to staging, noindex left on from staging environment
- **Analytics gaps** - Cookie consent blocks all tracking including essential analytics, duplicate event firing on single-page app navigation, ad blocker breaks conversion tracking
- **Mobile layout breaks** - Hero image pushes CTA below fold on mobile, navigation menu overlaps content, horizontal scroll caused by uncontained element, video embed breaks layout
- **Performance regressions** - New hero video slows LCP, unoptimized image added to homepage, third-party chat widget blocks interactivity, font loading causes visible text shift
- **Social sharing preview** - og:image URL broken, description shows default text instead of page-specific, Twitter Card validator fails
- **A/B test interference** - Test JavaScript causes page flicker, wrong variant shown to returning users, test not stopped after reaching significance

## Compliance Requirements

- **GDPR** - Cookie consent banner before non-essential cookies, privacy policy link, data processing disclosure
- **CCPA** - "Do Not Sell My Personal Information" link for California visitors
- **CAN-SPAM** - Unsubscribe link in all marketing emails, physical address in email footer
- **ADA / WCAG 2.1 AA** - Accessible forms, sufficient color contrast, keyboard navigable
- **ePrivacy Directive** - Cookie consent specific to EU visitors
- **FTC Guidelines** - Truthful advertising, clear disclosure of endorsements and sponsorships
- **COPPA** - Age verification if content could attract children under 13
