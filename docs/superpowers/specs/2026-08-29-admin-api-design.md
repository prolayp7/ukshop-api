# UK Computer Shop — Admin API Design & Implementation Plan

Companion to `2026-08-29-storefront-api-design.md`. This document plans the **admin/back-office
API only** — everything an internal staff member uses to run the shop. It shares the schema and
general conventions of the storefront doc but uses a separate auth principal (`AdminUser`) and
permission-gated routes.

## 1. Background & Key Decisions

- Base path: `/api/v1/admin/...`, fully separate router tree from the storefront API (different
  guard, different token audience) even though both live in the same NestJS app.
- **Auth model:** JWT access + refresh, same shape as storefront, but issued against `AdminUser`
  and carrying `roleId`. No self-registration — `AdminUser` rows are created by another admin
  (`admins.manage` permission) or via seed. No OTP flow for admins (internal users only).
- **Authorization:** every route declares a required permission key, checked against
  `Role → RolePermission → Permission` for the caller's `AdminUser.roleId`. Permission keys follow
  the existing seed convention — coarse, dot-separated (`products.manage`, `orders.refund`, ...).
  New domains below introduce new keys not yet in `prisma/seed.ts`; the implementation plan must
  extend the seed data (see §14).
- **Response envelope, errors, pagination, sorting:** identical to the storefront doc (§2 there).
- **Identifiers in URLs:** admin routes use internal `id` (not `slug`/`uuid`) since these are
  operator tools, not public URLs.
- **Soft delete:** domains with `deletedAt` (`User`, `Category`, `Product`, `ProductVariant`,
  `ProductAttribute`, `AdminUser`, `Coupon`) are never hard-deleted via the API — `DELETE` routes
  set `deletedAt` and list endpoints exclude soft-deleted rows unless `?includeDeleted=true`.

## 2. Domain: Admin Auth

Backed by `AdminUser`.

| Endpoint | Permission | Phase | Purpose | Key Request Fields | Key Response Fields |
|---|---|---|---|---|---|
| `POST /admin/auth/login` | none | 1 | Admin login | `email, password` | `adminUser, accessToken, refreshToken` |
| `POST /admin/auth/refresh` | none | 1 | Rotate tokens | `refreshToken` | `accessToken, refreshToken` |
| `POST /admin/auth/logout` | bearer | 1 | Revoke refresh token | `refreshToken` | `204` |
| `GET /admin/me` | bearer | 1 | Current admin profile | — | `AdminUser` (with `role`, resolved `permissions[]`) |

## 3. Domain: Admin Users & RBAC

Backed by `AdminUser`, `Role`, `Permission`, `RolePermission`.

| Endpoint | Permission | Phase | Purpose | Key Request Fields | Key Response Fields |
|---|---|---|---|---|---|
| `GET /admin/admin-users` | `admins.manage` | 2 | List staff accounts | `page, perPage, roleId?, status?` | `AdminUser[]` |
| `POST /admin/admin-users` | `admins.manage` | 2 | Invite/create staff | `email, name, roleId, temporaryPassword` | `AdminUser` |
| `PATCH /admin/admin-users/:id` | `admins.manage` | 2 | Edit staff | `name?, roleId?, status?` | `AdminUser` |
| `DELETE /admin/admin-users/:id` | `admins.manage` | 2 | Disable/soft-delete staff | — | `204` |
| `GET /admin/roles` | `admins.manage` | 2 | List roles + permissions | — | `Role[]` with `permissions[]` |
| `POST /admin/roles` | `admins.manage` | 2 | Create role | `name, description?, permissionKeys[]` | `Role` |
| `PATCH /admin/roles/:id` | `admins.manage` | 2 | Edit role / reassign permissions | `name?, description?, permissionKeys?` | `Role` |
| `DELETE /admin/roles/:id` | `admins.manage` | 2 | Delete role (blocked if `AdminUser`s reference it) | — | `204` |
| `GET /admin/permissions` | `admins.manage` | 2 | List all permission keys (for role editor UI) | — | `Permission[]` |

