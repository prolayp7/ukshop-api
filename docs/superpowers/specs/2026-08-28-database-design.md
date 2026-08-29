# UK Computer Shop — Database Design

Status: approved by user, ready for implementation planning
Stack: NestJS + PostgreSQL + Prisma
Scope: full schema, single-vendor (no marketplace/seller layer)

## 1. Overview

This is a single-vendor e-commerce database for UK Computer Shop, covering
storefront catalog/search, cart/checkout, orders/payments/returns, reviews,
marketing/merchandising, blog/CMS content, and admin/RBAC — informed by the
`lcommerce` project's schema (a mature multi-vendor marketplace) but with all
marketplace-specific concerns removed: no `Seller`/`Store`/`Wallet`/
`DeliveryBoy`/commission tables, no India-specific GST/CGST/SGST/PIN-zone
modeling. Tax is modeled as UK VAT (single rate per product/tax class),
shipping as courier-based rates rather than owned delivery staff/zones.

Tables below are grouped by domain but form one Prisma schema. Field lists
use a Prisma-like pseudo-syntax for precision; the actual `schema.prisma`
is produced in the implementation plan, not here.

## 2. Conventions

- **Primary keys**: `Int @id @default(autoincrement())` everywhere for join
  performance. Public/customer-facing entities additionally get a
  `uuid String @unique @default(uuid())` so external IDs (URLs, API
  responses) don't leak sequential IDs: `User`, `Address`, `Product`,
  `ProductVariant`, `Order`, `Review`, `PaymentTransaction`, `GiftCard`.
  Purely internal/admin lookup tables (`Category`, `Brand`, `TaxRate`, ...)
  skip it — slug or plain ID is fine for those.
- **Money**: `Decimal(10,2)`, single currency (GBP). No currency-conversion
  tables.
- **Soft delete** (`deletedAt DateTime?`): only on entities admins "remove"
  but that need audit/recovery later — `User`, `AdminUser`, `Product`,
  `ProductVariant`, `Category`, `ProductAttribute`, `Coupon`. Transactional
  records (`Order`, `OrderItem`, `Review`, `PaymentTransaction`, ...) are
  never deleted — status enums track their lifecycle instead.
- **Timestamps**: `createdAt`/`updatedAt` on all non-pivot tables.
- **Slugs**: unique, app-generated, on `Product`, `Category`, `Brand`,
  `BlogPost`, `BlogCategory`, `Page`, `Collection`, `Menu`.
- **Naming**: Prisma models PascalCase singular; `@@map` to snake_case
  plural table names; fields camelCase, `@map` to snake_case columns.
- **Deletion/integrity rules**: FKs from transactional tables (`OrderItem`,
  `CartItem`, `Review`, ...) to catalog/identity tables (`Product`,
  `ProductVariant`, `User`) use `onDelete: Restrict` — a product with order
  history can be soft-deleted (hidden) but never hard-deleted. `Category`
  deletion is blocked at the application layer while it (or a descendant)
  has products, mirroring lcommerce's explicit check.

## 3. Media (cross-cutting)

Referenced by Catalog, Marketing, and Content domains below. Prisma cannot
express a true FK across a polymorphic `(ownerType, ownerId)` pair — there
is no DB-level referential integrity here, and no automatic cascade delete.
**Every domain that owns media must explicitly delete its `Media` rows when
the owning row is deleted** (a Prisma middleware or service-layer hook) or
orphaned rows accumulate. This is the same limitation Laravel's morph
relations have, and lcommerce works around it with explicit `deleting`
hooks — same approach applies here.

```
enum MediaOwnerType {
  PRODUCT PRODUCT_VARIANT CATEGORY BRAND
  BLOG_POST BLOG_CATEGORY AUTHOR PAGE
  BANNER TESTIMONIAL HERO_SLIDE
  USER REVIEW ORDER_ITEM_RETURN
}

model Media {
  id          Int    @id @default(autoincrement())
  uuid        String @unique @default(uuid())
  ownerType   MediaOwnerType
  ownerId     Int
  collection  String   // "main_image" | "gallery" | "icon" | "banner" | "background" | "avatar" | ...
  url         String
  altText     String?
  sortOrder   Int      @default(0)
  metadata    Json?    // width/height/mime/etc.
  createdAt   DateTime @default(now())

  @@index([ownerType, ownerId, collection])
}
```

## 4. Identity & Access

