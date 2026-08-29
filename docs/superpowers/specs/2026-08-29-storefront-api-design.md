# UK Computer Shop — Storefront API Design & Implementation Plan

Companion to `2026-08-28-database-design.md` / `2026-08-29-database-schema.md`. This document
plans the **customer-facing storefront API only**. The separate admin/back-office API is planned
in `2026-08-29-admin-api-design.md`.

## 1. Background & Key Decisions

- Framework: NestJS (existing `src/app.module.ts`), Prisma client (`src/prisma`).
- Base path: `/api/v1/...`. All storefront routes live under a `StorefrontModule` composed of
  per-domain feature modules (`AuthModule`, `CatalogModule`, `CartModule`, `OrdersModule`, ...).
- **Auth model:** JWT access token (short-lived) + refresh token (long-lived), with OTP
  (`OtpVerification`) used for email/phone verification and password reset — matches the schema
  already in place. No session cookies.
- **Guest commerce:** Cart and browsing history work without an account, keyed by an opaque
  guest/session token issued by the API. On login/register, the guest cart is merged into the
  user's cart.
- **Phasing:** endpoints are grouped into three build phases (MVP → engagement → content/marketing).
  Every endpoint table below has a `Phase` column.

## 2. Conventions

- **Versioning:** URI-based, `/api/v1`.
- **Response envelope:** single resource → `{ data: {...} }`; collections →
  `{ data: [...], meta: { page, perPage, total, totalPages } }`.
- **Errors:** `{ error: { code: string, message: string, details?: object } }` with matching
  HTTP status (400 validation, 401 unauthenticated, 403 forbidden, 404 not found, 409 conflict,
  422 business-rule violation, 429 rate-limited, 500 unexpected).
- **Pagination:** `?page=1&perPage=20` (default `perPage=20`, max `100`).
- **Sorting:** `?sort=field:asc|desc` (repeatable for multi-key sort where noted).
- **Filtering:** plain query params per resource (documented per endpoint); attribute filters use
  `?attr[<attributeSlug>]=<valueSlug>,<valueSlug>`.
- **Identifiers in URLs:** human-facing resources (`Product`, `Category`, `Brand`, `BlogPost`,
  `Collection`, `Page`) are addressed by `slug`; `Order` by `orderNumber`; everything else
  addressed by internal `id`/`uuid` is not exposed in storefront routes except where noted.
- **Auth header:** `Authorization: Bearer <accessToken>` on authenticated routes. Public routes
  (catalog browsing, content, marketing) require no auth but accept an optional token to
  personalize responses (e.g. wishlist state on product cards).
- **Guest identity header:** `X-Guest-Token` — issued by `POST /cart` on first use, echoed by the
  client on every cart/browsing-history call until the user logs in.
- **Access token lifetime:** 15 minutes. **Refresh token lifetime:** 30 days, rotated on use,
  stored hashed server-side (table/mechanism to be decided in the implementation plan — not a new
  Prisma model in the current schema, so this is flagged as an open assumption in §16).

## 3. Domain: Auth & Identity

Backed by `User`, `Address`, `OtpVerification`.