## 4. Domain: Customers

Backed by `User`, `Address`.

| Endpoint | Permission | Phase | Purpose | Key Request Fields | Key Response Fields |
|---|---|---|---|---|---|
| `GET /admin/customers` | `customers.manage` | 1 | List customers | `page, perPage, q?, status?` | `User[]` (no `passwordHash`) |
| `GET /admin/customers/:id` | `customers.manage` | 1 | Customer detail | — | `User` + `addresses[]`, order/review counts |
| `PATCH /admin/customers/:id` | `customers.manage` | 1 | Edit / suspend / reactivate | `status?, firstName?, lastName?, phone?` | `User` |
| `GET /admin/customers/:id/orders` | `customers.manage` | 1 | Customer's orders | `page, perPage` | `Order[]` |

## 5. Domain: Catalog Admin

Backed by `Category`, `Brand`, `Product`, `ProductVariant`, `ProductVariantAttribute`,
`ProductAttribute`, `ProductAttributeValue`, `ProductFaq`, `ProductCondition`, `TaxRate`,
`Collection`, `CollectionProduct`, `CategoryProduct`.

| Endpoint | Permission | Phase | Purpose | Key Request Fields | Key Response Fields |
|---|---|---|---|---|---|
| `GET/POST /admin/categories` | `products.manage` | 1 | List/create categories | `parentId?, title, slug, description?, sortOrder?, isIndexable?, metaTitle?, metaDescription?, status?` | `Category` |
| `GET/PATCH/DELETE /admin/categories/:id` | `products.manage` | 1 | Detail/edit/soft-delete | same fields, all optional on PATCH | `Category` |
| `GET/POST /admin/brands` | `products.manage` | 1 | List/create brands | `title, slug, description?, status?` | `Brand` |
| `GET/PATCH/DELETE /admin/brands/:id` | `products.manage` | 1 | Detail/edit/delete | — | `Brand` |
| `GET/POST /admin/product-conditions` | `products.manage` | 1 | List/create conditions | `title, slug` | `ProductCondition` |
| `GET/POST /admin/tax-rates` | `products.manage` | 1 | List/create tax rates | `title, ratePercent, isDefault?, status?` | `TaxRate` |
| `GET/POST /admin/product-attributes` | `products.manage` | 1 | List/create attributes | `title, slug, inputType, isFilterable?` | `ProductAttribute` |
| `POST /admin/product-attributes/:id/values` | `products.manage` | 1 | Add attribute value | `value, swatchValue?, sortOrder?` | `ProductAttributeValue` |
| `GET /admin/products` | `products.manage` | 1 | List products | `page, perPage, q?, categoryId?, brandId?, status?` | `Product[]` |
| `POST /admin/products` | `products.manage` | 1 | Create product | `categoryId, brandId?, productConditionId?, taxRateId?, title, slug, sku?, mpn?, shortDescription?, description?, specsSummary?, warrantyMonths?, isReturnable?, returnableDays?, status?, secondaryCategoryIds?[]` | `Product` |
| `GET/PATCH/DELETE /admin/products/:id` | `products.manage` | 1 | Detail/edit/soft-delete | same fields, all optional on PATCH | `Product` |
| `POST /admin/products/:id/faqs` | `products.manage` | 1 | Add product FAQ | `question, answer, sortOrder?` | `ProductFaq` |
| `DELETE /admin/products/:id/faqs/:faqId` | `products.manage` | 1 | Remove FAQ | — | `204` |
| `GET/POST /admin/products/:id/variants` | `products.manage` | 1 | List/create variants | `title, slug, barcode?, price, salePrice?, stockQty, lowStockThreshold?, weightKg?, lengthCm?, widthCm?, heightCm?, isDefault?, status?, attributeValueIds[]` | `ProductVariant` |
| `PATCH/DELETE /admin/products/:id/variants/:variantId` | `products.manage` | 1 | Edit/soft-delete variant | same fields, optional | `ProductVariant` |
| `PATCH /admin/products/:id/variants/:variantId/stock` | `products.manage` | 1 | Quick stock adjustment | `stockQty` (delta or absolute — TBD in impl plan) | `ProductVariant` |
| `GET/POST /admin/collections` | `products.manage` | 2 | List/create collections | `title, slug, description?, type?, productIds[]` | `Collection` |
| `PATCH/DELETE /admin/collections/:id` | `products.manage` | 2 | Edit/delete collection | — | `Collection` |
| `POST /admin/products/import` | `products.manage` | 3 | Bulk CSV/JSON product import | file upload | `{ created, updated, errors[] }` |