```
enum UserStatus { ACTIVE SUSPENDED }
enum AddressType { BILLING SHIPPING BOTH }
enum AdminUserStatus { ACTIVE DISABLED }
enum OtpChannel { EMAIL SMS }

model User {
  id                Int       @id @default(autoincrement())
  uuid              String    @unique @default(uuid())
  email             String    @unique
  emailVerifiedAt   DateTime?
  phone             String?   @unique
  mobileVerifiedAt  DateTime?
  passwordHash      String
  firstName         String
  lastName          String
  status            UserStatus @default(ACTIVE)
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt
  deletedAt         DateTime?

  addresses         Address[]
  orders            Order[]
  carts             Cart[]
  wishlists         Wishlist[]
  reviews           Review[]
  browsingHistory   BrowsingHistory[]
  orderItemReturns  OrderItemReturn[]
  giftCards         GiftCard[]
  // profile image via Media, ownerType = USER
}

model Address {
  id           Int      @id @default(autoincrement())
  uuid         String   @unique @default(uuid())
  userId       Int
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  label        String?
  fullName     String
  companyName  String?
  line1        String
  line2        String?
  city         String
  county       String?
  postcode     String
  country      String   @default("GB")
  phone        String?
  addressType  AddressType @default(BOTH)
  isDefault    Boolean  @default(false)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@index([userId])
}

model AdminUser {
  id            Int      @id @default(autoincrement())
  email         String   @unique
  passwordHash  String
  name          String
  status        AdminUserStatus @default(ACTIVE)
  roleId        Int
  role          Role     @relation(fields: [roleId], references: [id], onDelete: Restrict)
  lastLoginAt   DateTime?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  deletedAt     DateTime?

  orderStatusChanges OrderStatusHistory[]
}

model Role {
  id            Int      @id @default(autoincrement())
  name          String   @unique   // "Super Admin", "Catalog Manager", "Support", ...
  description   String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  adminUsers    AdminUser[]
  permissions   RolePermission[]
}

model Permission {
  id            Int      @id @default(autoincrement())
  key           String   @unique  // "products.create", "orders.refund", ...
  description   String?

  roles         RolePermission[]
}

model RolePermission {
  roleId        Int
  permissionId  Int
  role          Role       @relation(fields: [roleId], references: [id], onDelete: Cascade)
  permission    Permission @relation(fields: [permissionId], references: [id], onDelete: Cascade)

  @@id([roleId, permissionId])
}

model OtpVerification {
  id          Int      @id @default(autoincrement())
  identifier  String   // email or phone
  channel     OtpChannel
  code        String
  purpose     String   // "registration" | "login" | "password_reset" | ...
  expiresAt   DateTime
  consumedAt  DateTime?
  createdAt   DateTime @default(now())

  @@index([identifier, purpose])
}
```

## 5. Catalog