| Endpoint | Auth | Phase | Purpose | Key Request Fields | Key Response Fields |
|---|---|---|---|---|---|
| `POST /auth/register` | none | 1 | Create account | `email, password, firstName, lastName, phone?` | `user, accessToken, refreshToken` |
| `POST /auth/login` | none | 1 | Password login | `email, password` | `user, accessToken, refreshToken` |
| `POST /auth/refresh` | none | 1 | Rotate tokens | `refreshToken` | `accessToken, refreshToken` |
| `POST /auth/logout` | bearer | 1 | Revoke refresh token | `refreshToken` | `204` |
| `POST /auth/otp/request` | none | 1 | Send OTP | `identifier, channel(EMAIL\|SMS), purpose(EMAIL_VERIFY\|PHONE_VERIFY\|PASSWORD_RESET\|LOGIN)` | `202` |
| `POST /auth/otp/verify` | none | 1 | Verify OTP | `identifier, code, purpose` | `verified: true` — sets `emailVerifiedAt`/`mobileVerifiedAt` for verify purposes |
| `POST /auth/password/forgot` | none | 1 | Start reset | `email` | `202` (triggers OTP, purpose `PASSWORD_RESET`) |
| `POST /auth/password/reset` | none | 1 | Complete reset | `email, code, newPassword` | `204` |
| `GET /me` | bearer | 1 | Current profile | — | `User` (no `passwordHash`) |
| `PATCH /me` | bearer | 1 | Update profile | `firstName?, lastName?, phone?` | `User` |
| `POST /me/password` | bearer | 1 | Change password | `currentPassword, newPassword` | `204` |
| `GET /me/addresses` | bearer | 1 | List addresses | — | `Address[]` |
| `POST /me/addresses` | bearer | 1 | Add address | `label?, fullName, companyName?, line1, line2?, city, county?, postcode, country, phone?, addressType` | `Address` |
| `GET /me/addresses/:id` | bearer | 1 | Address detail | — | `Address` |
| `PATCH /me/addresses/:id` | bearer | 1 | Edit address | same as create, all optional | `Address` |
| `DELETE /me/addresses/:id` | bearer | 1 | Remove address | — | `204` |
| `POST /me/addresses/:id/default` | bearer | 1 | Mark default | — | `204` |

**Business rules:** registration does not block on verification (frontend nudges the user to
verify); orders still require *either* a verified contact channel *or* explicit guest checkout
email — decided in Orders section. Rate-limit `otp/request` per identifier (see §16).

## 4. Domain: Catalog

Backed by `Category`, `Brand`, `Product`, `ProductVariant`, `ProductAttribute` /
`ProductAttributeValue`, `ProductFaq`, `ProductCondition`, `Collection`.

| Endpoint | Auth | Phase | Purpose | Key Request Fields | Key Response Fields |
|---|---|---|---|---|---|
| `GET /categories` | none | 1 | Category tree/list | `?parentId=` | `Category[]` (with `children` when no `parentId`) |
| `GET /categories/:slug` | none | 1 | Category detail | — | `Category` + breadcrumb trail |
| `GET /categories/:slug/products` | none | 1 | Category PLP | `page, perPage, sort, minPrice, maxPrice, brandId[], attr[...]` | `Product[]` (list shape: id, slug, title, brand, defaultVariant price/salePrice, thumbnail) |
| `GET /brands` | none | 1 | Brand list | `?status=active` (implicit) | `Brand[]` |
| `GET /brands/:slug` | none | 1 | Brand detail | — | `Brand` |
| `GET /brands/:slug/products` | none | 1 | Brand PLP | same as category PLP | `Product[]` |
| `GET /products` | none | 1 | Global PLP / listing | `page, perPage, sort, categoryId?, brandId?, conditionId?, minPrice?, maxPrice?, attr[...], isFeatured?, isTopProduct?` | `Product[]` |
| `GET /products/:slug` | optional | 1 | Product detail (PDP) | — | `Product` + `variants[]`, `faqs[]`, `reviewSummary{average,count}`, `brand`, `category` |
| `GET /products/:slug/variants` | none | 1 | Variant list (for variant switcher) | — | `ProductVariant[]` with resolved attribute values |
| `GET /products/:slug/faqs` | none | 1 | Product FAQs | — | `ProductFaq[]` |
| `GET /product-attributes` | none | 1 | Filter facets | `?categoryId=` (attributes actually used by products in that category, with available values + counts) | `ProductAttribute[]` with `values[]` |
| `GET /product-conditions` | none | 1 | Condition list (e.g. Refurbished) | — | `ProductCondition[]` |
| `GET /collections/:slug` | none | 2 | Curated collection | `page, perPage` | `Collection` + `products[]` |