## 6. Domain: Media (shared)

Backed by `Media` (polymorphic via `ownerType`/`ownerId`/`collection`).

| Endpoint | Permission | Phase | Purpose | Key Request Fields | Key Response Fields |
|---|---|---|---|---|---|
| `GET /admin/media` | `media.manage` | 1 | List media for an owner | `ownerType, ownerId, collection?` | `Media[]` |
| `POST /admin/media` | `media.manage` | 1 | Upload + attach | multipart `file`, `ownerType, ownerId, collection, altText?, sortOrder?` | `Media` |
| `PATCH /admin/media/:id` | `media.manage` | 1 | Edit metadata / reorder | `altText?, sortOrder?` | `Media` |
| `DELETE /admin/media/:id` | `media.manage` | 1 | Remove | — | `204` |

Every catalog/marketing/content domain above reuses these four routes for its images rather than
defining nested media endpoints per domain (e.g. a product gallery is
`GET /admin/media?ownerType=PRODUCT&ownerId=123&collection=gallery`).

## 7. Domain: Shipping Admin

Backed by `ShippingMethod`, `ShippingRateBand`.

| Endpoint | Permission | Phase | Purpose | Key Request Fields | Key Response Fields |
|---|---|---|---|---|---|
| `GET/POST /admin/shipping-methods` | `shipping.manage` | 1 | List/create methods | `title, carrier, rateType, flatRate?, freeOverAmount?, estimatedDaysMin?, estimatedDaysMax?, status?` | `ShippingMethod` |
| `PATCH/DELETE /admin/shipping-methods/:id` | `shipping.manage` | 1 | Edit/delete | — | `ShippingMethod` |
| `POST /admin/shipping-methods/:id/rate-bands` | `shipping.manage` | 1 | Add weight band | `minWeightKg, maxWeightKg, rate` | `ShippingRateBand` |
| `DELETE /admin/shipping-methods/:id/rate-bands/:bandId` | `shipping.manage` | 1 | Remove band | — | `204` |

## 8. Domain: Orders & Fulfillment Admin

Backed by `Order`, `OrderItem`, `OrderStatusHistory`.

| Endpoint | Permission | Phase | Purpose | Key Request Fields | Key Response Fields |
|---|---|---|---|---|---|
| `GET /admin/orders` | `orders.manage` | 1 | List orders | `page, perPage, status?, paymentStatus?, q?(order number/email), dateFrom?, dateTo?` | `Order[]` |
| `GET /admin/orders/:id` | `orders.manage` | 1 | Order detail | — | `Order` + `items[]`, `statusHistory[]`, `paymentTransactions[]` |
| `PATCH /admin/orders/:id/status` | `orders.manage` | 1 | Transition order status | `toStatus, note?` | `Order` + new `OrderStatusHistory` row (`changedByAdminId` = caller) |
| `PATCH /admin/orders/:id/tracking` | `orders.manage` | 1 | Set carrier tracking | `trackingCarrier, trackingNumber, trackingUrl?` | `Order` |
| `PATCH /admin/orders/:id/items/:itemId/status` | `orders.manage` | 1 | Per-item status (packed/shipped/etc.) | `status` | `OrderItem` |
| `PATCH /admin/orders/:id/note` | `orders.manage` | 1 | Set internal admin note | `adminNote` | `Order` |