```
enum CatalogStatus { ACTIVE INACTIVE }
enum ProductStatus { DRAFT ACTIVE ARCHIVED }
enum AttributeInputType { SELECT COLOR_SWATCH IMAGE_SWATCH TEXT }

model Category {
  id                Int       @id @default(autoincrement())
  parentId          Int?
  parent            Category? @relation("CategoryTree", fields: [parentId], references: [id], onDelete: Restrict)
  children          Category[] @relation("CategoryTree")
  title             String
  slug              String    @unique
  description       String?
  sortOrder         Int       @default(0)
  isIndexable       Boolean   @default(true)
  metaTitle         String?
  metaDescription   String?
  status            CatalogStatus @default(ACTIVE)
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt
  deletedAt         DateTime?

  products          Product[]
  secondaryProducts CategoryProduct[]
  menuItems         MenuItem[]
  megaMenuLinks     MegaMenuLink[]
  featuredSections  FeaturedSection[]
  banners           Banner[]
  // icon/banner/background image via Media, ownerType = CATEGORY

  @@index([parentId])
}

model Brand {
  id            Int      @id @default(autoincrement())
  title         String
  slug          String   @unique
  description   String?
  status        CatalogStatus @default(ACTIVE)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  products      Product[]
  banners       Banner[]
  // logo via Media, ownerType = BRAND
}

model ProductCondition {
  id      Int    @id @default(autoincrement())
  title   String // New, Refurbished, Open Box, Used
  slug    String @unique

  products Product[]
}

model ProductAttribute {
  id             Int      @id @default(autoincrement())
  title          String
  slug           String   @unique
  inputType      AttributeInputType @default(SELECT)
  isFilterable   Boolean  @default(true)
  deletedAt      DateTime?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  values         ProductAttributeValue[]
  variantValues  ProductVariantAttribute[]
}

model ProductAttributeValue {
  id            Int      @id @default(autoincrement())
  attributeId   Int
  attribute     ProductAttribute @relation(fields: [attributeId], references: [id], onDelete: Cascade)
  value         String
  swatchValue   String?  // hex code or image URL
  sortOrder     Int      @default(0)

  variantValues ProductVariantAttribute[]

  @@unique([attributeId, value])
}

model Product {
  id                  Int       @id @default(autoincrement())
  uuid                String    @unique @default(uuid())
  categoryId          Int
  category            Category  @relation(fields: [categoryId], references: [id], onDelete: Restrict)
  brandId             Int?
  brand               Brand?    @relation(fields: [brandId], references: [id], onDelete: SetNull)
  productConditionId  Int?
  productCondition    ProductCondition? @relation(fields: [productConditionId], references: [id], onDelete: SetNull)
  taxRateId           Int?
  taxRate             TaxRate?  @relation(fields: [taxRateId], references: [id], onDelete: SetNull)
  title               String
  slug                String    @unique
  sku                 String?   @unique
  mpn                 String?   // manufacturer part number
  shortDescription    String?
  description         String?
  specsSummary        Json?     // key specs for listing cards, denormalized from variant attributes
  warrantyMonths      Int?
  isReturnable        Boolean   @default(true)
  returnableDays      Int       @default(30)
  status              ProductStatus @default(DRAFT)
  isFeatured          Boolean   @default(false)
  isTopProduct        Boolean   @default(false)
  isIndexable         Boolean   @default(true)
  metaTitle           String?
  metaDescription     String?
  deletedAt           DateTime?
  createdAt           DateTime  @default(now())
  updatedAt           DateTime  @updatedAt

  variants               ProductVariant[]
  secondaryCategories    CategoryProduct[]
  faqs                   ProductFaq[]
  reviews                Review[]
  orderItems             OrderItem[]
  browsingHistory        BrowsingHistory[]
  collections            CollectionProduct[]
  featuredSectionEntries FeaturedSectionProduct[]
  banners                Banner[]
  // gallery/main image via Media, ownerType = PRODUCT

  @@index([categoryId])
  @@index([brandId])
  @@index([status])
}

model CategoryProduct {
  categoryId  Int
  productId   Int
  category    Category @relation(fields: [categoryId], references: [id], onDelete: Cascade)
  product     Product  @relation(fields: [productId], references: [id], onDelete: Cascade)

  @@id([categoryId, productId])
}

model ProductVariant {
  id            Int       @id @default(autoincrement())
  uuid          String    @unique @default(uuid())
  productId     Int
  product       Product   @relation(fields: [productId], references: [id], onDelete: Restrict)
  title         String    // "32GB / 3600MHz"
  slug          String    @unique
  barcode       String?   @unique
  price         Decimal   @db.Decimal(10, 2)
  salePrice     Decimal?  @db.Decimal(10, 2)
  stockQty      Int       @default(0)
  lowStockThreshold Int   @default(5)
  weightKg      Decimal?  @db.Decimal(6, 3)
  lengthCm      Decimal?  @db.Decimal(6, 2)
  widthCm       Decimal?  @db.Decimal(6, 2)
  heightCm      Decimal?  @db.Decimal(6, 2)
  isDefault     Boolean   @default(false)
  status        CatalogStatus @default(ACTIVE)
  deletedAt     DateTime?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  attributes    ProductVariantAttribute[]
  cartItems     CartItem[]
  wishlistItems WishlistItem[]
  orderItems    OrderItem[]
  // gallery image via Media, ownerType = PRODUCT_VARIANT

  @@index([productId])
}

model ProductVariantAttribute {
  id                 Int      @id @default(autoincrement())
  productVariantId   Int
  productVariant     ProductVariant @relation(fields: [productVariantId], references: [id], onDelete: Cascade)
  attributeId        Int
  attribute          ProductAttribute @relation(fields: [attributeId], references: [id], onDelete: Restrict)
  attributeValueId   Int
  attributeValue     ProductAttributeValue @relation(fields: [attributeValueId], references: [id], onDelete: Restrict)

  @@unique([productVariantId, attributeId])
}

model ProductFaq {
  id          Int      @id @default(autoincrement())
  productId   Int
  product     Product  @relation(fields: [productId], references: [id], onDelete: Cascade)
  question    String
  answer      String
  sortOrder   Int      @default(0)
}

model Collection {
  id           Int      @id @default(autoincrement())
  title        String
  slug         String   @unique
  description  String?
  type         String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  products     CollectionProduct[]
}

model CollectionProduct {
  collectionId  Int
  productId     Int
  sortOrder     Int        @default(0)
  collection    Collection @relation(fields: [collectionId], references: [id], onDelete: Cascade)
  product       Product    @relation(fields: [productId], references: [id], onDelete: Cascade)

  @@id([collectionId, productId])
}
```

## 6. Cart & Personalization