**Business rules:** all public reads filter to `status = ACTIVE` (and non-deleted). Price shown is
the variant's `salePrice ?? price`; PDP must expose both to render strike-through pricing.
`isReturnable`/`returnableDays`/`warrantyMonths` are surfaced on the PDP response for the
"Returns & Warranty" UI block from `docs/pages.md`.

## 5. Domain: Search & Discovery

Backed by `SearchLog`, `TrendingProduct`, `BrowsingHistory`, plus the `Product` read model above.

| Endpoint | Auth | Phase | Purpose | Key Request Fields | Key Response Fields |
|---|---|---|---|---|---|
| `GET /search` | optional | 2 | Full search (name, SKU, MPN, brand, spec) | `q, page, perPage, sort, ...same filters as /products` | `Product[]`; also writes a `SearchLog` row |
| `GET /search/autocomplete` | none | 2 | Type-ahead suggestions | `q` | `{ products: [...], categories: [...], brands: [...] }` (small, unpaginated) |
| `GET /products/:slug/related` | none | 2 | Related products | `?limit=` | `Product[]` (same category/brand, excluding self) |
| `GET /products/trending` | none | 3 | Trending list | `period=DAILY\|WEEKLY\|MONTHLY` | `Product[]` ordered by `TrendingProduct.score` |
| `GET /me/recently-viewed` | optional | 2 | Recently viewed | `?limit=` | `Product[]` — keyed by `userId` if authed, else `X-Guest-Token`/session id |
| `POST /browsing-history` | optional | 2 | Record a product view | `productId` | `204` |

**Open question flagged for implementation:** search is planned as Postgres `ILIKE`/trigram
matching over `title, sku, mpn`, not a dedicated search engine (Elasticsearch/Meilisearch) —
see §16 Explicitly Excluded.

## 6. Domain: Cart & Wishlist

Backed by `Cart`, `CartItem`, `Wishlist`, `WishlistItem`.

| Endpoint | Auth | Phase | Purpose | Key Request Fields | Key Response Fields |
|---|---|---|---|---|---|
| `GET /cart` | optional | 1 | Get/create current cart | — | `Cart` + `items[]` (each with resolved variant, product, line total); issues `X-Guest-Token` if absent and no bearer token |
| `POST /cart/items` | optional | 1 | Add item | `productVariantId, quantity` | `CartItem` (upsert — unique on `cartId+productVariantId`) |
| `PATCH /cart/items/:id` | optional | 1 | Change quantity | `quantity` | `CartItem` |
| `DELETE /cart/items/:id` | optional | 1 | Remove item | — | `204` |
| `POST /cart/items/:id/save-for-later` | optional | 2 | Toggle saved-for-later | `savedForLater: boolean` | `CartItem` |
| `POST /cart/merge` | bearer | 1 | Merge guest cart into user cart on login | `guestToken` | `Cart` |
| `GET /wishlists` | bearer | 2 | List wishlists | — | `Wishlist[]` |
| `POST /wishlists` | bearer | 2 | Create wishlist | `title` | `Wishlist` |
| `GET /wishlists/:id` | bearer | 2 | Wishlist detail | — | `Wishlist` + `items[]` |
| `DELETE /wishlists/:id` | bearer | 2 | Delete wishlist | — | `204` |
| `POST /wishlists/:id/items` | bearer | 2 | Add item | `productVariantId` | `WishlistItem` |
| `DELETE /wishlists/:id/items/:itemId` | bearer | 2 | Remove item | — | `204` |

**Business rules:** cart quantity is clamped server-side to `ProductVariant.stockQty`; adding an
out-of-stock variant returns `422`. A default `Wishlist` ("My Wishlist") is lazily created on
first use so the frontend doesn't need a separate "create my first wishlist" step.

## 7. Domain: Checkout & Orders