## 9. Domain: Returns & Refunds Admin

Backed by `OrderItemReturn`, `PaymentRefund`, `PaymentDispute`, `PaymentTransaction`.

| Endpoint | Permission | Phase | Purpose | Key Request Fields | Key Response Fields |
|---|---|---|---|---|---|
| `GET /admin/returns` | `orders.manage` | 2 | List return requests | `page, perPage, status?` | `OrderItemReturn[]` |
| `PATCH /admin/returns/:id/approve` | `orders.refund` | 2 | Approve return | `pickupStatus?` | `OrderItemReturn` |
| `PATCH /admin/returns/:id/reject` | `orders.refund` | 2 | Reject return | `comment?` | `OrderItemReturn` |
| `PATCH /admin/returns/:id/receive` | `orders.refund` | 2 | Mark item received back | — | `OrderItemReturn` |
| `POST /admin/returns/:id/refund` | `orders.refund` | 2 | Trigger refund | `refundAmount` | `OrderItemReturn` + `PaymentRefund` |
| `GET /admin/payments/transactions` | `orders.manage` | 2 | List payment transactions | `page, perPage, orderId?, status?` | `PaymentTransaction[]` |
| `GET /admin/payments/disputes` | `orders.refund` | 2 | List chargebacks/disputes | `page, perPage, status?` | `PaymentDispute[]` |
| `PATCH /admin/payments/disputes/:id` | `orders.refund` | 2 | Update dispute status/notes | `status?, reasonDescription?` | `PaymentDispute` |

## 10. Domain: Reviews Moderation

Backed by `Review`.

| Endpoint | Permission | Phase | Purpose | Key Request Fields | Key Response Fields |
|---|---|---|---|---|---|
| `GET /admin/reviews` | `reviews.moderate` | 2 | List reviews (all statuses) | `page, perPage, status?, productId?` | `Review[]` |
| `PATCH /admin/reviews/:id/approve` | `reviews.moderate` | 2 | Approve | — | `Review` |
| `PATCH /admin/reviews/:id/reject` | `reviews.moderate` | 2 | Reject | `reason?` | `Review` |
| `DELETE /admin/reviews/:id` | `reviews.moderate` | 2 | Remove | — | `204` |

## 11. Domain: Marketing & Merchandising Admin

Backed by `Coupon`, `Banner`, `FeaturedSection`, `FeaturedSectionProduct`, `HeroSlide`,
`HeroTrustBadge`, `Menu`, `MenuItem`, `MegaMenuPanel`, `MegaMenuColumn`, `MegaMenuLink`.

| Endpoint | Permission | Phase | Purpose | Key Request Fields | Key Response Fields |
|---|---|---|---|---|---|
| `GET/POST /admin/coupons` | `marketing.manage` | 2 | List/create coupons | `code, description?, discountType, discountAmount, appliesToShipping?, minOrderTotal?, maxDiscountValue?, startsAt?, endsAt?, maxTotalUsage?, maxUsagePerUser?` | `Coupon` |
| `PATCH/DELETE /admin/coupons/:id` | `marketing.manage` | 2 | Edit/soft-delete | — | `Coupon` |
| `GET/POST /admin/banners` | `marketing.manage` | 3 | List/create banners | `title, slug, linkType, productId?/categoryId?/brandId?/customUrl?, position, displayOrder?, status?, startsAt?, endsAt?` | `Banner` |
| `PATCH/DELETE /admin/banners/:id` | `marketing.manage` | 3 | Edit/delete | — | `Banner` |
| `GET/POST /admin/featured-sections` | `marketing.manage` | 3 | List/create rails | `title, slug, sectionType, categoryId?, sortOrder?, status?, manualProductIds?[]` | `FeaturedSection` |
| `PATCH/DELETE /admin/featured-sections/:id` | `marketing.manage` | 3 | Edit/delete | — | `FeaturedSection` |
| `GET/POST /admin/hero-slides` | `marketing.manage` | 3 | List/create slides | `headline, subheading?, ctaLabel?, ctaUrl?, sortOrder?, status?, startsAt?, endsAt?` | `HeroSlide` |
| `PATCH/DELETE /admin/hero-slides/:id` | `marketing.manage` | 3 | Edit/delete | — | `HeroSlide` |
| `GET/POST /admin/hero-trust-badges` | `marketing.manage` | 3 | List/create badges | `label, icon?, sortOrder?, status?` | `HeroTrustBadge` |
| `GET/POST /admin/menus` | `marketing.manage` | 3 | List/create menus | `name, slug, location, status?` | `Menu` |
| `POST /admin/menus/:id/items` | `marketing.manage` | 3 | Add menu item | `parentId?, label, href?, categoryId?, sortOrder?, status?` | `MenuItem` |
| `PATCH/DELETE /admin/menus/:id/items/:itemId` | `marketing.manage` | 3 | Edit/delete item | — | `MenuItem` |
| `POST /admin/menus/items/:itemId/mega-menu-panel` | `marketing.manage` | 3 | Attach mega-menu panel | `columns: [{ title?, sortOrder?, links: [{label, categoryId?, href?, sortOrder?}] }]` | `MegaMenuPanel` |