```
model Cart {
  id          Int      @id @default(autoincrement())
  userId      Int?
  user        User?    @relation(fields: [userId], references: [id], onDelete: Cascade)
  guestToken  String?  @unique  // set when userId is null; stored client-side (cookie/localStorage)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  items       CartItem[]

  @@index([userId])
}

model CartItem {
  id                Int      @id @default(autoincrement())
  cartId            Int
  cart              Cart     @relation(fields: [cartId], references: [id], onDelete: Cascade)
  productVariantId  Int
  productVariant    ProductVariant @relation(fields: [productVariantId], references: [id], onDelete: Restrict)
  quantity          Int
  savedForLater     Boolean  @default(false)
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@unique([cartId, productVariantId])
}

model Wishlist {
  id        Int      @id @default(autoincrement())
  userId    Int
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  title     String   @default("My Wishlist")
  slug      String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  items     WishlistItem[]
}

model WishlistItem {
  id                Int      @id @default(autoincrement())
  wishlistId        Int
  wishlist          Wishlist @relation(fields: [wishlistId], references: [id], onDelete: Cascade)
  productVariantId  Int
  productVariant    ProductVariant @relation(fields: [productVariantId], references: [id], onDelete: Cascade)
  createdAt         DateTime @default(now())

  @@unique([wishlistId, productVariantId])
}

model BrowsingHistory {
  id         Int      @id @default(autoincrement())
  userId     Int?
  user       User?    @relation(fields: [userId], references: [id], onDelete: Cascade)
  sessionId  String?  // for guests
  productId  Int
  product    Product  @relation(fields: [productId], references: [id], onDelete: Cascade)
  viewedAt   DateTime @default(now())

  @@index([userId, viewedAt])
  @@index([sessionId, viewedAt])
}
```

## 7. Orders, Payments & Fulfillment