Backed by `Order`, `OrderItem`, `OrderStatusHistory`, `OrderItemReturn`, `ShippingMethod`,
`ShippingRateBand`, `Coupon`, `OrderCouponLine`.

| Endpoint | Auth | Phase | Purpose | Key Request Fields | Key Response Fields |
|---|---|---|---|---|---|
| `POST /checkout/shipping-methods` | optional | 1 | Quote shipping options for current cart | `shippingAddress { postcode, country, ... }` | `ShippingMethod[]` with computed `rate` (flat or weight-banded) |
| `POST /checkout/coupon/validate` | optional | 2 | Validate a coupon against current cart | `code` | `{ valid, discountAmount, reason? }` |
| `POST /orders` | optional | 1 | Place order (checkout) | `guestEmail? (if not authed), billingAddress, shippingAddress, shippingMethodId, couponCode?, giftCardCode?, customerNote?, paymentProvider` | `Order` (status `PENDING`/`AWAITING_PAYMENT`) + `paymentIntent` (see §8) |
| `GET /orders` | bearer | 1 | List my orders | `page, perPage, status?` | `Order[]` (summary shape) |
| `GET /orders/:orderNumber` | bearer\* | 1 | Order detail | — | `Order` + `items[]`, `statusHistory[]`, tracking fields. \*guest orders retrievable via `orderNumber` + `email` query param |
| `POST /orders/:orderNumber/cancel` | bearer\* | 1 | Cancel (only while `PENDING`/`AWAITING_PAYMENT`/`PROCESSING`) | `reason?` | `Order` |
| `GET /orders/:orderNumber/invoice` | bearer\* | 2 | Download invoice | — | PDF stream / signed URL |
| `POST /orders/:orderNumber/items/:itemId/return` | bearer | 2 | Request a return | `reason, comment?` | `OrderItemReturn` (only if `returnEligible` and within `returnDeadline`) |
| `GET /orders/:orderNumber/returns` | bearer | 2 | List returns for an order | — | `OrderItemReturn[]` |
| `GET /returns/:id` | bearer | 2 | Return detail | — | `OrderItemReturn` |

**Business rules:** order totals (`subtotal, discountTotal, shippingCharge, vatTotal,
giftCardDiscount, total`) are always computed server-side from the cart snapshot at checkout time
— never trusted from the client. VAT is computed per line from `Product.taxRate.ratePercent` at
order-placement time and snapshotted onto `OrderItem.vatRatePercent`/`vatAmount`. Coupon and gift
card validation reuse the same rule engine as `/checkout/coupon/validate` and gift-card redemption
(§10).

## 8. Domain: Payments

Backed by `PaymentTransaction`, `PaymentRefund`, `PaymentDispute`, `PaymentWebhookLog`.

| Endpoint | Auth | Phase | Purpose | Key Request Fields | Key Response Fields |
|---|---|---|---|---|---|
| `POST /payments/intents` | optional\* | 1 | Create a payment intent for an order | `orderId, provider` | `{ provider, clientSecret }` (or `redirectUrl` for redirect-based providers); creates `PaymentTransaction` `PENDING` |
| `POST /payments/webhooks/:provider` | provider signature | 1 | Provider async payment events | raw provider payload | `200` — writes `PaymentWebhookLog`, updates `PaymentTransaction`/`Order.paymentStatus`/creates `PaymentRefund`/`PaymentDispute` rows as needed |
| `GET /orders/:orderNumber/payments` | bearer\* | 1 | Payment status for an order | — | `PaymentTransaction[]` (id, status, amount, provider — no raw payload) |

**Business rules:** the webhook endpoint is unauthenticated by user token but **must** verify the
provider's signature header before processing, and must be idempotent on
`providerTransactionId`/`providerEventId` (already unique in schema). Payment provider (Stripe vs
other) is an open assumption — see §16.

## 9. Domain: Reviews & Ratings

Backed by `Review`.