## 12. Domain: Content / CMS Admin

Backed by `BlogCategory`, `Author`, `BlogPost`, `Page`, `FaqCategory`, `Faq`, `Testimonial`,
`Enquiry`.

| Endpoint | Permission | Phase | Purpose | Key Request Fields | Key Response Fields |
|---|---|---|---|---|---|
| `GET/POST /admin/blog/categories` | `content.manage` | 3 | List/create blog categories | `title, slug, sortOrder?, status?` | `BlogCategory` |
| `GET/POST /admin/blog/authors` | `content.manage` | 3 | List/create authors | `name, role?, bio?, status?` | `Author` |
| `GET/POST /admin/blog/posts` | `content.manage` | 3 | List/create posts | `blogCategoryId?, authorId?, title, slug, excerpt?, content, tags?, isFeatured?, status?, publishedAt?, metaTitle?, metaDescription?` | `BlogPost` |
| `PATCH/DELETE /admin/blog/posts/:id` | `content.manage` | 3 | Edit/delete post | — | `BlogPost` |
| `GET/POST /admin/pages` | `content.manage` | 3 | List/create CMS pages | `slug, title, contentBlocks?, metaTitle?, metaDescription?, status?` | `Page` |
| `PATCH/DELETE /admin/pages/:id` | `content.manage` | 3 | Edit/delete (blocked if `isSystemPage`) | — | `Page` |
| `GET/POST /admin/faq-categories` | `content.manage` | 3 | List/create FAQ categories | `name, sortOrder?, status?` | `FaqCategory` |
| `POST /admin/faq-categories/:id/faqs` | `content.manage` | 3 | Add FAQ | `question, answer, sortOrder?, status?` | `Faq` |
| `GET/POST /admin/testimonials` | `content.manage` | 3 | List/create testimonials | `name, title?, quote, stars, sortOrder?, status?` | `Testimonial` |
| `GET /admin/enquiries` | `content.manage` | 3 | List contact-form submissions | `page, perPage, status?, type?` | `Enquiry[]` |
| `PATCH /admin/enquiries/:id` | `content.manage` | 3 | Triage (status/notes) | `status` | `Enquiry` |

## 13. Domain: Gift Cards, Notifications & Settings Admin

Backed by `GiftCard`, `GiftCardTransaction`, `Notification`, `Setting`.