```
enum OrderStatus { PENDING AWAITING_PAYMENT PROCESSING PACKED SHIPPED DELIVERED CANCELLED FAILED }
enum PaymentStatus { PENDING PAID FAILED REFUNDED PARTIALLY_REFUNDED }
enum OrderItemStatus { PENDING PROCESSING PACKED SHIPPED DELIVERED RETURNED CANCELLED REFUNDED }
enum ReturnStatus { REQUESTED APPROVED REJECTED RECEIVED REFUNDED }
enum PickupStatus { PENDING SCHEDULED PICKED_UP }
enum PaymentTxnStatus { PENDING AUTHORIZED CAPTURED FAILED }
enum RefundStatus { PENDING PROCESSED FAILED }
enum DisputeStatus { WARNING NEEDS_RESPONSE UNDER_REVIEW WON LOST }
enum ShippingRateType { FLAT WEIGHT_BANDED }

model TaxRate {
  id           Int      @id @default(autoincrement())
  title        String   @unique // "Standard", "Reduced", "Zero-rated"
  ratePercent  Decimal  @db.Decimal(5, 2)
  isDefault    Boolean  @default(false)
  status       CatalogStatus @default(ACTIVE)

  products     Product[]
}

model ShippingMethod {
  id                Int      @id @default(autoincrement())
  title             String   // "Royal Mail Tracked 48", "DHL Next Day"
  carrier           String
  rateType          ShippingRateType @default(FLAT)
  flatRate          Decimal? @db.Decimal(10, 2)
  freeOverAmount    Decimal? @db.Decimal(10, 2)
  estimatedDaysMin  Int?
  estimatedDaysMax  Int?
  status            CatalogStatus @default(ACTIVE)

  rateBands         ShippingRateBand[]
  orders            Order[]
}

model ShippingRateBand {
  id                Int      @id @default(autoincrement())
  shippingMethodId  Int
  shippingMethod    ShippingMethod @relation(fields: [shippingMethodId], references: [id], onDelete: Cascade)
  minWeightKg       Decimal  @db.Decimal(6, 3)
  maxWeightKg       Decimal  @db.Decimal(6, 3)
  rate              Decimal  @db.Decimal(10, 2)
}

model Order {
  id                Int      @id @default(autoincrement())
  uuid              String   @unique @default(uuid())
  orderNumber       String   @unique
  userId            Int?
  user              User?    @relation(fields: [userId], references: [id], onDelete: SetNull)
  email             String
  phone             String?
  status            OrderStatus @default(PENDING)
  paymentStatus     PaymentStatus @default(PENDING)

  billingFullName   String
  billingCompanyName String?
  billingLine1      String
  billingLine2      String?
  billingCity       String
  billingCounty     String?
  billingPostcode   String
  billingCountry    String   @default("GB")
  billingPhone      String?

  shippingFullName  String
  shippingCompanyName String?
  shippingLine1     String
  shippingLine2     String?
  shippingCity      String
  shippingCounty    String?
  shippingPostcode  String
  shippingCountry   String   @default("GB")
  shippingPhone     String?

  shippingMethodId  Int?
  shippingMethod    ShippingMethod? @relation(fields: [shippingMethodId], references: [id], onDelete: SetNull)

  subtotal          Decimal  @db.Decimal(10, 2)
  discountTotal     Decimal  @db.Decimal(10, 2) @default(0)
  shippingCharge    Decimal  @db.Decimal(10, 2) @default(0)
  vatTotal          Decimal  @db.Decimal(10, 2) @default(0)
  giftCardDiscount  Decimal  @db.Decimal(10, 2) @default(0)
  total             Decimal  @db.Decimal(10, 2)

  couponCode        String?
  customerNote      String?
  adminNote         String?

  trackingCarrier   String?
  trackingNumber    String?
  trackingUrl       String?

  placedAt          DateTime @default(now())
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  items             OrderItem[]
  statusHistory     OrderStatusHistory[]
  paymentTransactions PaymentTransaction[]
  paymentRefunds    PaymentRefund[]
  paymentDisputes   PaymentDispute[]
  couponLine        OrderCouponLine?
  reviews           Review[]
  giftCardTransactions GiftCardTransaction[]

  @@index([userId])
  @@index([status])
}

model OrderItem {
  id                    Int      @id @default(autoincrement())
  orderId               Int
  order                 Order    @relation(fields: [orderId], references: [id], onDelete: Cascade)
  productId             Int
  product               Product  @relation(fields: [productId], references: [id], onDelete: Restrict)
  productVariantId      Int
  productVariant        ProductVariant @relation(fields: [productVariantId], references: [id], onDelete: Restrict)
  titleSnapshot         String
  variantTitleSnapshot  String
  skuSnapshot           String?
  quantity              Int
  unitPrice             Decimal  @db.Decimal(10, 2)
  discount              Decimal  @db.Decimal(10, 2) @default(0)
  vatRatePercent        Decimal  @db.Decimal(5, 2)
  vatAmount             Decimal  @db.Decimal(10, 2)
  subtotal              Decimal  @db.Decimal(10, 2)
  status                OrderItemStatus @default(PENDING)
  returnEligible        Boolean  @default(true)
  returnDeadline        DateTime? @db.Date
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt

  returns               OrderItemReturn[]
  review                Review?

  @@index([orderId])
}

model OrderStatusHistory {
  id                Int      @id @default(autoincrement())
  orderId           Int
  order             Order    @relation(fields: [orderId], references: [id], onDelete: Cascade)
  fromStatus        String?
  toStatus          String
  note              String?
  changedByAdminId  Int?
  changedByAdmin    AdminUser? @relation(fields: [changedByAdminId], references: [id], onDelete: SetNull)
  createdAt         DateTime @default(now())

  @@index([orderId])
}

model OrderItemReturn {
  id             Int      @id @default(autoincrement())
  orderItemId    Int
  orderItem      OrderItem @relation(fields: [orderItemId], references: [id], onDelete: Cascade)
  userId         Int
  user           User     @relation(fields: [userId], references: [id], onDelete: Restrict)
  reason         String
  comment        String?
  refundAmount   Decimal? @db.Decimal(10, 2)
  returnStatus   ReturnStatus @default(REQUESTED)
  pickupStatus   PickupStatus?
  approvedAt     DateTime?
  receivedAt     DateTime?
  refundedAt     DateTime?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  // images via Media, ownerType = ORDER_ITEM_RETURN
}

model PaymentTransaction {
  id                     Int      @id @default(autoincrement())
  uuid                   String   @unique @default(uuid())
  orderId                Int
  order                  Order    @relation(fields: [orderId], references: [id], onDelete: Restrict)
  userId                 Int?
  provider               String   // "stripe", "paypal", ...
  providerTransactionId  String   @unique
  amount                 Decimal  @db.Decimal(10, 2)
  currency               String   @default("GBP")
  status                 PaymentTxnStatus @default(PENDING)
  rawPayload             Json?
  createdAt              DateTime @default(now())
  updatedAt              DateTime @updatedAt

  refunds                PaymentRefund[]
  disputes               PaymentDispute[]
}

model PaymentRefund {
  id                Int      @id @default(autoincrement())
  transactionId     Int
  transaction       PaymentTransaction @relation(fields: [transactionId], references: [id], onDelete: Restrict)
  orderId           Int
  order             Order    @relation(fields: [orderId], references: [id], onDelete: Restrict)
  amount            Decimal  @db.Decimal(10, 2)
  providerRefundId  String?
  status            RefundStatus @default(PENDING)
  reason            String?
  rawPayload        Json?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
}

model PaymentDispute {
  id                  Int      @id @default(autoincrement())
  transactionId       Int
  transaction         PaymentTransaction @relation(fields: [transactionId], references: [id], onDelete: Restrict)
  orderId             Int
  order               Order    @relation(fields: [orderId], references: [id], onDelete: Restrict)
  providerDisputeId   String   @unique
  amount              Decimal  @db.Decimal(10, 2)
  status              DisputeStatus
  reasonCode          String?
  reasonDescription   String?
  respondBy           DateTime?
  rawPayload          Json?
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt
}

model PaymentWebhookLog {
  id              Int      @id @default(autoincrement())
  provider        String
  eventType       String
  providerEventId String?  @unique // the provider's own event id (e.g. Stripe's evt_...) — lets a redelivered webhook be recognized and skipped instead of double-processed
  payload         Json
  processedAt     DateTime?
  createdAt       DateTime @default(now())
}

model Review {
  id            Int      @id @default(autoincrement())
  uuid          String   @unique @default(uuid())
  productId     Int
  product       Product  @relation(fields: [productId], references: [id], onDelete: Cascade)
  orderItemId   Int?     @unique
  orderItem     OrderItem? @relation(fields: [orderItemId], references: [id], onDelete: SetNull)
  orderId       Int?
  order         Order?   @relation(fields: [orderId], references: [id], onDelete: SetNull)
  userId        Int?
  user          User?    @relation(fields: [userId], references: [id], onDelete: SetNull)
  reviewerName  String?
  rating        Int
  title         String?
  comment       String?
  status        ReviewStatus @default(PENDING)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  // images via Media, ownerType = REVIEW

  @@index([productId, status])
}

enum ReviewStatus { PENDING APPROVED REJECTED }
```