| Endpoint | Auth | Phase | Purpose | Key Request Fields | Key Response Fields |
|---|---|---|---|---|---|
| `GET /products/:slug/reviews` | none | 2 | Public review list | `page, perPage, rating?` | `Review[]` (`status = APPROVED` only) + `summary { average, count, breakdown }` |
| `POST /products/:slug/reviews` | bearer | 2 | Submit a review | `orderItemId, rating, title?, comment?` | `Review` (`status = PENDING`) |
| `GET /me/reviews` | bearer | 2 | My submitted reviews | — | `Review[]` (any status) |
| `PATCH /me/reviews/:id` | bearer | 2 | Edit own review | `rating?, title?, comment?` | `Review` — only while `status = PENDING` |
| `DELETE /me/reviews/:id` | bearer | 2 | Remove own review | — | `204` |

**Business rules:** verified-purchase only — `orderItemId` must belong to the requesting user, the
parent order must be `DELIVERED`, and the item must not already have a review (`orderItemId` is
unique on `Review`).

## 10. Domain: Gift Cards

Backed by `GiftCard`, `GiftCardTransaction`.

| Endpoint | Auth | Phase | Purpose | Key Request Fields | Key Response Fields |
|---|---|---|---|---|---|
| `GET /gift-cards/:code/balance` | none | 3 | Check balance before applying at checkout | — | `{ balance, currency, status, expiresAt }` |
| `POST /gift-cards` | optional | 3 (optional — validate demand first) | Purchase a gift card | `amount, currency?, recipientEmail?` | `GiftCard` + a mini payment intent, same flow as §8 |

**Business rules:** redemption itself happens inside `POST /orders` (`giftCardCode` field, §7),
not as a separate endpoint — it debits `currentBalance` and writes a `GiftCardTransaction(type=REDEEM)`
atomically with order placement.

## 11. Domain: Marketing (read-only)

Backed by `Banner`, `FeaturedSection`, `FeaturedSectionProduct`, `HeroSlide`, `HeroTrustBadge`,
`Menu`, `MenuItem`, `MegaMenuPanel/Column/Link`.

| Endpoint | Auth | Phase | Purpose | Key Request Fields | Key Response Fields |
|---|---|---|---|---|---|
| `GET /hero-slides` | none | 3 | Homepage hero carousel | — | `HeroSlide[]` active by date range |
| `GET /hero-trust-badges` | none | 3 | Trust badges strip | — | `HeroTrustBadge[]` |
| `GET /banners` | none | 3 | Promo banners by placement | `?position=` | `Banner[]` active by date range, resolved link target |
| `GET /featured-sections` | none | 3 | Homepage merchandising rails | — | `FeaturedSection[]` each with resolved `products[]` (manual list, or computed for `NEWLY_ADDED`/`BEST_SELLER`/`TOP_RATED`) |
| `GET /featured-sections/:slug` | none | 3 | Single rail (e.g. "Deals" page) | `page, perPage` | `FeaturedSection` + paginated `products[]` |
| `GET /menus/:location` | none | 3 | Header/footer navigation | `location = HEADER\|FOOTER` | `Menu` with nested `items[]`, mega-menu panel/columns/links resolved |

## 12. Domain: Content / CMS

Backed by `BlogCategory`, `Author`, `BlogPost`, `Page`, `FaqCategory`, `Faq`, `Testimonial`,
`Enquiry`.