| Endpoint | Permission | Phase | Purpose | Key Request Fields | Key Response Fields |
|---|---|---|---|---|---|
| `GET /admin/gift-cards` | `gift_cards.manage` | 2 | List gift cards | `page, perPage, status?, q?(code)` | `GiftCard[]` |
| `POST /admin/gift-cards` | `gift_cards.manage` | 2 | Issue a gift card manually | `initialBalance, currency?, issuedToEmail?, expiresAt?` | `GiftCard` + `GiftCardTransaction(type=ISSUE)` |
| `PATCH /admin/gift-cards/:id` | `gift_cards.manage` | 2 | Disable / adjust balance | `status?, adjustment?` | `GiftCard` + `GiftCardTransaction(type=ADJUSTMENT)` if adjusted |
| `POST /admin/notifications` | `notifications.manage` | 3 | Broadcast/create a notification | `userId? (or all), type, title, message, metadata?` | `Notification` |
| `GET /admin/settings` | `settings.manage` | 1 | List all settings | — | `Setting[]` (full, unlike public subset) |
| `PUT /admin/settings/:key` | `settings.manage` | 1 | Upsert a setting | `value` (JSON) | `Setting` |

## 14. Domain: Reports (last phase)

Read-only aggregate endpoints, no dedicated models — computed from `Order`/`OrderItem`/`User`/
`ProductVariant`/`Review` at query time (or from a future materialized/rollup table if performance
requires it).

| Endpoint | Permission | Phase | Purpose | Key Request Fields | Key Response Fields |
|---|---|---|---|---|---|
| `GET /admin/reports/sales` | `reports.view` | 3 | Revenue over time | `dateFrom, dateTo, groupBy=day\|week\|month` | `{ points: [{ period, revenue, orderCount }] }` |
| `GET /admin/reports/products` | `reports.view` | 3 | Best/worst sellers, stock levels | `dateFrom?, dateTo?, sort` | `{ rows: [{ productId, title, unitsSold, revenue, stockQty }] }` |
| `GET /admin/reports/customers` | `reports.view` | 3 | New vs. returning, top spenders | `dateFrom, dateTo` | `{ newCustomers, returningCustomers, topSpenders: [...] }` |
| `GET /admin/reports/inventory` | `reports.view` | 3 | Low-stock / out-of-stock | `?threshold=` | `ProductVariant[]` where `stockQty <= lowStockThreshold` |
| `GET /admin/reports/orders` | `reports.view` | 3 | Order funnel / status breakdown | `dateFrom, dateTo` | `{ byStatus: {...}, byPaymentStatus: {...} }` |

## 15. Phase Roadmap Summary

- **Phase 1 (Admin MVP — run the store):** Admin Auth, Customers (view/suspend), full Catalog
  admin (categories/brands/products/variants/attributes/conditions/tax rates), Media, Shipping
  methods, Orders (status/tracking/notes), Settings.
- **Phase 2:** RBAC (roles/permissions/staff management), Collections, Coupons, Returns & refunds,
  Payment transaction/dispute views, Reviews moderation, Gift cards.
- **Phase 3:** Marketing (banners/featured sections/hero/menus), Content/CMS, Notifications
  (admin-authored), bulk product import, Reports.

## 16. Explicitly Excluded / Deferred

- Storefront API — see companion document.
- Fine-grained per-field permissions (current model is coarse `domain.action` keys, matching the
  existing seed data) — revisit only if a real need for finer RBAC emerges.
- Audit log of admin actions (who changed what, beyond `OrderStatusHistory`'s
  `changedByAdminId`) — not backed by a schema table today.
- CSV/JSON import format and validation rules for `/admin/products/import` — needs its own
  design pass when Phase 3 is scheduled.

## 17. Open Assumptions

- New permission keys introduced here (`admins.manage`, `customers.manage`, `media.manage`,
  `shipping.manage`, `orders.refund`, `marketing.manage`, `reviews.moderate`, `gift_cards.manage`,
  `notifications.manage`) extend `prisma/seed.ts`'s `permissionKeys` list and must be granted to
  the seeded Super Admin role as part of implementation.
- `PATCH /admin/products/:id/variants/:variantId/stock` semantics (absolute set vs. relative
  delta) are left to the implementation plan — likely both, via separate fields.
- Reports are computed on-the-fly for Phase 3; if data volume makes that too slow, a rollup table
  is a follow-up, not part of this plan.