## 8. Marketing & Merchandising

```
enum DiscountType { FIXED PERCENT }
enum BannerLinkType { PRODUCT CATEGORY BRAND CUSTOM_URL }
enum FeaturedSectionType { NEWLY_ADDED FEATURED BEST_SELLER TOP_RATED MANUAL }
enum MenuLocation { HEADER FOOTER }

model Coupon {
  id                  Int      @id @default(autoincrement())
  code                String   @unique
  description         String?
  discountType        DiscountType
  discountAmount      Decimal  @db.Decimal(10, 2)
  appliesToShipping   Boolean  @default(false)
  minOrderTotal       Decimal? @db.Decimal(10, 2)
  maxDiscountValue    Decimal? @db.Decimal(10, 2)
  startsAt            DateTime?
  endsAt              DateTime?
  maxTotalUsage       Int?
  maxUsagePerUser     Int?
  usageCount          Int      @default(0)
  deletedAt           DateTime?
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  orderLines          OrderCouponLine[]
}

model OrderCouponLine {
  id              Int      @id @default(autoincrement())
  orderId         Int      @unique
  order           Order    @relation(fields: [orderId], references: [id], onDelete: Cascade)
  couponId        Int
  coupon          Coupon   @relation(fields: [couponId], references: [id], onDelete: Restrict)
  couponCode      String
  discountAmount  Decimal  @db.Decimal(10, 2)
  createdAt       DateTime @default(now())
}

model Banner {
  id            Int      @id @default(autoincrement())
  title         String
  slug          String   @unique
  linkType      BannerLinkType
  productId     Int?
  product       Product?  @relation(fields: [productId], references: [id], onDelete: SetNull)
  categoryId    Int?
  category      Category? @relation(fields: [categoryId], references: [id], onDelete: SetNull)
  brandId       Int?
  brand         Brand?    @relation(fields: [brandId], references: [id], onDelete: SetNull)
  customUrl     String?
  position      String   // "homepage_top" | "category_sidebar" | ...
  displayOrder  Int      @default(0)
  status        CatalogStatus @default(ACTIVE)
  startsAt      DateTime?
  endsAt        DateTime?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  // image via Media, ownerType = BANNER
}

model FeaturedSection {
  id            Int      @id @default(autoincrement())
  title         String
  slug          String   @unique
  sectionType   FeaturedSectionType
  categoryId    Int?
  category      Category? @relation(fields: [categoryId], references: [id], onDelete: SetNull)
  sortOrder     Int      @default(0)
  status        CatalogStatus @default(ACTIVE)

  manualProducts FeaturedSectionProduct[]
}

model FeaturedSectionProduct {
  featuredSectionId  Int
  productId          Int
  sortOrder          Int @default(0)
  featuredSection    FeaturedSection @relation(fields: [featuredSectionId], references: [id], onDelete: Cascade)
  product            Product @relation(fields: [productId], references: [id], onDelete: Cascade)

  @@id([featuredSectionId, productId])
}

model HeroSlide {
  id          Int      @id @default(autoincrement())
  headline    String
  subheading  String?
  ctaLabel    String?
  ctaUrl      String?
  sortOrder   Int      @default(0)
  status      CatalogStatus @default(ACTIVE)
  startsAt    DateTime?
  endsAt      DateTime?
  // image via Media, ownerType = HERO_SLIDE
}

model HeroTrustBadge {
  id         Int      @id @default(autoincrement())
  label      String
  icon       String?
  sortOrder  Int      @default(0)
  status     CatalogStatus @default(ACTIVE)
}

model Menu {
  id        Int      @id @default(autoincrement())
  name      String
  slug      String   @unique
  location  MenuLocation
  status    CatalogStatus @default(ACTIVE)

  items     MenuItem[]
}

model MenuItem {
  id          Int      @id @default(autoincrement())
  menuId      Int
  menu        Menu     @relation(fields: [menuId], references: [id], onDelete: Cascade)
  parentId    Int?
  parent      MenuItem? @relation("MenuItemTree", fields: [parentId], references: [id], onDelete: Cascade)
  children    MenuItem[] @relation("MenuItemTree")
  label       String
  href        String?
  categoryId  Int?
  category    Category? @relation(fields: [categoryId], references: [id], onDelete: SetNull)
  sortOrder   Int      @default(0)
  status      CatalogStatus @default(ACTIVE)

  megaMenuPanel MegaMenuPanel?
}

model MegaMenuPanel {
  id          Int      @id @default(autoincrement())
  menuItemId  Int      @unique
  menuItem    MenuItem @relation(fields: [menuItemId], references: [id], onDelete: Cascade)
  sortOrder   Int      @default(0)

  columns     MegaMenuColumn[]
}

model MegaMenuColumn {
  id        Int      @id @default(autoincrement())
  panelId   Int
  panel     MegaMenuPanel @relation(fields: [panelId], references: [id], onDelete: Cascade)
  title     String?
  sortOrder Int      @default(0)

  links     MegaMenuLink[]
}

model MegaMenuLink {
  id          Int      @id @default(autoincrement())
  columnId    Int
  column      MegaMenuColumn @relation(fields: [columnId], references: [id], onDelete: Cascade)
  label       String
  categoryId  Int?
  category    Category? @relation(fields: [categoryId], references: [id], onDelete: SetNull)
  href        String?
  sortOrder   Int      @default(0)
}
```