| Endpoint | Auth | Phase | Purpose | Key Request Fields | Key Response Fields |
|---|---|---|---|---|---|
| `GET /blog/categories` | none | 3 | Blog category list | — | `BlogCategory[]` |
| `GET /blog/posts` | none | 3 | Blog listing | `page, perPage, categorySlug?, authorId?, tag?` | `BlogPost[]` (`status = PUBLISHED`) |
| `GET /blog/posts/:slug` | none | 3 | Blog detail | — | `BlogPost` + `author`, `relatedPosts[]` |
| `GET /blog/authors/:id` | none | 3 | Author profile + their posts | `page, perPage` | `Author` + `posts[]` |
| `GET /pages/:slug` | none | 3 | CMS static page (Terms, Privacy, etc.) | — | `Page` (`status = PUBLISHED`) |
| `GET /faq-categories` | none | 3 | FAQ page content | — | `FaqCategory[]` with nested `faqs[]` |
| `GET /testimonials` | none | 3 | Homepage testimonials | — | `Testimonial[]` |
| `POST /enquiries` | none | 3 | Contact-us / support form | `type, name, email?, phone?, subject?, message` | `Enquiry` (`status = NEW`) |

## 13. Domain: Notifications

Backed by `Notification`.

| Endpoint | Auth | Phase | Purpose | Key Request Fields | Key Response Fields |
|---|---|---|---|---|---|
| `GET /me/notifications` | bearer | 3 | List my notifications | `page, perPage, unreadOnly?` | `Notification[]` |
| `POST /me/notifications/:id/read` | bearer | 3 | Mark one read | — | `204` |
| `POST /me/notifications/read-all` | bearer | 3 | Mark all read | — | `204` |

## 14. Domain: Public Settings

Backed by `Setting` (key/value store).

| Endpoint | Auth | Phase | Purpose | Key Request Fields | Key Response Fields |
|---|---|---|---|---|---|
| `GET /settings/public` | none | 1 | Storefront bootstrap config | — | whitelisted subset of `Setting` rows (currency, contact info, social links, feature flags) — server-side allowlist of keys, never the full table |

## 15. Phase Roadmap Summary

- **Phase 1 (MVP):** Auth & Identity (all), Catalog browse (categories/brands/products/variants/
  attributes/conditions), Cart, Checkout shipping quote + order placement, Orders (list/detail/
  cancel), Payments (intent + webhook), Public Settings.
- **Phase 2:** Wishlists, cart save-for-later, Collections, Coupon validation, Order invoice/
  returns, Reviews (submit + list), Search + autocomplete, related products, recently-viewed/
  browsing history.
- **Phase 3:** Trending products, Marketing rails (hero/banners/featured sections/menus), Content/
  CMS (blog/pages/FAQ/testimonials/enquiries), Notifications, Gift cards.

## 16. Explicitly Excluded / Deferred

- Admin/back-office API — separate document (`2026-08-29-admin-api-design.md`).
- Dedicated search engine (Elasticsearch/Meilisearch/Algolia) — Phase 2 search is plain Postgres
  querying over indexed columns; revisit if relevance/performance requires it.
- Multi-currency and i18n beyond English/GBP.
- Social/SSO login (Google, Apple, etc.).
- Real-time inventory sync / websocket stock updates.
- Rate-limiting and API-gateway/WAF configuration (assumed handled at infra level, not in-app).
- Refresh-token storage mechanism (see Open Assumptions).

## 17. Open Assumptions

- Refresh tokens need a persistence/revocation mechanism not yet in `schema.prisma` (e.g. a
  `RefreshToken` table or a Redis-backed denylist) — to be decided in the implementation plan.
- Product prices are stored and displayed **VAT-inclusive**; `TaxRate.ratePercent` is used
  server-side only, to back out the `vatAmount` breakdown shown on the order/invoice.
- Payment provider is unspecified in the schema (`PaymentTransaction.provider` is a free-text
  string) — implementation plan should confirm Stripe vs. another UK-friendly provider before
  building `/payments/intents`.
- Guest checkout is allowed (`Order.userId` is nullable, `email`/`phone` stored directly on
  `Order`); guest order lookup is via `orderNumber` + `email` match.
- "Best sellers" / "top rated" featured sections are computed from `OrderItem`/`Review` aggregates
  at read time or via a scheduled job populating `TrendingProduct`-style scoring — exact strategy
  deferred to the implementation plan.