## 9. Content / CMS

```
enum ContentStatus { DRAFT PUBLISHED }
enum EnquiryStatus { NEW IN_PROGRESS RESOLVED }

model BlogCategory {
  id         Int      @id @default(autoincrement())
  title      String
  slug       String   @unique
  sortOrder  Int      @default(0)
  status     CatalogStatus @default(ACTIVE)

  posts      BlogPost[]
}

model Author {
  id      Int      @id @default(autoincrement())
  name    String
  role    String?
  bio     String?
  status  CatalogStatus @default(ACTIVE)
  // avatar via Media, ownerType = AUTHOR

  posts   BlogPost[]
}

model BlogPost {
  id              Int      @id @default(autoincrement())
  uuid            String   @unique @default(uuid())
  blogCategoryId  Int?
  blogCategory    BlogCategory? @relation(fields: [blogCategoryId], references: [id], onDelete: SetNull)
  authorId        Int?
  author          Author?  @relation(fields: [authorId], references: [id], onDelete: SetNull)
  title           String
  slug            String   @unique
  excerpt         String?
  content         String
  tags            Json?
  isFeatured      Boolean  @default(false)
  status          ContentStatus @default(DRAFT)
  publishedAt     DateTime?
  metaTitle       String?
  metaDescription String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  // featured image via Media, ownerType = BLOG_POST
}

model Page {
  id              Int      @id @default(autoincrement())
  slug            String   @unique
  title           String
  contentBlocks   Json?
  metaTitle       String?
  metaDescription String?
  status          ContentStatus @default(DRAFT)
  isSystemPage    Boolean  @default(false)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  // section images via Media, ownerType = PAGE
}

model FaqCategory {
  id         Int      @id @default(autoincrement())
  name       String
  sortOrder  Int      @default(0)
  status     CatalogStatus @default(ACTIVE)

  faqs       Faq[]
}

model Faq {
  id             Int      @id @default(autoincrement())
  faqCategoryId  Int?
  faqCategory    FaqCategory? @relation(fields: [faqCategoryId], references: [id], onDelete: SetNull)
  question       String
  answer         String
  sortOrder      Int      @default(0)
  status         CatalogStatus @default(ACTIVE)
}

model Testimonial {
  id         Int      @id @default(autoincrement())
  name       String
  title      String?
  quote      String
  stars      Int
  sortOrder  Int      @default(0)
  status     CatalogStatus @default(ACTIVE)
  // avatar via Media, ownerType = TESTIMONIAL
}

model Enquiry {
  id        Int      @id @default(autoincrement())
  type      String   // "contact" | "wholesale" | ...
  name      String
  email     String?
  phone     String?
  subject   String?
  message   String
  status    EnquiryStatus @default(NEW)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

## 10. Search & Personalization

```
enum TrendingPeriod { DAILY WEEKLY MONTHLY }

model SearchLog {
  id           Int      @id @default(autoincrement())
  query        String
  resultCount  Int
  entityTypes  Json?
  userId       Int?
  sessionId    String?
  ipAddress    String?
  createdAt    DateTime @default(now())
}

model TrendingProduct {
  id           Int      @id @default(autoincrement())
  productId    Int
  product      Product  @relation(fields: [productId], references: [id], onDelete: Cascade)
  period       TrendingPeriod
  searchCount  Int      @default(0)
  viewCount    Int      @default(0)
  saleCount    Int      @default(0)
  score        Int      @default(0)
  computedAt   DateTime

  @@index([productId, period, computedAt])
}
```

(Recently Viewed is `BrowsingHistory`, §6.)

## 11. Notifications & Settings

```
// userId/adminUserId/orderId/sessionId below are deliberately plain columns,
// not Prisma relations: these are high-write, low-criticality log tables
// where a stale reference (user later deleted) shouldn't block inserts or
// require cascade bookkeeping — same trade-off as PaymentWebhookLog.
model Notification {
  id            String   @id @default(uuid())
  userId        Int?
  adminUserId   Int?
  orderId       Int?
  type          String
  title         String
  message       String
  isRead        Boolean  @default(false)
  metadata      Json?
  createdAt     DateTime @default(now())
}

model Setting {
  key    String @id
  value  Json
}
```

## 12. Gift Cards

Modeled as a stored-value balance + ledger (like lcommerce's `Wallet`/
`WalletTransaction` pattern), not lcommerce's single-use discount-voucher
`GiftCard` — that shape would just duplicate `Coupon` above.

```
enum GiftCardStatus { ACTIVE REDEEMED EXPIRED DISABLED }
enum GiftCardTxnType { ISSUE REDEEM REFUND ADJUSTMENT }

model GiftCard {
  id                 Int      @id @default(autoincrement())
  uuid               String   @unique @default(uuid())
  code               String   @unique
  initialBalance     Decimal  @db.Decimal(10, 2)
  currentBalance     Decimal  @db.Decimal(10, 2)
  currency           String   @default("GBP")
  purchasedByUserId  Int?
  purchasedByUser    User?    @relation(fields: [purchasedByUserId], references: [id], onDelete: SetNull)
  issuedToEmail      String?
  status             GiftCardStatus @default(ACTIVE)
  expiresAt          DateTime?
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  transactions       GiftCardTransaction[]
}

model GiftCardTransaction {
  id          Int      @id @default(autoincrement())
  giftCardId  Int
  giftCard    GiftCard @relation(fields: [giftCardId], references: [id], onDelete: Restrict)
  orderId     Int?
  order       Order?   @relation(fields: [orderId], references: [id], onDelete: SetNull)
  amount      Decimal  @db.Decimal(10, 2) // signed: + issue/refund, - redeem
  type        GiftCardTxnType
  createdAt   DateTime @default(now())
}
```

## 13. Explicitly out of scope (Phase 2 candidates)

Dropped from this pass, each addable later without touching existing
tables:

- **Marketplace tables** — `Seller`, `Store`, `Wallet`, `DeliveryBoy`,
  commission fields — this is a single-vendor shop.
- **India-specific tax/logistics** — CGST/SGST/IGST split, PIN-code
  service-area tables, state-based delivery zones — replaced with UK VAT
  (`TaxRate`) and courier-based `ShippingMethod`.
- **`SupportTicket`/`SupportTicketMessage`** threaded ticketing — nothing
  in requirement.md/pages.md calls for it beyond contact-form (`Enquiry`)
  and order returns (`OrderItemReturn`).
- **Push notification device tokens / `SystemUpdate`** — exist in
  lcommerce to support a companion mobile app; no mobile app in scope yet.
- **Loyalty/reward points** — not mentioned in requirement.md or pages.md.
- **Multi-currency, multi-warehouse** — single GBP currency, single stock
  pool assumed throughout.

## 14. Domain checklist (for implementation plan)

1. Media (cross-cutting)
2. Identity & Access
3. Catalog
4. Cart & Personalization
5. Orders, Payments & Fulfillment
6. Marketing & Merchandising
7. Content / CMS
8. Search & Personalization
9. Notifications & Settings
10. Gift Cards
