# UK Computer Shop Database Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the NestJS + PostgreSQL + Prisma project from scratch and implement the full 63-model database schema from the design spec, one domain at a time, each backed by a migration and a passing integration test.

**Architecture:** A single `prisma/schema.prisma` grows incrementally, one domain per task, in dependency order (a task never references a model that a later task defines). Each task appends its domain's models/enums, runs `prisma migrate dev` to generate and apply a migration, and proves the migration is structurally correct with a Jest integration test against a real local Postgres database (via Prisma Client) — not mocked. The final tasks add a seed script and do a from-scratch `migrate reset` to prove the whole migration history replays cleanly.

**Tech Stack:** NestJS 10, PostgreSQL 16 (via Docker Compose), Prisma 5, TypeScript 5, Jest 29, ts-node.

**Spec:** `docs/superpowers/specs/2026-08-28-database-design.md`

## Global Constraints

- Single-vendor schema — no `Seller`/`Store`/`Wallet`/`DeliveryBoy`/commission tables (spec §1).
- Money is `Decimal(10,2)`, single currency GBP, no currency-conversion tables (spec §2).
- Soft delete (`deletedAt DateTime?`) only on: `User`, `AdminUser`, `Product`, `ProductVariant`, `Category`, `ProductAttribute`, `Coupon`. Every other table is never hard/soft-deleted — status enums track lifecycle (spec §2).
- Primary keys are `Int @id @default(autoincrement())` everywhere; `uuid String @unique @default(uuid())` is added only on: `User`, `Address`, `Product`, `ProductVariant`, `Order`, `Review`, `PaymentTransaction`, `GiftCard` (spec §2).
- Prisma models are PascalCase singular, `@@map`'d to snake_case plural tables; fields are camelCase, `@map`'d to snake_case columns (spec §2).
- FKs from transactional tables to catalog/identity tables use `onDelete: Restrict`; `Category` deletion-with-descendant-products is blocked at the application layer, not the DB (spec §2) — that application-layer check is out of scope for this plan (schema only) and belongs in the future catalog service's implementation plan.
- `Media` is a cross-cutting polymorphic table (`ownerType` + `ownerId` + `collection`) with **no DB-level referential integrity** — every domain that owns media must clean it up at the application layer later; this plan only creates the `Media` table itself (spec §3).
- Testing approach for this plan: each domain's integration test proves the migration is structurally sound (relations resolve, key constraints fire) using 1–2 representative flows through that domain's models — it is **not** exhaustive business-logic testing (there is no business logic yet). Full CRUD/service-level test coverage belongs to each domain's future feature-implementation plan.

---

## File Structure

```
ukshop-api/
├── docker-compose.yml
├── docker/postgres-init/01-create-test-db.sql
├── .env                      # DATABASE_URL for dev DB (gitignored, already covered)
├── .env.test                 # DATABASE_URL for test DB (gitignored, already covered)
├── package.json
├── tsconfig.json
├── nest-cli.json
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   └── prisma/
│       ├── prisma.module.ts
│       └── prisma.service.ts
├── prisma/
│   ├── schema.prisma          # grows one domain per task
│   ├── seed.ts                # Task 13
│   └── migrations/            # one folder per `prisma migrate dev` run
└── test/
    ├── jest-db.json
    ├── setup/
    │   ├── env.js
    │   └── global-setup.js
    └── db/
        ├── 00-connection.integration.spec.ts
        ├── 01-media.integration.spec.ts
        ├── 02-identity.integration.spec.ts
        ├── 03-catalog.integration.spec.ts
        ├── 04-cart.integration.spec.ts
        ├── 05-orders.integration.spec.ts
        ├── 06-payments.integration.spec.ts
        ├── 07-marketing.integration.spec.ts
        ├── 08-content.integration.spec.ts
        ├── 09-search.integration.spec.ts
        ├── 10-notifications.integration.spec.ts
        └── 11-giftcards.integration.spec.ts
```

Each `test/db/NN-*.integration.spec.ts` file is self-contained: it creates whatever upstream fixture rows it needs (even ones defined in earlier tasks) in `beforeAll`, and deletes everything it created in `afterAll`, in FK-safe order. Tests never depend on another test file's leftover data.

---

### Task 1: Project scaffold — NestJS + Prisma + local Postgres

**Files:**
- Create: `docker-compose.yml`
- Create: `docker/postgres-init/01-create-test-db.sql`
- Create: `.env`
- Create: `.env.test`
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `nest-cli.json`
- Create: `.eslintrc.js`
- Create: `src/main.ts`
- Create: `src/app.module.ts`
- Create: `src/prisma/prisma.service.ts`
- Create: `src/prisma/prisma.module.ts`
- Create: `prisma/schema.prisma`
- Create: `test/jest-db.json`
- Create: `test/setup/env.js`
- Create: `test/setup/global-setup.js`
- Create: `test/db/00-connection.integration.spec.ts`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `PrismaService` (importable from `src/prisma/prisma.service.ts`, extends `PrismaClient`, has `$connect`/`$disconnect` lifecycle wired) — every later task's test file imports this. `prisma/schema.prisma` with `generator client` + `datasource db` blocks only, ready for models to be appended. `npm run test:db` command that every later task re-runs.

- [ ] **Step 1: Create the Postgres Docker Compose setup**

`docker-compose.yml`:
```yaml
services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: ukshop
      POSTGRES_PASSWORD: ukshop_dev_password
      POSTGRES_DB: ukshop_dev
    ports:
      - "5432:5432"
    volumes:
      - ukshop_pg_data:/var/lib/postgresql/data
      - ./docker/postgres-init:/docker-entrypoint-initdb.d

volumes:
  ukshop_pg_data:
```

`docker/postgres-init/01-create-test-db.sql`:
```sql
CREATE DATABASE ukshop_test;
```

- [ ] **Step 2: Bring the database up**

Run: `docker compose up -d`
Expected: `docker compose ps` shows the `postgres` service `running`/`healthy`. This creates both `ukshop_dev` (the default DB) and `ukshop_test` (via the init script) inside the same Postgres instance.

- [ ] **Step 3: Write the env files**

`.env` (already gitignored via the existing `.env` rule):
```
DATABASE_URL="postgresql://ukshop:ukshop_dev_password@localhost:5432/ukshop_dev?schema=public"
```

`.env.test` (already gitignored via the existing `.env.test` rule):
```
DATABASE_URL="postgresql://ukshop:ukshop_dev_password@localhost:5432/ukshop_test?schema=public"
```

Note: the repo already has an empty `.env.local` from an earlier setup step. Prisma's CLI only auto-loads a file named exactly `.env`, so that's the canonical file this plan uses; `.env.local` is left untouched.

- [ ] **Step 4: Write `package.json`**

```json
{
  "name": "ukshop-api",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "build": "nest build",
    "start": "nest start",
    "start:dev": "nest start --watch",
    "start:prod": "node dist/main.js",
    "lint": "eslint \"{src,test}/**/*.ts\" --fix",
    "test": "jest",
    "test:db": "jest --config test/jest-db.json --runInBand",
    "prisma:format": "prisma format",
    "prisma:validate": "prisma validate",
    "prisma:generate": "prisma generate",
    "prisma:migrate:dev": "prisma migrate dev",
    "prisma:migrate:deploy": "prisma migrate deploy",
    "prisma:migrate:reset": "prisma migrate reset",
    "prisma:seed": "ts-node prisma/seed.ts"
  },
  "dependencies": {
    "@nestjs/common": "^10.4.0",
    "@nestjs/core": "^10.4.0",
    "@nestjs/platform-express": "^10.4.0",
    "@prisma/client": "^5.20.0",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.1"
  },
  "devDependencies": {
    "@nestjs/cli": "^10.4.5",
    "@types/jest": "^29.5.12",
    "@types/node": "^20.14.0",
    "dotenv": "^16.4.5",
    "eslint": "^8.57.0",
    "jest": "^29.7.0",
    "prisma": "^5.20.0",
    "ts-jest": "^29.2.4",
    "ts-node": "^10.9.2",
    "typescript": "^5.5.4"
  },
  "prisma": {
    "seed": "ts-node prisma/seed.ts"
  },
  "jest": {
    "moduleFileExtensions": ["js", "json", "ts"],
    "rootDir": "src",
    "testRegex": ".*\\.spec\\.ts$",
    "transform": { "^.+\\.(t|j)s$": "ts-jest" },
    "testEnvironment": "node"
  }
}
```

Run: `npm install`
Expected: installs cleanly, creates `node_modules/` and `package-lock.json`.

- [ ] **Step 5: Write TypeScript/Nest config files**

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "module": "commonjs",
    "declaration": true,
    "removeComments": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "allowSyntheticDefaultImports": true,
    "target": "ES2021",
    "sourceMap": true,
    "outDir": "./dist",
    "baseUrl": "./",
    "incremental": true,
    "skipLibCheck": true,
    "strictNullChecks": true,
    "noImplicitAny": true,
    "strictBindCallApply": false,
    "forceConsistentCasingInFileNames": true,
    "noFallthroughCasesInSwitch": false
  }
}
```

`nest-cli.json`:
```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": { "deleteOutDir": true }
}
```

`.eslintrc.js`:
```js
module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: { project: 'tsconfig.json', sourceType: 'module' },
  plugins: ['@typescript-eslint/eslint-plugin'],
  extends: ['plugin:@typescript-eslint/recommended'],
  root: true,
  env: { node: true, jest: true },
  rules: {},
};
```

- [ ] **Step 6: Write the minimal Nest app + PrismaService**

`src/prisma/prisma.service.ts`:
```ts
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

`src/prisma/prisma.module.ts`:
```ts
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

`src/app.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [PrismaModule],
})
export class AppModule {}
```

`src/main.ts`:
```ts
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
```

- [ ] **Step 7: Write the initial Prisma schema (no models yet)**

`prisma/schema.prisma`:
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

- [ ] **Step 8: Write the Jest DB-test config and setup files**

`test/jest-db.json`:
```json
{
  "preset": "ts-jest",
  "testEnvironment": "node",
  "rootDir": "..",
  "testMatch": ["<rootDir>/test/db/**/*.integration.spec.ts"],
  "setupFiles": ["<rootDir>/test/setup/env.js"],
  "globalSetup": "<rootDir>/test/setup/global-setup.js",
  "testTimeout": 30000
}
```

`test/setup/env.js`:
```js
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.test') });
```

`test/setup/global-setup.js`:
```js
const path = require('path');
const { execSync } = require('child_process');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.test') });

module.exports = async () => {
  execSync('npx prisma migrate deploy', {
    env: process.env,
    stdio: 'inherit',
  });
};
```

- [ ] **Step 9: Write the connection smoke test**

`test/db/00-connection.integration.spec.ts`:
```ts
import { PrismaService } from '../../src/prisma/prisma.service';

describe('Database connection', () => {
  const prisma = new PrismaService();

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('connects to Postgres and can run a raw query', async () => {
    const result = await prisma.$queryRaw<{ ok: number }[]>`SELECT 1 as ok`;
    expect(result[0].ok).toBe(1);
  });
});
```

- [ ] **Step 10: Run the test to verify it fails**

Run: `npm run test:db`
Expected: FAIL — `global-setup.js` runs `prisma migrate deploy` against `ukshop_test`, but since no migration exists yet in `prisma/migrations/`, this may succeed as a no-op; if the test still fails, it will be because `DATABASE_URL` isn't yet pointed at a reachable, initialized schema. Confirm the failure reason is environmental (not a typo) before proceeding — this step exists to prove the pipeline is wired, not to exercise application code.

- [ ] **Step 11: Generate the Prisma client and create the (empty) baseline migration**

Run: `npx prisma generate`
Expected: generates `@prisma/client` into `node_modules/.prisma/client`.

Run: `npx prisma migrate dev --name init --create-only && npx prisma migrate dev`
Expected: creates `prisma/migrations/<timestamp>_init/migration.sql` (empty or just extension setup), applies it to `ukshop_dev`.

- [ ] **Step 12: Run the test again to verify it passes**

Run: `npm run test:db`
Expected: PASS — `global-setup.js` applies the same migration to `ukshop_test`, then `00-connection.integration.spec.ts` connects and runs `SELECT 1`.

- [ ] **Step 13: Commit**

```bash
git add docker-compose.yml docker/ package.json package-lock.json tsconfig.json nest-cli.json .eslintrc.js src/ prisma/schema.prisma prisma/migrations test/
git commit -m "chore: scaffold NestJS + Prisma + Postgres project"
```

---

### Task 2: Media domain (cross-cutting)

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `test/db/01-media.integration.spec.ts`

**Interfaces:**
- Consumes: `PrismaService` (Task 1).
- Produces: `MediaOwnerType` enum, `Media` model — every later domain's models that carry images (`Product`, `ProductVariant`, `Category`, `Brand`, `BlogPost`, `Page`, `Banner`, `Testimonial`, `HeroSlide`, `Author`, `User`, `Review`, `OrderItemReturn`) reference `MediaOwnerType` values by convention (no DB FK), documented in spec §3.

- [ ] **Step 1: Write the failing test**

`test/db/01-media.integration.spec.ts`:
```ts
import { PrismaService } from '../../src/prisma/prisma.service';

describe('Media', () => {
  const prisma = new PrismaService();
  const createdIds: number[] = [];

  afterAll(async () => {
    await prisma.media.deleteMany({ where: { id: { in: createdIds } } });
    await prisma.$disconnect();
  });

  it('stores a polymorphic media row and reads it back by owner', async () => {
    const media = await prisma.media.create({
      data: {
        ownerType: 'PRODUCT',
        ownerId: 999999,
        collection: 'main_image',
        url: 'https://cdn.example.com/products/999999/main.jpg',
        altText: 'Test product image',
        sortOrder: 0,
      },
    });
    createdIds.push(media.id);

    expect(media.uuid).toBeDefined();

    const found = await prisma.media.findMany({
      where: { ownerType: 'PRODUCT', ownerId: 999999, collection: 'main_image' },
    });
    expect(found).toHaveLength(1);
    expect(found[0].url).toBe('https://cdn.example.com/products/999999/main.jpg');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:db -- 01-media`
Expected: FAIL — `Property 'media' does not exist on type 'PrismaService'` (TypeScript compile error, since `Media` isn't in the schema yet).

- [ ] **Step 3: Append the Media model to the schema**

Append to `prisma/schema.prisma`:
```prisma
enum MediaOwnerType {
  PRODUCT
  PRODUCT_VARIANT
  CATEGORY
  BRAND
  BLOG_POST
  BLOG_CATEGORY
  AUTHOR
  PAGE
  BANNER
  TESTIMONIAL
  HERO_SLIDE
  USER
  REVIEW
  ORDER_ITEM_RETURN
}

model Media {
  id         Int            @id @default(autoincrement())
  uuid       String         @unique @default(uuid())
  ownerType  MediaOwnerType @map("owner_type")
  ownerId    Int            @map("owner_id")
  collection String
  url        String
  altText    String?        @map("alt_text")
  sortOrder  Int            @default(0) @map("sort_order")
  metadata   Json?
  createdAt  DateTime       @default(now()) @map("created_at")

  @@index([ownerType, ownerId, collection])
  @@map("media")
}
```

- [ ] **Step 4: Format and validate**

Run: `npx prisma format && npx prisma validate`
Expected: both succeed with no errors.

- [ ] **Step 5: Create and apply the migration**

Run: `npx prisma migrate dev --name media`
Expected: creates `prisma/migrations/<timestamp>_media/migration.sql` containing `CREATE TYPE "MediaOwnerType" ...` and `CREATE TABLE "media" ...`; applies to `ukshop_dev`; regenerates the Prisma Client (now `prisma.media` is typed).

- [ ] **Step 6: Run the test again to verify it passes**

Run: `npm run test:db -- 01-media`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations test/db/01-media.integration.spec.ts
git commit -m "feat(db): add cross-cutting Media table"
```

---

### Task 3: Identity & Access domain

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `test/db/02-identity.integration.spec.ts`

**Interfaces:**
- Consumes: `PrismaService` (Task 1).
- Produces: `User`, `Address`, `AdminUser`, `Role`, `Permission`, `RolePermission`, `OtpVerification` models; `UserStatus`, `AddressType`, `AdminUserStatus`, `OtpChannel` enums. Later tasks reference `User` (Cart, Wishlist, BrowsingHistory, Order, OrderItemReturn, Review, GiftCard) and `AdminUser` (OrderStatusHistory).

- [ ] **Step 1: Write the failing test**

`test/db/02-identity.integration.spec.ts`:
```ts
import { PrismaService } from '../../src/prisma/prisma.service';

describe('Identity & Access', () => {
  const prisma = new PrismaService();
  let userId: number;
  let addressId: number;
  let roleId: number;
  let permissionId: number;
  let adminUserId: number;

  afterAll(async () => {
    if (adminUserId) await prisma.adminUser.delete({ where: { id: adminUserId } });
    if (roleId) await prisma.rolePermission.deleteMany({ where: { roleId } });
    if (permissionId) await prisma.permission.delete({ where: { id: permissionId } });
    if (roleId) await prisma.role.delete({ where: { id: roleId } });
    if (addressId) await prisma.address.delete({ where: { id: addressId } });
    if (userId) await prisma.user.delete({ where: { id: userId } });
    await prisma.otpVerification.deleteMany({ where: { identifier: 'test-identity@example.com' } });
    await prisma.$disconnect();
  });

  it('creates a user with an address, and an admin user with a role and permission', async () => {
    const user = await prisma.user.create({
      data: {
        email: 'test-identity-user@example.com',
        passwordHash: 'hashed',
        firstName: 'Ada',
        lastName: 'Lovelace',
        addresses: {
          create: {
            fullName: 'Ada Lovelace',
            line1: '1 Test Street',
            city: 'London',
            postcode: 'SW1A 1AA',
            addressType: 'BOTH',
          },
        },
      },
      include: { addresses: true },
    });
    userId = user.id;
    addressId = user.addresses[0].id;
    expect(user.uuid).toBeDefined();
    expect(user.addresses[0].country).toBe('GB');

    const role = await prisma.role.create({ data: { name: 'Test Catalog Manager' } });
    roleId = role.id;
    const permission = await prisma.permission.create({ data: { key: 'products.create.test' } });
    permissionId = permission.id;
    await prisma.rolePermission.create({ data: { roleId, permissionId } });

    const admin = await prisma.adminUser.create({
      data: {
        email: 'test-identity-admin@example.com',
        passwordHash: 'hashed',
        name: 'Admin Test',
        roleId,
      },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });
    adminUserId = admin.id;
    expect(admin.role.permissions[0].permission.key).toBe('products.create.test');

    await prisma.otpVerification.create({
      data: {
        identifier: 'test-identity@example.com',
        channel: 'EMAIL',
        code: '123456',
        purpose: 'registration',
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    });
  });

  it('cascades address deletion when the owning user is deleted', async () => {
    const user = await prisma.user.create({
      data: {
        email: 'test-identity-cascade@example.com',
        passwordHash: 'hashed',
        firstName: 'Cascade',
        lastName: 'Test',
        addresses: { create: { fullName: 'Cascade Test', line1: 'x', city: 'x', postcode: 'x', addressType: 'BOTH' } },
      },
      include: { addresses: true },
    });
    const addrId = user.addresses[0].id;

    await prisma.user.delete({ where: { id: user.id } });

    const found = await prisma.address.findUnique({ where: { id: addrId } });
    expect(found).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:db -- 02-identity`
Expected: FAIL — compile error, `prisma.user`/`prisma.address`/etc. don't exist yet.

- [ ] **Step 3: Append Identity & Access models to the schema**

Append to `prisma/schema.prisma`:
```prisma
enum UserStatus {
  ACTIVE
  SUSPENDED
}

enum AddressType {
  BILLING
  SHIPPING
  BOTH
}

enum AdminUserStatus {
  ACTIVE
  DISABLED
}

enum OtpChannel {
  EMAIL
  SMS
}

model User {
  id               Int        @id @default(autoincrement())
  uuid             String     @unique @default(uuid())
  email            String     @unique
  emailVerifiedAt  DateTime?  @map("email_verified_at")
  phone            String?    @unique
  mobileVerifiedAt DateTime?  @map("mobile_verified_at")
  passwordHash     String     @map("password_hash")
  firstName        String     @map("first_name")
  lastName         String     @map("last_name")
  status           UserStatus @default(ACTIVE)
  createdAt        DateTime   @default(now()) @map("created_at")
  updatedAt        DateTime   @updatedAt @map("updated_at")
  deletedAt        DateTime?  @map("deleted_at")

  addresses Address[]

  @@map("users")
}

model Address {
  id          Int         @id @default(autoincrement())
  uuid        String      @unique @default(uuid())
  userId      Int         @map("user_id")
  user        User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  label       String?
  fullName    String      @map("full_name")
  companyName String?     @map("company_name")
  line1       String
  line2       String?
  city        String
  county      String?
  postcode    String
  country     String      @default("GB")
  phone       String?
  addressType AddressType @default(BOTH) @map("address_type")
  isDefault   Boolean     @default(false) @map("is_default")
  createdAt   DateTime    @default(now()) @map("created_at")
  updatedAt   DateTime    @updatedAt @map("updated_at")

  @@index([userId])
  @@map("addresses")
}

model AdminUser {
  id           Int             @id @default(autoincrement())
  email        String          @unique
  passwordHash String          @map("password_hash")
  name         String
  status       AdminUserStatus @default(ACTIVE)
  roleId       Int             @map("role_id")
  role         Role            @relation(fields: [roleId], references: [id], onDelete: Restrict)
  lastLoginAt  DateTime?       @map("last_login_at")
  createdAt    DateTime        @default(now()) @map("created_at")
  updatedAt    DateTime        @updatedAt @map("updated_at")
  deletedAt    DateTime?       @map("deleted_at")

  @@map("admin_users")
}

model Role {
  id          Int      @id @default(autoincrement())
  name        String   @unique
  description String?
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  adminUsers  AdminUser[]
  permissions RolePermission[]

  @@map("roles")
}

model Permission {
  id          Int    @id @default(autoincrement())
  key         String @unique
  description String?

  roles RolePermission[]

  @@map("permissions")
}

model RolePermission {
  roleId       Int        @map("role_id")
  permissionId Int        @map("permission_id")
  role         Role       @relation(fields: [roleId], references: [id], onDelete: Cascade)
  permission   Permission @relation(fields: [permissionId], references: [id], onDelete: Cascade)

  @@id([roleId, permissionId])
  @@map("role_permissions")
}

model OtpVerification {
  id         Int        @id @default(autoincrement())
  identifier String
  channel    OtpChannel
  code       String
  purpose    String
  expiresAt  DateTime   @map("expires_at")
  consumedAt DateTime?  @map("consumed_at")
  createdAt  DateTime   @default(now()) @map("created_at")

  @@index([identifier, purpose])
  @@map("otp_verifications")
}
```

- [ ] **Step 4: Format and validate**

Run: `npx prisma format && npx prisma validate`
Expected: both succeed.

- [ ] **Step 5: Create and apply the migration**

Run: `npx prisma migrate dev --name identity_access`
Expected: migration created and applied; Prisma Client regenerated with `User`, `Address`, `AdminUser`, `Role`, `Permission`, `RolePermission`, `OtpVerification`.

- [ ] **Step 6: Run the test again to verify it passes**

Run: `npm run test:db -- 02-identity`
Expected: PASS (both `it` blocks).

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations test/db/02-identity.integration.spec.ts
git commit -m "feat(db): add Identity & Access domain (User, Address, AdminUser, RBAC, OTP)"
```

---

### Task 4: Catalog & Tax domain

Note: `TaxRate` belongs conceptually to the Orders/Fulfillment domain in the spec (§7), but `Product.taxRateId` references it, so it must exist no later than this task to avoid a forward reference. It is defined here and simply reused (already present) when Task 6 adds `Order`/`OrderItem`, which also reference it.

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `test/db/03-catalog.integration.spec.ts`

**Interfaces:**
- Consumes: nothing new from prior domains (Media is referenced only by convention, not FK).
- Produces: `Category`, `Brand`, `ProductCondition`, `ProductAttribute`, `ProductAttributeValue`, `Product`, `CategoryProduct`, `ProductVariant`, `ProductVariantAttribute`, `ProductFaq`, `Collection`, `CollectionProduct`, `TaxRate` models; `CatalogStatus`, `ProductStatus`, `AttributeInputType` enums. Later tasks reference `Product`/`ProductVariant` (Cart, Order, Review, BrowsingHistory, TrendingProduct, Banner, FeaturedSectionProduct) and `Category` (MenuItem, MegaMenuLink, FeaturedSection, Banner) and `TaxRate` (Order line VAT).

- [ ] **Step 1: Write the failing test**

`test/db/03-catalog.integration.spec.ts`:
```ts
import { PrismaService } from '../../src/prisma/prisma.service';

describe('Catalog & Tax', () => {
  const prisma = new PrismaService();
  let categoryId: number;
  let brandId: number;
  let conditionId: number;
  let taxRateId: number;
  let attributeId: number;
  let attributeValueId: number;
  let productId: number;
  let variantId: number;

  afterAll(async () => {
    if (variantId) await prisma.productVariantAttribute.deleteMany({ where: { productVariantId: variantId } });
    if (productId) await prisma.productFaq.deleteMany({ where: { productId } });
    if (variantId) await prisma.productVariant.delete({ where: { id: variantId } });
    if (productId) await prisma.product.delete({ where: { id: productId } });
    if (attributeValueId) await prisma.productAttributeValue.delete({ where: { id: attributeValueId } });
    if (attributeId) await prisma.productAttribute.delete({ where: { id: attributeId } });
    if (categoryId) await prisma.category.delete({ where: { id: categoryId } });
    if (brandId) await prisma.brand.delete({ where: { id: brandId } });
    if (conditionId) await prisma.productCondition.delete({ where: { id: conditionId } });
    if (taxRateId) await prisma.taxRate.delete({ where: { id: taxRateId } });
    await prisma.$disconnect();
  });

  it('creates a product with a variant, EAV attribute, and tax rate', async () => {
    const category = await prisma.category.create({
      data: { title: 'Test Graphics Cards', slug: 'test-graphics-cards' },
    });
    categoryId = category.id;

    const brand = await prisma.brand.create({ data: { title: 'Test NVIDIA', slug: 'test-nvidia' } });
    brandId = brand.id;

    const condition = await prisma.productCondition.create({ data: { title: 'Refurbished', slug: 'test-refurbished' } });
    conditionId = condition.id;

    const taxRate = await prisma.taxRate.create({
      data: { title: 'Test Standard', ratePercent: 20.0, isDefault: true },
    });
    taxRateId = taxRate.id;

    const attribute = await prisma.productAttribute.create({
      data: { title: 'Test Memory Size', slug: 'test-memory-size' },
    });
    attributeId = attribute.id;

    const attributeValue = await prisma.productAttributeValue.create({
      data: { attributeId, value: '16GB' },
    });
    attributeValueId = attributeValue.id;

    const product = await prisma.product.create({
      data: {
        categoryId,
        brandId,
        productConditionId: conditionId,
        taxRateId,
        title: 'Test RTX 4070',
        slug: 'test-rtx-4070',
        status: 'ACTIVE',
        faqs: { create: { question: 'Does it fit?', answer: 'Check your case clearance.' } },
      },
    });
    productId = product.id;

    const variant = await prisma.productVariant.create({
      data: {
        productId,
        title: '16GB',
        slug: 'test-rtx-4070-16gb',
        price: 549.99,
        stockQty: 10,
        isDefault: true,
        attributes: { create: { attributeId, attributeValueId } },
      },
      include: { attributes: { include: { attribute: true, attributeValue: true } } },
    });
    variantId = variant.id;

    expect(variant.attributes[0].attribute.title).toBe('Test Memory Size');
    expect(variant.attributes[0].attributeValue.value).toBe('16GB');

    const fetchedProduct = await prisma.product.findUniqueOrThrow({
      where: { id: productId },
      include: { variants: true, faqs: true, taxRate: true, brand: true, productCondition: true },
    });
    expect(fetchedProduct.variants).toHaveLength(1);
    expect(fetchedProduct.faqs).toHaveLength(1);
    expect(fetchedProduct.taxRate?.ratePercent.toString()).toBe('20');
  });

  it('rejects deleting a product that still has a variant (Restrict)', async () => {
    await expect(prisma.product.delete({ where: { id: productId } })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:db -- 03-catalog`
Expected: FAIL — compile error, none of `prisma.category`/`brand`/`product`/etc. exist yet.

- [ ] **Step 3: Append Catalog & Tax models to the schema**

Append to `prisma/schema.prisma`:
```prisma
enum CatalogStatus {
  ACTIVE
  INACTIVE
}

enum ProductStatus {
  DRAFT
  ACTIVE
  ARCHIVED
}

enum AttributeInputType {
  SELECT
  COLOR_SWATCH
  IMAGE_SWATCH
  TEXT
}

model TaxRate {
  id          Int           @id @default(autoincrement())
  title       String        @unique
  ratePercent Decimal       @map("rate_percent") @db.Decimal(5, 2)
  isDefault   Boolean       @default(false) @map("is_default")
  status      CatalogStatus @default(ACTIVE)

  products Product[]

  @@map("tax_rates")
}

model Category {
  id              Int           @id @default(autoincrement())
  parentId        Int?          @map("parent_id")
  parent          Category?     @relation("CategoryTree", fields: [parentId], references: [id], onDelete: Restrict)
  children        Category[]    @relation("CategoryTree")
  title           String
  slug            String        @unique
  description     String?
  sortOrder       Int           @default(0) @map("sort_order")
  isIndexable     Boolean       @default(true) @map("is_indexable")
  metaTitle       String?       @map("meta_title")
  metaDescription String?       @map("meta_description")
  status          CatalogStatus @default(ACTIVE)
  createdAt       DateTime      @default(now()) @map("created_at")
  updatedAt       DateTime      @updatedAt @map("updated_at")
  deletedAt       DateTime?     @map("deleted_at")

  products          Product[]
  secondaryProducts CategoryProduct[]

  @@index([parentId])
  @@map("categories")
}

model Brand {
  id          Int           @id @default(autoincrement())
  title       String
  slug        String        @unique
  description String?
  status      CatalogStatus @default(ACTIVE)
  createdAt   DateTime      @default(now()) @map("created_at")
  updatedAt   DateTime      @updatedAt @map("updated_at")

  products Product[]

  @@map("brands")
}

model ProductCondition {
  id    Int    @id @default(autoincrement())
  title String
  slug  String @unique

  products Product[]

  @@map("product_conditions")
}

model ProductAttribute {
  id           Int                @id @default(autoincrement())
  title        String
  slug         String             @unique
  inputType    AttributeInputType @default(SELECT) @map("input_type")
  isFilterable Boolean            @default(true) @map("is_filterable")
  deletedAt    DateTime?          @map("deleted_at")
  createdAt    DateTime           @default(now()) @map("created_at")
  updatedAt    DateTime           @updatedAt @map("updated_at")

  values        ProductAttributeValue[]
  variantValues ProductVariantAttribute[]

  @@map("product_attributes")
}

model ProductAttributeValue {
  id          Int              @id @default(autoincrement())
  attributeId Int              @map("attribute_id")
  attribute   ProductAttribute @relation(fields: [attributeId], references: [id], onDelete: Cascade)
  value       String
  swatchValue String?          @map("swatch_value")
  sortOrder   Int              @default(0) @map("sort_order")

  variantValues ProductVariantAttribute[]

  @@unique([attributeId, value])
  @@map("product_attribute_values")
}

model Product {
  id                 Int               @id @default(autoincrement())
  uuid               String            @unique @default(uuid())
  categoryId         Int               @map("category_id")
  category           Category          @relation(fields: [categoryId], references: [id], onDelete: Restrict)
  brandId            Int?              @map("brand_id")
  brand              Brand?            @relation(fields: [brandId], references: [id], onDelete: SetNull)
  productConditionId Int?              @map("product_condition_id")
  productCondition   ProductCondition? @relation(fields: [productConditionId], references: [id], onDelete: SetNull)
  taxRateId          Int?              @map("tax_rate_id")
  taxRate            TaxRate?          @relation(fields: [taxRateId], references: [id], onDelete: SetNull)
  title              String
  slug               String            @unique
  sku                String?           @unique
  mpn                String?
  shortDescription   String?           @map("short_description")
  description        String?
  specsSummary       Json?             @map("specs_summary")
  warrantyMonths     Int?              @map("warranty_months")
  isReturnable       Boolean           @default(true) @map("is_returnable")
  returnableDays     Int               @default(30) @map("returnable_days")
  status             ProductStatus     @default(DRAFT)
  isFeatured         Boolean           @default(false) @map("is_featured")
  isTopProduct       Boolean           @default(false) @map("is_top_product")
  isIndexable        Boolean           @default(true) @map("is_indexable")
  metaTitle          String?           @map("meta_title")
  metaDescription    String?           @map("meta_description")
  deletedAt          DateTime?         @map("deleted_at")
  createdAt          DateTime          @default(now()) @map("created_at")
  updatedAt          DateTime          @updatedAt @map("updated_at")

  variants            ProductVariant[]
  secondaryCategories CategoryProduct[]
  faqs                ProductFaq[]
  collections         CollectionProduct[]

  @@index([categoryId])
  @@index([brandId])
  @@index([status])
  @@map("products")
}

model CategoryProduct {
  categoryId Int      @map("category_id")
  productId  Int      @map("product_id")
  category   Category @relation(fields: [categoryId], references: [id], onDelete: Cascade)
  product    Product  @relation(fields: [productId], references: [id], onDelete: Cascade)

  @@id([categoryId, productId])
  @@map("category_products")
}

model ProductVariant {
  id                Int           @id @default(autoincrement())
  uuid              String        @unique @default(uuid())
  productId         Int           @map("product_id")
  product           Product       @relation(fields: [productId], references: [id], onDelete: Restrict)
  title             String
  slug              String        @unique
  barcode           String?       @unique
  price             Decimal       @db.Decimal(10, 2)
  salePrice         Decimal?      @map("sale_price") @db.Decimal(10, 2)
  stockQty          Int           @default(0) @map("stock_qty")
  lowStockThreshold Int           @default(5) @map("low_stock_threshold")
  weightKg          Decimal?      @map("weight_kg") @db.Decimal(6, 3)
  lengthCm          Decimal?      @map("length_cm") @db.Decimal(6, 2)
  widthCm           Decimal?      @map("width_cm") @db.Decimal(6, 2)
  heightCm          Decimal?      @map("height_cm") @db.Decimal(6, 2)
  isDefault         Boolean       @default(false) @map("is_default")
  status            CatalogStatus @default(ACTIVE)
  deletedAt         DateTime?     @map("deleted_at")
  createdAt         DateTime      @default(now()) @map("created_at")
  updatedAt         DateTime      @updatedAt @map("updated_at")

  attributes ProductVariantAttribute[]

  @@index([productId])
  @@map("product_variants")
}

model ProductVariantAttribute {
  id               Int                    @id @default(autoincrement())
  productVariantId Int                    @map("product_variant_id")
  productVariant   ProductVariant         @relation(fields: [productVariantId], references: [id], onDelete: Cascade)
  attributeId      Int                    @map("attribute_id")
  attribute        ProductAttribute       @relation(fields: [attributeId], references: [id], onDelete: Restrict)
  attributeValueId Int                    @map("attribute_value_id")
  attributeValue   ProductAttributeValue  @relation(fields: [attributeValueId], references: [id], onDelete: Restrict)

  @@unique([productVariantId, attributeId])
  @@map("product_variant_attributes")
}

model ProductFaq {
  id        Int     @id @default(autoincrement())
  productId Int     @map("product_id")
  product   Product @relation(fields: [productId], references: [id], onDelete: Cascade)
  question  String
  answer    String
  sortOrder Int     @default(0) @map("sort_order")

  @@map("product_faqs")
}

model Collection {
  id          Int      @id @default(autoincrement())
  title       String
  slug        String   @unique
  description String?
  type        String?
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  products CollectionProduct[]

  @@map("collections")
}

model CollectionProduct {
  collectionId Int        @map("collection_id")
  productId    Int        @map("product_id")
  sortOrder    Int        @default(0) @map("sort_order")
  collection   Collection @relation(fields: [collectionId], references: [id], onDelete: Cascade)
  product      Product    @relation(fields: [productId], references: [id], onDelete: Cascade)

  @@id([collectionId, productId])
  @@map("collection_products")
}
```

- [ ] **Step 4: Format and validate**

Run: `npx prisma format && npx prisma validate`
Expected: both succeed.

- [ ] **Step 5: Create and apply the migration**

Run: `npx prisma migrate dev --name catalog_and_tax`
Expected: migration created and applied; Prisma Client regenerated with all catalog models plus `TaxRate`.

- [ ] **Step 6: Run the test again to verify it passes**

Run: `npm run test:db -- 03-catalog`
Expected: PASS — including the `Restrict` deletion test (deleting a `Product` with a live `ProductVariant` throws a foreign-key-violation error).

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations test/db/03-catalog.integration.spec.ts
git commit -m "feat(db): add Catalog domain (Category, Brand, Product, Variant, EAV attributes) and TaxRate"
```

---

### Task 5: Cart & Personalization domain

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `test/db/04-cart.integration.spec.ts`

**Interfaces:**
- Consumes: `User` (Task 3), `Product`/`ProductVariant` (Task 4).
- Produces: `Cart`, `CartItem`, `Wishlist`, `WishlistItem`, `BrowsingHistory` models.

- [ ] **Step 1: Write the failing test**

`test/db/04-cart.integration.spec.ts`:
```ts
import { PrismaService } from '../../src/prisma/prisma.service';

describe('Cart & Personalization', () => {
  const prisma = new PrismaService();
  let userId: number;
  let categoryId: number;
  let productId: number;
  let variantId: number;
  let cartId: number;
  let wishlistId: number;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { email: 'test-cart-user@example.com', passwordHash: 'x', firstName: 'Cart', lastName: 'Tester' },
    });
    userId = user.id;

    const category = await prisma.category.create({ data: { title: 'Test Cart Category', slug: 'test-cart-category' } });
    categoryId = category.id;

    const product = await prisma.product.create({
      data: { categoryId, title: 'Test Cart Product', slug: 'test-cart-product', status: 'ACTIVE' },
    });
    productId = product.id;

    const variant = await prisma.productVariant.create({
      data: { productId, title: 'Default', slug: 'test-cart-product-default', price: 19.99, stockQty: 5 },
    });
    variantId = variant.id;
  });

  afterAll(async () => {
    if (wishlistId) await prisma.wishlistItem.deleteMany({ where: { wishlistId } });
    if (wishlistId) await prisma.wishlist.delete({ where: { id: wishlistId } });
    if (cartId) await prisma.cartItem.deleteMany({ where: { cartId } });
    if (cartId) await prisma.cart.delete({ where: { id: cartId } });
    await prisma.browsingHistory.deleteMany({ where: { userId } });
    if (variantId) await prisma.productVariant.delete({ where: { id: variantId } });
    if (productId) await prisma.product.delete({ where: { id: productId } });
    if (categoryId) await prisma.category.delete({ where: { id: categoryId } });
    if (userId) await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('adds an item to a cart and a wishlist, and records browsing history', async () => {
    const cart = await prisma.cart.create({
      data: { userId, items: { create: { productVariantId: variantId, quantity: 2 } } },
      include: { items: true },
    });
    cartId = cart.id;
    expect(cart.items).toHaveLength(1);
    expect(cart.items[0].quantity).toBe(2);

    const wishlist = await prisma.wishlist.create({
      data: { userId, slug: 'test-wishlist', items: { create: { productVariantId: variantId } } },
      include: { items: true },
    });
    wishlistId = wishlist.id;
    expect(wishlist.items).toHaveLength(1);

    await prisma.browsingHistory.create({ data: { userId, productId } });
    const history = await prisma.browsingHistory.findMany({ where: { userId } });
    expect(history).toHaveLength(1);
  });

  it('rejects adding the same variant to a cart twice (unique constraint)', async () => {
    await expect(
      prisma.cartItem.create({ data: { cartId, productVariantId: variantId, quantity: 1 } }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:db -- 04-cart`
Expected: FAIL — compile error, `prisma.cart`/`wishlist`/`browsingHistory` don't exist yet.

- [ ] **Step 3: Append Cart & Personalization models to the schema**

Append to `prisma/schema.prisma`:
```prisma
model Cart {
  id         Int      @id @default(autoincrement())
  userId     Int?     @map("user_id")
  user       User?    @relation(fields: [userId], references: [id], onDelete: Cascade)
  guestToken String?  @unique @map("guest_token")
  createdAt  DateTime @default(now()) @map("created_at")
  updatedAt  DateTime @updatedAt @map("updated_at")

  items CartItem[]

  @@index([userId])
  @@map("carts")
}

model CartItem {
  id               Int            @id @default(autoincrement())
  cartId           Int            @map("cart_id")
  cart             Cart           @relation(fields: [cartId], references: [id], onDelete: Cascade)
  productVariantId Int            @map("product_variant_id")
  productVariant   ProductVariant @relation(fields: [productVariantId], references: [id], onDelete: Restrict)
  quantity         Int
  savedForLater    Boolean        @default(false) @map("saved_for_later")
  createdAt        DateTime       @default(now()) @map("created_at")
  updatedAt        DateTime       @updatedAt @map("updated_at")

  @@unique([cartId, productVariantId])
  @@map("cart_items")
}

model Wishlist {
  id        Int      @id @default(autoincrement())
  userId    Int      @map("user_id")
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  title     String   @default("My Wishlist")
  slug      String
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  items WishlistItem[]

  @@map("wishlists")
}

model WishlistItem {
  id               Int            @id @default(autoincrement())
  wishlistId       Int            @map("wishlist_id")
  wishlist         Wishlist       @relation(fields: [wishlistId], references: [id], onDelete: Cascade)
  productVariantId Int            @map("product_variant_id")
  productVariant   ProductVariant @relation(fields: [productVariantId], references: [id], onDelete: Cascade)
  createdAt        DateTime       @default(now()) @map("created_at")

  @@unique([wishlistId, productVariantId])
  @@map("wishlist_items")
}

model BrowsingHistory {
  id        Int      @id @default(autoincrement())
  userId    Int?     @map("user_id")
  user      User?    @relation(fields: [userId], references: [id], onDelete: Cascade)
  sessionId String?  @map("session_id")
  productId Int      @map("product_id")
  product   Product  @relation(fields: [productId], references: [id], onDelete: Cascade)
  viewedAt  DateTime @default(now()) @map("viewed_at")

  @@index([userId, viewedAt])
  @@index([sessionId, viewedAt])
  @@map("browsing_history")
}
```

Also add the back-relation fields on the models these reference (append the listed fields into the existing model bodies from prior tasks):
- In `model User { ... }` (Task 3): add `carts Cart[]`, `wishlists Wishlist[]`, `browsingHistory BrowsingHistory[]`.
- In `model Product { ... }` (Task 4): add `browsingHistory BrowsingHistory[]`.
- In `model ProductVariant { ... }` (Task 4): add `cartItems CartItem[]`, `wishlistItems WishlistItem[]`.

- [ ] **Step 4: Format and validate**

Run: `npx prisma format && npx prisma validate`
Expected: both succeed.

- [ ] **Step 5: Create and apply the migration**

Run: `npx prisma migrate dev --name cart_and_personalization`
Expected: migration created and applied.

- [ ] **Step 6: Run the test again to verify it passes**

Run: `npm run test:db -- 04-cart`
Expected: PASS — including the unique-constraint rejection test.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations test/db/04-cart.integration.spec.ts
git commit -m "feat(db): add Cart, Wishlist, and Browsing History"
```

---

### Task 6: Orders & Fulfillment domain

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `test/db/05-orders.integration.spec.ts`

**Interfaces:**
- Consumes: `User`, `AdminUser` (Task 3), `Product`, `ProductVariant`, `TaxRate` (Task 4).
- Produces: `ShippingMethod`, `ShippingRateBand`, `Order`, `OrderItem`, `OrderStatusHistory`, `OrderItemReturn`, `Review` models; `OrderStatus`, `PaymentStatus`, `OrderItemStatus`, `ReturnStatus`, `PickupStatus`, `ShippingRateType`, `ReviewStatus` enums. Later tasks reference `Order` (PaymentTransaction, PaymentRefund, PaymentDispute, OrderCouponLine, GiftCardTransaction) and `OrderItem` (Review — already here).

- [ ] **Step 1: Write the failing test**

`test/db/05-orders.integration.spec.ts`:
```ts
import { PrismaService } from '../../src/prisma/prisma.service';

describe('Orders & Fulfillment', () => {
  const prisma = new PrismaService();
  let userId: number;
  let adminUserId: number;
  let roleId: number;
  let categoryId: number;
  let productId: number;
  let variantId: number;
  let shippingMethodId: number;
  let orderId: number;
  let orderItemId: number;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { email: 'test-orders-user@example.com', passwordHash: 'x', firstName: 'Order', lastName: 'Tester' },
    });
    userId = user.id;

    const role = await prisma.role.create({ data: { name: 'Test Orders Admin Role' } });
    roleId = role.id;
    const admin = await prisma.adminUser.create({
      data: { email: 'test-orders-admin@example.com', passwordHash: 'x', name: 'Order Admin', roleId },
    });
    adminUserId = admin.id;

    const category = await prisma.category.create({ data: { title: 'Test Orders Category', slug: 'test-orders-category' } });
    categoryId = category.id;
    const product = await prisma.product.create({
      data: { categoryId, title: 'Test Orders Product', slug: 'test-orders-product', status: 'ACTIVE' },
    });
    productId = product.id;
    const variant = await prisma.productVariant.create({
      data: { productId, title: 'Default', slug: 'test-orders-product-default', price: 99.0, stockQty: 3 },
    });
    variantId = variant.id;

    const shippingMethod = await prisma.shippingMethod.create({
      data: {
        title: 'Test Royal Mail Tracked 48',
        carrier: 'Royal Mail',
        rateType: 'FLAT',
        flatRate: 4.99,
      },
    });
    shippingMethodId = shippingMethod.id;
  });

  afterAll(async () => {
    if (orderItemId) {
      await prisma.review.deleteMany({ where: { orderItemId } });
      await prisma.orderItemReturn.deleteMany({ where: { orderItemId } });
    }
    if (orderId) {
      await prisma.orderStatusHistory.deleteMany({ where: { orderId } });
      await prisma.orderItem.deleteMany({ where: { orderId } });
      await prisma.order.delete({ where: { id: orderId } });
    }
    if (shippingMethodId) await prisma.shippingMethod.delete({ where: { id: shippingMethodId } });
    if (variantId) await prisma.productVariant.delete({ where: { id: variantId } });
    if (productId) await prisma.product.delete({ where: { id: productId } });
    if (categoryId) await prisma.category.delete({ where: { id: categoryId } });
    if (adminUserId) await prisma.adminUser.delete({ where: { id: adminUserId } });
    if (roleId) await prisma.role.delete({ where: { id: roleId } });
    if (userId) await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('creates an order with an item, status history, a return, and a review', async () => {
    const order = await prisma.order.create({
      data: {
        userId,
        orderNumber: 'TESTORD00001',
        email: 'test-orders-user@example.com',
        billingFullName: 'Order Tester',
        billingLine1: '1 Test Street',
        billingCity: 'London',
        billingPostcode: 'SW1A 1AA',
        shippingFullName: 'Order Tester',
        shippingLine1: '1 Test Street',
        shippingCity: 'London',
        shippingPostcode: 'SW1A 1AA',
        shippingMethodId,
        subtotal: 99.0,
        total: 103.99,
        items: {
          create: {
            productId,
            productVariantId: variantId,
            titleSnapshot: 'Test Orders Product',
            variantTitleSnapshot: 'Default',
            quantity: 1,
            unitPrice: 99.0,
            vatRatePercent: 20.0,
            vatAmount: 16.5,
            subtotal: 99.0,
          },
        },
        statusHistory: {
          create: { toStatus: 'PENDING', note: 'Order placed', changedByAdminId: adminUserId },
        },
      },
      include: { items: true, statusHistory: true },
    });
    orderId = order.id;
    orderItemId = order.items[0].id;

    expect(order.items).toHaveLength(1);
    expect(order.statusHistory).toHaveLength(1);

    const orderReturn = await prisma.orderItemReturn.create({
      data: { orderItemId, userId, reason: 'Changed my mind' },
    });
    expect(orderReturn.returnStatus).toBe('REQUESTED');

    const review = await prisma.review.create({
      data: { productId, orderItemId, orderId, userId, rating: 5, comment: 'Great product' },
    });
    expect(review.status).toBe('PENDING');
  });

  it('rejects a second review for the same order item (unique constraint)', async () => {
    await expect(
      prisma.review.create({ data: { productId, orderItemId, orderId, userId, rating: 4 } }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:db -- 05-orders`
Expected: FAIL — compile error, `prisma.order`/`orderItem`/`shippingMethod`/`review`/etc. don't exist yet.

- [ ] **Step 3: Append Orders & Fulfillment models to the schema**

Append to `prisma/schema.prisma`:
```prisma
enum OrderStatus {
  PENDING
  AWAITING_PAYMENT
  PROCESSING
  PACKED
  SHIPPED
  DELIVERED
  CANCELLED
  FAILED
}

enum PaymentStatus {
  PENDING
  PAID
  FAILED
  REFUNDED
  PARTIALLY_REFUNDED
}

enum OrderItemStatus {
  PENDING
  PROCESSING
  PACKED
  SHIPPED
  DELIVERED
  RETURNED
  CANCELLED
  REFUNDED
}

enum ReturnStatus {
  REQUESTED
  APPROVED
  REJECTED
  RECEIVED
  REFUNDED
}

enum PickupStatus {
  PENDING
  SCHEDULED
  PICKED_UP
}

enum ShippingRateType {
  FLAT
  WEIGHT_BANDED
}

enum ReviewStatus {
  PENDING
  APPROVED
  REJECTED
}

model ShippingMethod {
  id               Int              @id @default(autoincrement())
  title            String
  carrier          String
  rateType         ShippingRateType @default(FLAT) @map("rate_type")
  flatRate         Decimal?         @map("flat_rate") @db.Decimal(10, 2)
  freeOverAmount   Decimal?         @map("free_over_amount") @db.Decimal(10, 2)
  estimatedDaysMin Int?             @map("estimated_days_min")
  estimatedDaysMax Int?             @map("estimated_days_max")
  status           CatalogStatus    @default(ACTIVE)

  rateBands ShippingRateBand[]
  orders    Order[]

  @@map("shipping_methods")
}

model ShippingRateBand {
  id               Int            @id @default(autoincrement())
  shippingMethodId Int            @map("shipping_method_id")
  shippingMethod   ShippingMethod @relation(fields: [shippingMethodId], references: [id], onDelete: Cascade)
  minWeightKg      Decimal        @map("min_weight_kg") @db.Decimal(6, 3)
  maxWeightKg      Decimal        @map("max_weight_kg") @db.Decimal(6, 3)
  rate             Decimal        @db.Decimal(10, 2)

  @@map("shipping_rate_bands")
}

model Order {
  id                  Int            @id @default(autoincrement())
  uuid                String         @unique @default(uuid())
  orderNumber         String         @unique @map("order_number")
  userId              Int?           @map("user_id")
  user                User?          @relation(fields: [userId], references: [id], onDelete: SetNull)
  email               String
  phone               String?
  status              OrderStatus    @default(PENDING)
  paymentStatus       PaymentStatus  @default(PENDING) @map("payment_status")

  billingFullName    String  @map("billing_full_name")
  billingCompanyName String? @map("billing_company_name")
  billingLine1       String  @map("billing_line1")
  billingLine2       String? @map("billing_line2")
  billingCity        String  @map("billing_city")
  billingCounty      String? @map("billing_county")
  billingPostcode    String  @map("billing_postcode")
  billingCountry     String  @default("GB") @map("billing_country")
  billingPhone       String? @map("billing_phone")

  shippingFullName    String  @map("shipping_full_name")
  shippingCompanyName String? @map("shipping_company_name")
  shippingLine1       String  @map("shipping_line1")
  shippingLine2       String? @map("shipping_line2")
  shippingCity        String  @map("shipping_city")
  shippingCounty      String? @map("shipping_county")
  shippingPostcode    String  @map("shipping_postcode")
  shippingCountry     String  @default("GB") @map("shipping_country")
  shippingPhone       String? @map("shipping_phone")

  shippingMethodId Int?            @map("shipping_method_id")
  shippingMethod   ShippingMethod? @relation(fields: [shippingMethodId], references: [id], onDelete: SetNull)

  subtotal         Decimal  @db.Decimal(10, 2)
  discountTotal    Decimal  @default(0) @map("discount_total") @db.Decimal(10, 2)
  shippingCharge   Decimal  @default(0) @map("shipping_charge") @db.Decimal(10, 2)
  vatTotal         Decimal  @default(0) @map("vat_total") @db.Decimal(10, 2)
  giftCardDiscount Decimal  @default(0) @map("gift_card_discount") @db.Decimal(10, 2)
  total            Decimal  @db.Decimal(10, 2)

  couponCode   String? @map("coupon_code")
  customerNote String? @map("customer_note")
  adminNote    String? @map("admin_note")

  trackingCarrier String? @map("tracking_carrier")
  trackingNumber  String? @map("tracking_number")
  trackingUrl     String? @map("tracking_url")

  placedAt  DateTime @default(now()) @map("placed_at")
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  items         OrderItem[]
  statusHistory OrderStatusHistory[]
  reviews       Review[]

  @@index([userId])
  @@index([status])
  @@map("orders")
}

model OrderItem {
  id                   Int             @id @default(autoincrement())
  orderId              Int             @map("order_id")
  order                Order           @relation(fields: [orderId], references: [id], onDelete: Cascade)
  productId            Int             @map("product_id")
  product              Product         @relation(fields: [productId], references: [id], onDelete: Restrict)
  productVariantId     Int             @map("product_variant_id")
  productVariant       ProductVariant  @relation(fields: [productVariantId], references: [id], onDelete: Restrict)
  titleSnapshot        String          @map("title_snapshot")
  variantTitleSnapshot String          @map("variant_title_snapshot")
  skuSnapshot          String?         @map("sku_snapshot")
  quantity             Int
  unitPrice            Decimal         @map("unit_price") @db.Decimal(10, 2)
  discount             Decimal         @default(0) @db.Decimal(10, 2)
  vatRatePercent       Decimal         @map("vat_rate_percent") @db.Decimal(5, 2)
  vatAmount            Decimal         @map("vat_amount") @db.Decimal(10, 2)
  subtotal             Decimal         @db.Decimal(10, 2)
  status               OrderItemStatus @default(PENDING)
  returnEligible        Boolean        @default(true) @map("return_eligible")
  returnDeadline         DateTime?     @map("return_deadline") @db.Date
  createdAt              DateTime      @default(now()) @map("created_at")
  updatedAt              DateTime      @updatedAt @map("updated_at")

  returns OrderItemReturn[]
  review  Review?

  @@index([orderId])
  @@map("order_items")
}

model OrderStatusHistory {
  id               Int        @id @default(autoincrement())
  orderId          Int        @map("order_id")
  order            Order      @relation(fields: [orderId], references: [id], onDelete: Cascade)
  fromStatus       String?    @map("from_status")
  toStatus         String     @map("to_status")
  note             String?
  changedByAdminId Int?       @map("changed_by_admin_id")
  changedByAdmin   AdminUser? @relation(fields: [changedByAdminId], references: [id], onDelete: SetNull)
  createdAt        DateTime   @default(now()) @map("created_at")

  @@index([orderId])
  @@map("order_status_history")
}

model OrderItemReturn {
  id           Int           @id @default(autoincrement())
  orderItemId  Int           @map("order_item_id")
  orderItem    OrderItem     @relation(fields: [orderItemId], references: [id], onDelete: Cascade)
  userId       Int           @map("user_id")
  user         User          @relation(fields: [userId], references: [id], onDelete: Restrict)
  reason       String
  comment      String?
  refundAmount Decimal?      @map("refund_amount") @db.Decimal(10, 2)
  returnStatus ReturnStatus  @default(REQUESTED) @map("return_status")
  pickupStatus PickupStatus? @map("pickup_status")
  approvedAt   DateTime?     @map("approved_at")
  receivedAt   DateTime?     @map("received_at")
  refundedAt   DateTime?     @map("refunded_at")
  createdAt    DateTime      @default(now()) @map("created_at")
  updatedAt    DateTime      @updatedAt @map("updated_at")

  @@map("order_item_returns")
}

model Review {
  id           Int          @id @default(autoincrement())
  uuid         String       @unique @default(uuid())
  productId    Int          @map("product_id")
  product      Product      @relation(fields: [productId], references: [id], onDelete: Cascade)
  orderItemId  Int?         @unique @map("order_item_id")
  orderItem    OrderItem?   @relation(fields: [orderItemId], references: [id], onDelete: SetNull)
  orderId      Int?         @map("order_id")
  order        Order?       @relation(fields: [orderId], references: [id], onDelete: SetNull)
  userId       Int?         @map("user_id")
  user         User?        @relation(fields: [userId], references: [id], onDelete: SetNull)
  reviewerName String?      @map("reviewer_name")
  rating       Int
  title        String?
  comment      String?
  status       ReviewStatus @default(PENDING)
  createdAt    DateTime     @default(now()) @map("created_at")
  updatedAt    DateTime     @updatedAt @map("updated_at")

  @@index([productId, status])
  @@map("reviews")
}
```

Also add the back-relation fields on models from prior tasks:
- In `model User { ... }` (Task 3): add `orders Order[]`, `reviews Review[]`, `orderItemReturns OrderItemReturn[]`.
- In `model AdminUser { ... }` (Task 3): add `orderStatusChanges OrderStatusHistory[]`.
- In `model Product { ... }` (Task 4): add `orderItems OrderItem[]`, `reviews Review[]`.
- In `model ProductVariant { ... }` (Task 4): add `orderItems OrderItem[]`.
- In `model TaxRate { ... }` (Task 4): no change (already has `products Product[]`, not referenced by Order in this pass — VAT is captured per-line as a snapshot, not a live FK).

- [ ] **Step 4: Format and validate**

Run: `npx prisma format && npx prisma validate`
Expected: both succeed.

- [ ] **Step 5: Create and apply the migration**

Run: `npx prisma migrate dev --name orders_and_fulfillment`
Expected: migration created and applied.

- [ ] **Step 6: Run the test again to verify it passes**

Run: `npm run test:db -- 05-orders`
Expected: PASS — including the unique-review-per-order-item rejection.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations test/db/05-orders.integration.spec.ts
git commit -m "feat(db): add Orders, Fulfillment, Returns, and Reviews"
```

---

### Task 7: Payments domain

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `test/db/06-payments.integration.spec.ts`

**Interfaces:**
- Consumes: `Order` (Task 6).
- Produces: `PaymentTransaction`, `PaymentRefund`, `PaymentDispute`, `PaymentWebhookLog` models; `PaymentTxnStatus`, `RefundStatus`, `DisputeStatus` enums.

- [ ] **Step 1: Write the failing test**

`test/db/06-payments.integration.spec.ts`:
```ts
import { PrismaService } from '../../src/prisma/prisma.service';

describe('Payments', () => {
  const prisma = new PrismaService();
  let orderId: number;
  let transactionId: number;

  beforeAll(async () => {
    const order = await prisma.order.create({
      data: {
        orderNumber: 'TESTPAY00001',
        email: 'test-payments@example.com',
        billingFullName: 'Pay Tester',
        billingLine1: '1 Test Street',
        billingCity: 'London',
        billingPostcode: 'SW1A 1AA',
        shippingFullName: 'Pay Tester',
        shippingLine1: '1 Test Street',
        shippingCity: 'London',
        shippingPostcode: 'SW1A 1AA',
        subtotal: 50,
        total: 50,
      },
    });
    orderId = order.id;
  });

  afterAll(async () => {
    await prisma.paymentDispute.deleteMany({ where: { orderId } });
    await prisma.paymentRefund.deleteMany({ where: { orderId } });
    if (transactionId) await prisma.paymentTransaction.delete({ where: { id: transactionId } });
    await prisma.paymentWebhookLog.deleteMany({ where: { provider: 'test-provider' } });
    if (orderId) await prisma.order.delete({ where: { id: orderId } });
    await prisma.$disconnect();
  });

  it('creates a payment transaction with a refund and a dispute', async () => {
    const transaction = await prisma.paymentTransaction.create({
      data: {
        orderId,
        provider: 'stripe',
        providerTransactionId: 'pi_test_12345',
        amount: 50,
        status: 'CAPTURED',
      },
    });
    transactionId = transaction.id;
    expect(transaction.uuid).toBeDefined();

    const refund = await prisma.paymentRefund.create({
      data: { transactionId, orderId, amount: 10, status: 'PROCESSED' },
    });
    expect(refund.amount.toString()).toBe('10');

    const dispute = await prisma.paymentDispute.create({
      data: {
        transactionId,
        orderId,
        providerDisputeId: 'dp_test_12345',
        amount: 50,
        status: 'NEEDS_RESPONSE',
      },
    });
    expect(dispute.status).toBe('NEEDS_RESPONSE');

    await prisma.paymentWebhookLog.create({
      data: { provider: 'test-provider', eventType: 'payment_intent.succeeded', payload: { id: 'pi_test_12345' } },
    });
    const logs = await prisma.paymentWebhookLog.findMany({ where: { provider: 'test-provider' } });
    expect(logs).toHaveLength(1);
  });

  it('rejects a duplicate providerTransactionId (unique constraint)', async () => {
    await expect(
      prisma.paymentTransaction.create({
        data: { orderId, provider: 'stripe', providerTransactionId: 'pi_test_12345', amount: 50, status: 'CAPTURED' },
      }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:db -- 06-payments`
Expected: FAIL — compile error, `prisma.paymentTransaction`/`paymentRefund`/`paymentDispute`/`paymentWebhookLog` don't exist yet.

- [ ] **Step 3: Append Payments models to the schema**

Append to `prisma/schema.prisma`:
```prisma
enum PaymentTxnStatus {
  PENDING
  AUTHORIZED
  CAPTURED
  FAILED
}

enum RefundStatus {
  PENDING
  PROCESSED
  FAILED
}

enum DisputeStatus {
  WARNING
  NEEDS_RESPONSE
  UNDER_REVIEW
  WON
  LOST
}

model PaymentTransaction {
  id                    Int              @id @default(autoincrement())
  uuid                  String           @unique @default(uuid())
  orderId               Int              @map("order_id")
  order                 Order            @relation(fields: [orderId], references: [id], onDelete: Restrict)
  userId                Int?             @map("user_id")
  provider              String
  providerTransactionId String           @unique @map("provider_transaction_id")
  amount                Decimal          @db.Decimal(10, 2)
  currency              String           @default("GBP")
  status                PaymentTxnStatus @default(PENDING)
  rawPayload            Json?            @map("raw_payload")
  createdAt              DateTime        @default(now()) @map("created_at")
  updatedAt              DateTime        @updatedAt @map("updated_at")

  refunds  PaymentRefund[]
  disputes PaymentDispute[]

  @@map("payment_transactions")
}

model PaymentRefund {
  id               Int                @id @default(autoincrement())
  transactionId    Int                @map("transaction_id")
  transaction      PaymentTransaction @relation(fields: [transactionId], references: [id], onDelete: Restrict)
  orderId          Int                @map("order_id")
  order            Order              @relation(fields: [orderId], references: [id], onDelete: Restrict)
  amount           Decimal            @db.Decimal(10, 2)
  providerRefundId String?            @map("provider_refund_id")
  status           RefundStatus       @default(PENDING)
  reason           String?
  rawPayload       Json?              @map("raw_payload")
  createdAt        DateTime           @default(now()) @map("created_at")
  updatedAt        DateTime           @updatedAt @map("updated_at")

  @@map("payment_refunds")
}

model PaymentDispute {
  id                Int                @id @default(autoincrement())
  transactionId     Int                @map("transaction_id")
  transaction       PaymentTransaction @relation(fields: [transactionId], references: [id], onDelete: Restrict)
  orderId           Int                @map("order_id")
  order             Order              @relation(fields: [orderId], references: [id], onDelete: Restrict)
  providerDisputeId String             @unique @map("provider_dispute_id")
  amount            Decimal            @db.Decimal(10, 2)
  status            DisputeStatus
  reasonCode        String?            @map("reason_code")
  reasonDescription String?            @map("reason_description")
  respondBy         DateTime?          @map("respond_by")
  rawPayload        Json?              @map("raw_payload")
  createdAt         DateTime           @default(now()) @map("created_at")
  updatedAt         DateTime           @updatedAt @map("updated_at")

  @@map("payment_disputes")
}

model PaymentWebhookLog {
  id              Int       @id @default(autoincrement())
  provider        String
  eventType       String    @map("event_type")
  providerEventId String?   @unique @map("provider_event_id")
  payload         Json
  processedAt     DateTime? @map("processed_at")
  createdAt       DateTime  @default(now()) @map("created_at")

  @@map("payment_webhook_logs")
}
```

Also add the back-relation fields on the model from Task 6:
- In `model Order { ... }` (Task 6): add `paymentTransactions PaymentTransaction[]`,
  `paymentRefunds PaymentRefund[]`, `paymentDisputes PaymentDispute[]`.

- [ ] **Step 4: Format and validate**

Run: `npx prisma format && npx prisma validate`
Expected: both succeed.

- [ ] **Step 5: Create and apply the migration**

Run: `npx prisma migrate dev --name payments`
Expected: migration created and applied.

- [ ] **Step 6: Run the test again to verify it passes**

Run: `npm run test:db -- 06-payments`
Expected: PASS — including the unique `providerTransactionId` rejection.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations test/db/06-payments.integration.spec.ts
git commit -m "feat(db): add Payments domain (transactions, refunds, disputes, webhook log)"
```

---

### Task 8: Marketing & Merchandising domain

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `test/db/07-marketing.integration.spec.ts`

**Interfaces:**
- Consumes: `Product`, `Category`, `Brand` (Task 4), `Order` (Task 6).
- Produces: `Coupon`, `OrderCouponLine`, `Banner`, `FeaturedSection`, `FeaturedSectionProduct`, `HeroSlide`, `HeroTrustBadge`, `Menu`, `MenuItem`, `MegaMenuPanel`, `MegaMenuColumn`, `MegaMenuLink` models; `DiscountType`, `BannerLinkType`, `FeaturedSectionType`, `MenuLocation` enums.

- [ ] **Step 1: Write the failing test**

`test/db/07-marketing.integration.spec.ts`:
```ts
import { PrismaService } from '../../src/prisma/prisma.service';

describe('Marketing & Merchandising', () => {
  const prisma = new PrismaService();
  let categoryId: number;
  let productId: number;
  let orderId: number;
  let couponId: number;
  let bannerId: number;
  let featuredSectionId: number;
  let heroSlideId: number;
  let heroBadgeId: number;
  let menuId: number;

  beforeAll(async () => {
    const category = await prisma.category.create({ data: { title: 'Test Marketing Category', slug: 'test-marketing-category' } });
    categoryId = category.id;
    const product = await prisma.product.create({
      data: { categoryId, title: 'Test Marketing Product', slug: 'test-marketing-product', status: 'ACTIVE' },
    });
    productId = product.id;
    const order = await prisma.order.create({
      data: {
        orderNumber: 'TESTMKT00001',
        email: 'test-marketing@example.com',
        billingFullName: 'Mkt Tester',
        billingLine1: '1 Test Street',
        billingCity: 'London',
        billingPostcode: 'SW1A 1AA',
        shippingFullName: 'Mkt Tester',
        shippingLine1: '1 Test Street',
        shippingCity: 'London',
        shippingPostcode: 'SW1A 1AA',
        subtotal: 20,
        total: 18,
      },
    });
    orderId = order.id;
  });

  afterAll(async () => {
    if (menuId) {
      const items = await prisma.menuItem.findMany({ where: { menuId } });
      for (const item of items) {
        const panel = await prisma.megaMenuPanel.findUnique({ where: { menuItemId: item.id } });
        if (panel) {
          const columns = await prisma.megaMenuColumn.findMany({ where: { panelId: panel.id } });
          for (const col of columns) {
            await prisma.megaMenuLink.deleteMany({ where: { columnId: col.id } });
          }
          await prisma.megaMenuColumn.deleteMany({ where: { panelId: panel.id } });
          await prisma.megaMenuPanel.delete({ where: { id: panel.id } });
        }
      }
      await prisma.menuItem.deleteMany({ where: { menuId } });
      await prisma.menu.delete({ where: { id: menuId } });
    }
    if (heroSlideId) await prisma.heroSlide.delete({ where: { id: heroSlideId } });
    if (heroBadgeId) await prisma.heroTrustBadge.delete({ where: { id: heroBadgeId } });
    if (featuredSectionId) {
      await prisma.featuredSectionProduct.deleteMany({ where: { featuredSectionId } });
      await prisma.featuredSection.delete({ where: { id: featuredSectionId } });
    }
    if (bannerId) await prisma.banner.delete({ where: { id: bannerId } });
    if (orderId) {
      await prisma.orderCouponLine.deleteMany({ where: { orderId } });
      await prisma.order.delete({ where: { id: orderId } });
    }
    if (couponId) await prisma.coupon.delete({ where: { id: couponId } });
    if (productId) await prisma.product.delete({ where: { id: productId } });
    if (categoryId) await prisma.category.delete({ where: { id: categoryId } });
    await prisma.$disconnect();
  });

  it('applies a coupon to an order exactly once', async () => {
    const coupon = await prisma.coupon.create({
      data: { code: 'TESTCOUPON10', discountType: 'PERCENT', discountAmount: 10 },
    });
    couponId = coupon.id;

    const line = await prisma.orderCouponLine.create({
      data: { orderId, couponId, couponCode: coupon.code, discountAmount: 2 },
    });
    expect(line.discountAmount.toString()).toBe('2');

    await expect(
      prisma.orderCouponLine.create({ data: { orderId, couponId, couponCode: coupon.code, discountAmount: 2 } }),
    ).rejects.toThrow();
  });

  it('creates a banner, a manually curated featured section, hero content, and a mega menu', async () => {
    const banner = await prisma.banner.create({
      data: { title: 'Test Banner', slug: 'test-banner', linkType: 'PRODUCT', productId, position: 'homepage_top' },
    });
    bannerId = banner.id;

    const featuredSection = await prisma.featuredSection.create({
      data: {
        title: 'Test Featured',
        slug: 'test-featured',
        sectionType: 'MANUAL',
        categoryId,
        manualProducts: { create: { productId } },
      },
      include: { manualProducts: true },
    });
    featuredSectionId = featuredSection.id;
    expect(featuredSection.manualProducts).toHaveLength(1);

    const heroSlide = await prisma.heroSlide.create({ data: { headline: 'Test Headline' } });
    heroSlideId = heroSlide.id;
    const heroBadge = await prisma.heroTrustBadge.create({ data: { label: 'Free UK Delivery' } });
    heroBadgeId = heroBadge.id;

    const menu = await prisma.menu.create({
      data: {
        name: 'Test Header Menu',
        slug: 'test-header-menu',
        location: 'HEADER',
        items: {
          create: {
            label: 'Test Category Link',
            categoryId,
            megaMenuPanel: {
              create: {
                columns: {
                  create: { title: 'Column 1', links: { create: { label: 'Test Link', categoryId } } },
                },
              },
            },
          },
        },
      },
      include: { items: { include: { megaMenuPanel: { include: { columns: { include: { links: true } } } } } } },
    });
    menuId = menu.id;

    const panel = menu.items[0].megaMenuPanel;
    expect(panel?.columns[0].links[0].label).toBe('Test Link');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:db -- 07-marketing`
Expected: FAIL — compile error, none of the marketing models exist yet.

- [ ] **Step 3: Append Marketing & Merchandising models to the schema**

Append to `prisma/schema.prisma`:
```prisma
enum DiscountType {
  FIXED
  PERCENT
}

enum BannerLinkType {
  PRODUCT
  CATEGORY
  BRAND
  CUSTOM_URL
}

enum FeaturedSectionType {
  NEWLY_ADDED
  FEATURED
  BEST_SELLER
  TOP_RATED
  MANUAL
}

enum MenuLocation {
  HEADER
  FOOTER
}

model Coupon {
  id                Int          @id @default(autoincrement())
  code              String       @unique
  description       String?
  discountType      DiscountType @map("discount_type")
  discountAmount    Decimal      @map("discount_amount") @db.Decimal(10, 2)
  appliesToShipping Boolean      @default(false) @map("applies_to_shipping")
  minOrderTotal     Decimal?     @map("min_order_total") @db.Decimal(10, 2)
  maxDiscountValue  Decimal?     @map("max_discount_value") @db.Decimal(10, 2)
  startsAt          DateTime?    @map("starts_at")
  endsAt            DateTime?    @map("ends_at")
  maxTotalUsage     Int?         @map("max_total_usage")
  maxUsagePerUser   Int?         @map("max_usage_per_user")
  usageCount        Int          @default(0) @map("usage_count")
  deletedAt         DateTime?    @map("deleted_at")
  createdAt         DateTime     @default(now()) @map("created_at")
  updatedAt         DateTime     @updatedAt @map("updated_at")

  orderLines OrderCouponLine[]

  @@map("coupons")
}

model OrderCouponLine {
  id             Int      @id @default(autoincrement())
  orderId        Int      @unique @map("order_id")
  order          Order    @relation(fields: [orderId], references: [id], onDelete: Cascade)
  couponId       Int      @map("coupon_id")
  coupon         Coupon   @relation(fields: [couponId], references: [id], onDelete: Restrict)
  couponCode     String   @map("coupon_code")
  discountAmount Decimal  @map("discount_amount") @db.Decimal(10, 2)
  createdAt      DateTime @default(now()) @map("created_at")

  @@map("order_coupon_lines")
}

model Banner {
  id           Int            @id @default(autoincrement())
  title        String
  slug         String         @unique
  linkType     BannerLinkType @map("link_type")
  productId    Int?           @map("product_id")
  product      Product?       @relation(fields: [productId], references: [id], onDelete: SetNull)
  categoryId   Int?           @map("category_id")
  category     Category?      @relation(fields: [categoryId], references: [id], onDelete: SetNull)
  brandId      Int?           @map("brand_id")
  brand        Brand?         @relation(fields: [brandId], references: [id], onDelete: SetNull)
  customUrl    String?        @map("custom_url")
  position     String
  displayOrder Int            @default(0) @map("display_order")
  status       CatalogStatus  @default(ACTIVE)
  startsAt     DateTime?      @map("starts_at")
  endsAt       DateTime?      @map("ends_at")
  createdAt    DateTime       @default(now()) @map("created_at")
  updatedAt    DateTime       @updatedAt @map("updated_at")

  @@map("banners")
}

model FeaturedSection {
  id          Int                 @id @default(autoincrement())
  title       String
  slug        String              @unique
  sectionType FeaturedSectionType @map("section_type")
  categoryId  Int?                @map("category_id")
  category    Category?           @relation(fields: [categoryId], references: [id], onDelete: SetNull)
  sortOrder   Int                 @default(0) @map("sort_order")
  status      CatalogStatus       @default(ACTIVE)

  manualProducts FeaturedSectionProduct[]

  @@map("featured_sections")
}

model FeaturedSectionProduct {
  featuredSectionId Int             @map("featured_section_id")
  productId         Int             @map("product_id")
  sortOrder         Int             @default(0) @map("sort_order")
  featuredSection   FeaturedSection @relation(fields: [featuredSectionId], references: [id], onDelete: Cascade)
  product           Product         @relation(fields: [productId], references: [id], onDelete: Cascade)

  @@id([featuredSectionId, productId])
  @@map("featured_section_products")
}

model HeroSlide {
  id         Int           @id @default(autoincrement())
  headline   String
  subheading String?
  ctaLabel   String?       @map("cta_label")
  ctaUrl     String?       @map("cta_url")
  sortOrder  Int           @default(0) @map("sort_order")
  status     CatalogStatus @default(ACTIVE)
  startsAt   DateTime?     @map("starts_at")
  endsAt     DateTime?     @map("ends_at")

  @@map("hero_slides")
}

model HeroTrustBadge {
  id        Int           @id @default(autoincrement())
  label     String
  icon      String?
  sortOrder Int           @default(0) @map("sort_order")
  status    CatalogStatus @default(ACTIVE)

  @@map("hero_trust_badges")
}

model Menu {
  id       Int           @id @default(autoincrement())
  name     String
  slug     String        @unique
  location MenuLocation
  status   CatalogStatus @default(ACTIVE)

  items MenuItem[]

  @@map("menus")
}

model MenuItem {
  id         Int           @id @default(autoincrement())
  menuId     Int           @map("menu_id")
  menu       Menu          @relation(fields: [menuId], references: [id], onDelete: Cascade)
  parentId   Int?          @map("parent_id")
  parent     MenuItem?     @relation("MenuItemTree", fields: [parentId], references: [id], onDelete: Cascade)
  children   MenuItem[]    @relation("MenuItemTree")
  label      String
  href       String?
  categoryId Int?          @map("category_id")
  category   Category?     @relation(fields: [categoryId], references: [id], onDelete: SetNull)
  sortOrder  Int           @default(0) @map("sort_order")
  status     CatalogStatus @default(ACTIVE)

  megaMenuPanel MegaMenuPanel?

  @@map("menu_items")
}

model MegaMenuPanel {
  id         Int      @id @default(autoincrement())
  menuItemId Int      @unique @map("menu_item_id")
  menuItem   MenuItem @relation(fields: [menuItemId], references: [id], onDelete: Cascade)
  sortOrder  Int      @default(0) @map("sort_order")

  columns MegaMenuColumn[]

  @@map("mega_menu_panels")
}

model MegaMenuColumn {
  id        Int           @id @default(autoincrement())
  panelId   Int           @map("panel_id")
  panel     MegaMenuPanel @relation(fields: [panelId], references: [id], onDelete: Cascade)
  title     String?
  sortOrder Int           @default(0) @map("sort_order")

  links MegaMenuLink[]

  @@map("mega_menu_columns")
}

model MegaMenuLink {
  id         Int            @id @default(autoincrement())
  columnId   Int            @map("column_id")
  column     MegaMenuColumn @relation(fields: [columnId], references: [id], onDelete: Cascade)
  label      String
  categoryId Int?           @map("category_id")
  category   Category?      @relation(fields: [categoryId], references: [id], onDelete: SetNull)
  href       String?
  sortOrder  Int            @default(0) @map("sort_order")

  @@map("mega_menu_links")
}
```

Also add the back-relation fields on models from prior tasks:
- In `model Order { ... }` (Task 6): add `couponLine OrderCouponLine?`.
- In `model Product { ... }` (Task 4): add `banners Banner[]`, `featuredSectionEntries FeaturedSectionProduct[]`.
- In `model Category { ... }` (Task 4): add `menuItems MenuItem[]`, `megaMenuLinks MegaMenuLink[]`, `featuredSections FeaturedSection[]`, `banners Banner[]`.
- In `model Brand { ... }` (Task 4): add `banners Banner[]`.

- [ ] **Step 4: Format and validate**

Run: `npx prisma format && npx prisma validate`
Expected: both succeed.

- [ ] **Step 5: Create and apply the migration**

Run: `npx prisma migrate dev --name marketing_and_merchandising`
Expected: migration created and applied.

- [ ] **Step 6: Run the test again to verify it passes**

Run: `npm run test:db -- 07-marketing`
Expected: PASS — including the one-coupon-per-order rejection.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations test/db/07-marketing.integration.spec.ts
git commit -m "feat(db): add Marketing domain (coupons, banners, featured sections, hero, mega menu)"
```

---

### Task 9: Content / CMS domain

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `test/db/08-content.integration.spec.ts`

**Interfaces:**
- Consumes: nothing new (self-contained domain; `Media` from Task 2 is referenced only by convention).
- Produces: `BlogCategory`, `Author`, `BlogPost`, `Page`, `FaqCategory`, `Faq`, `Testimonial`, `Enquiry` models; `ContentStatus`, `EnquiryStatus` enums.

- [ ] **Step 1: Write the failing test**

`test/db/08-content.integration.spec.ts`:
```ts
import { PrismaService } from '../../src/prisma/prisma.service';

describe('Content / CMS', () => {
  const prisma = new PrismaService();
  let blogCategoryId: number;
  let authorId: number;
  let blogPostId: number;
  let pageId: number;
  let faqCategoryId: number;
  let faqId: number;
  let testimonialId: number;
  let enquiryId: number;

  afterAll(async () => {
    if (blogPostId) await prisma.blogPost.delete({ where: { id: blogPostId } });
    if (authorId) await prisma.author.delete({ where: { id: authorId } });
    if (blogCategoryId) await prisma.blogCategory.delete({ where: { id: blogCategoryId } });
    if (pageId) await prisma.page.delete({ where: { id: pageId } });
    if (faqId) await prisma.faq.delete({ where: { id: faqId } });
    if (faqCategoryId) await prisma.faqCategory.delete({ where: { id: faqCategoryId } });
    if (testimonialId) await prisma.testimonial.delete({ where: { id: testimonialId } });
    if (enquiryId) await prisma.enquiry.delete({ where: { id: enquiryId } });
    await prisma.$disconnect();
  });

  it('creates a blog post with category and author, a page, an FAQ, a testimonial, and an enquiry', async () => {
    const blogCategory = await prisma.blogCategory.create({ data: { title: 'Test Buying Guides', slug: 'test-buying-guides' } });
    blogCategoryId = blogCategory.id;

    const author = await prisma.author.create({ data: { name: 'Test Author' } });
    authorId = author.id;

    const blogPost = await prisma.blogPost.create({
      data: {
        blogCategoryId,
        authorId,
        title: 'Test How to Build a Gaming PC',
        slug: 'test-how-to-build-a-gaming-pc',
        content: 'Step one...',
        status: 'PUBLISHED',
        publishedAt: new Date(),
      },
      include: { blogCategory: true, author: true },
    });
    blogPostId = blogPost.id;
    expect(blogPost.blogCategory?.title).toBe('Test Buying Guides');
    expect(blogPost.author?.name).toBe('Test Author');

    const page = await prisma.page.create({ data: { slug: 'test-shipping-info', title: 'Test Shipping Info', status: 'PUBLISHED' } });
    pageId = page.id;

    const faqCategory = await prisma.faqCategory.create({ data: { name: 'Test Shipping' } });
    faqCategoryId = faqCategory.id;
    const faq = await prisma.faq.create({
      data: { faqCategoryId, question: 'Do you ship to Northern Ireland?', answer: 'Yes.' },
    });
    faqId = faq.id;

    const testimonial = await prisma.testimonial.create({
      data: { name: 'Test Customer', quote: 'Great service', stars: 5 },
    });
    testimonialId = testimonial.id;

    const enquiry = await prisma.enquiry.create({
      data: { type: 'contact', name: 'Test Enquirer', message: 'Do you have this in stock?' },
    });
    enquiryId = enquiry.id;
    expect(enquiry.status).toBe('NEW');
  });

  it('rejects a duplicate page slug (unique constraint)', async () => {
    await expect(
      prisma.page.create({ data: { slug: 'test-shipping-info', title: 'Duplicate' } }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:db -- 08-content`
Expected: FAIL — compile error, none of the content models exist yet.

- [ ] **Step 3: Append Content / CMS models to the schema**

Append to `prisma/schema.prisma`:
```prisma
enum ContentStatus {
  DRAFT
  PUBLISHED
}

enum EnquiryStatus {
  NEW
  IN_PROGRESS
  RESOLVED
}

model BlogCategory {
  id        Int           @id @default(autoincrement())
  title     String
  slug      String        @unique
  sortOrder Int           @default(0) @map("sort_order")
  status    CatalogStatus @default(ACTIVE)

  posts BlogPost[]

  @@map("blog_categories")
}

model Author {
  id     Int           @id @default(autoincrement())
  name   String
  role   String?
  bio    String?
  status CatalogStatus @default(ACTIVE)

  posts BlogPost[]

  @@map("authors")
}

model BlogPost {
  id              Int           @id @default(autoincrement())
  uuid            String        @unique @default(uuid())
  blogCategoryId  Int?          @map("blog_category_id")
  blogCategory    BlogCategory? @relation(fields: [blogCategoryId], references: [id], onDelete: SetNull)
  authorId        Int?          @map("author_id")
  author          Author?       @relation(fields: [authorId], references: [id], onDelete: SetNull)
  title           String
  slug            String        @unique
  excerpt         String?
  content         String
  tags            Json?
  isFeatured      Boolean       @default(false) @map("is_featured")
  status          ContentStatus @default(DRAFT)
  publishedAt     DateTime?     @map("published_at")
  metaTitle       String?       @map("meta_title")
  metaDescription String?       @map("meta_description")
  createdAt       DateTime      @default(now()) @map("created_at")
  updatedAt       DateTime      @updatedAt @map("updated_at")

  @@map("blog_posts")
}

model Page {
  id              Int           @id @default(autoincrement())
  slug            String        @unique
  title           String
  contentBlocks   Json?         @map("content_blocks")
  metaTitle       String?       @map("meta_title")
  metaDescription String?       @map("meta_description")
  status          ContentStatus @default(DRAFT)
  isSystemPage    Boolean       @default(false) @map("is_system_page")
  createdAt       DateTime      @default(now()) @map("created_at")
  updatedAt       DateTime      @updatedAt @map("updated_at")

  @@map("pages")
}

model FaqCategory {
  id        Int           @id @default(autoincrement())
  name      String
  sortOrder Int           @default(0) @map("sort_order")
  status    CatalogStatus @default(ACTIVE)

  faqs Faq[]

  @@map("faq_categories")
}

model Faq {
  id            Int           @id @default(autoincrement())
  faqCategoryId Int?          @map("faq_category_id")
  faqCategory   FaqCategory?  @relation(fields: [faqCategoryId], references: [id], onDelete: SetNull)
  question      String
  answer        String
  sortOrder     Int           @default(0) @map("sort_order")
  status        CatalogStatus @default(ACTIVE)

  @@map("faqs")
}

model Testimonial {
  id        Int           @id @default(autoincrement())
  name      String
  title     String?
  quote     String
  stars     Int
  sortOrder Int           @default(0) @map("sort_order")
  status    CatalogStatus @default(ACTIVE)

  @@map("testimonials")
}

model Enquiry {
  id        Int           @id @default(autoincrement())
  type      String
  name      String
  email     String?
  phone     String?
  subject   String?
  message   String
  status    EnquiryStatus @default(NEW)
  createdAt DateTime      @default(now()) @map("created_at")
  updatedAt DateTime      @updatedAt @map("updated_at")

  @@map("enquiries")
}
```

- [ ] **Step 4: Format and validate**

Run: `npx prisma format && npx prisma validate`
Expected: both succeed.

- [ ] **Step 5: Create and apply the migration**

Run: `npx prisma migrate dev --name content_cms`
Expected: migration created and applied.

- [ ] **Step 6: Run the test again to verify it passes**

Run: `npm run test:db -- 08-content`
Expected: PASS — including the unique page-slug rejection.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations test/db/08-content.integration.spec.ts
git commit -m "feat(db): add Content/CMS domain (blog, pages, FAQs, testimonials, enquiries)"
```

---

### Task 10: Search & Personalization domain

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `test/db/09-search.integration.spec.ts`

**Interfaces:**
- Consumes: `Product` (Task 4).
- Produces: `SearchLog`, `TrendingProduct` models; `TrendingPeriod` enum.

- [ ] **Step 1: Write the failing test**

`test/db/09-search.integration.spec.ts`:
```ts
import { PrismaService } from '../../src/prisma/prisma.service';

describe('Search & Personalization', () => {
  const prisma = new PrismaService();
  let categoryId: number;
  let productId: number;
  let searchLogId: number;
  let trendingId: number;

  beforeAll(async () => {
    const category = await prisma.category.create({ data: { title: 'Test Search Category', slug: 'test-search-category' } });
    categoryId = category.id;
    const product = await prisma.product.create({
      data: { categoryId, title: 'Test Search Product', slug: 'test-search-product', status: 'ACTIVE' },
    });
    productId = product.id;
  });

  afterAll(async () => {
    if (trendingId) await prisma.trendingProduct.delete({ where: { id: trendingId } });
    if (searchLogId) await prisma.searchLog.delete({ where: { id: searchLogId } });
    if (productId) await prisma.product.delete({ where: { id: productId } });
    if (categoryId) await prisma.category.delete({ where: { id: categoryId } });
    await prisma.$disconnect();
  });

  it('logs a search and computes a trending score for a product', async () => {
    const log = await prisma.searchLog.create({
      data: { query: 'rtx 4070', resultCount: 3, entityTypes: ['product'] },
    });
    searchLogId = log.id;

    const trending = await prisma.trendingProduct.create({
      data: { productId, period: 'DAILY', searchCount: 12, viewCount: 40, saleCount: 2, score: 54, computedAt: new Date() },
    });
    trendingId = trending.id;

    const found = await prisma.trendingProduct.findUniqueOrThrow({
      where: { id: trendingId },
      include: { product: true },
    });
    expect(found.product.title).toBe('Test Search Product');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:db -- 09-search`
Expected: FAIL — compile error, `prisma.searchLog`/`trendingProduct` don't exist yet.

- [ ] **Step 3: Append Search & Personalization models to the schema**

Append to `prisma/schema.prisma`:
```prisma
enum TrendingPeriod {
  DAILY
  WEEKLY
  MONTHLY
}

model SearchLog {
  id          Int      @id @default(autoincrement())
  query       String
  resultCount Int      @map("result_count")
  entityTypes Json?    @map("entity_types")
  userId      Int?     @map("user_id")
  sessionId   String?  @map("session_id")
  ipAddress   String?  @map("ip_address")
  createdAt   DateTime @default(now()) @map("created_at")

  @@map("search_logs")
}

model TrendingProduct {
  id          Int            @id @default(autoincrement())
  productId   Int            @map("product_id")
  product     Product        @relation(fields: [productId], references: [id], onDelete: Cascade)
  period      TrendingPeriod
  searchCount Int            @default(0) @map("search_count")
  viewCount   Int            @default(0) @map("view_count")
  saleCount   Int            @default(0) @map("sale_count")
  score       Int            @default(0)
  computedAt  DateTime       @map("computed_at")

  @@index([productId, period, computedAt])
  @@map("trending_products")
}
```

Also add the back-relation field on the model from Task 4:
- In `model Product { ... }` (Task 4): add `trendingEntries TrendingProduct[]`.

- [ ] **Step 4: Format and validate**

Run: `npx prisma format && npx prisma validate`
Expected: both succeed.

- [ ] **Step 5: Create and apply the migration**

Run: `npx prisma migrate dev --name search_and_personalization`
Expected: migration created and applied.

- [ ] **Step 6: Run the test again to verify it passes**

Run: `npm run test:db -- 09-search`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations test/db/09-search.integration.spec.ts
git commit -m "feat(db): add Search & Personalization domain (search logs, trending products)"
```

---

### Task 11: Notifications & Settings domain

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `test/db/10-notifications.integration.spec.ts`

**Interfaces:**
- Consumes: nothing (deliberately plain, unrelated columns — see Global Constraints).
- Produces: `Notification`, `Setting` models.

- [ ] **Step 1: Write the failing test**

`test/db/10-notifications.integration.spec.ts`:
```ts
import { PrismaService } from '../../src/prisma/prisma.service';

describe('Notifications & Settings', () => {
  const prisma = new PrismaService();
  let notificationId: string;

  afterAll(async () => {
    if (notificationId) await prisma.notification.delete({ where: { id: notificationId } });
    await prisma.setting.delete({ where: { key: 'test_default_vat_rate' } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('creates a notification with a string UUID id, and a setting keyed by name', async () => {
    const notification = await prisma.notification.create({
      data: { type: 'order', title: 'Order shipped', message: 'Your order has shipped.' },
    });
    notificationId = notification.id;
    expect(typeof notification.id).toBe('string');
    expect(notification.isRead).toBe(false);

    const setting = await prisma.setting.create({
      data: { key: 'test_default_vat_rate', value: { percent: 20 } },
    });
    expect(setting.value).toEqual({ percent: 20 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:db -- 10-notifications`
Expected: FAIL — compile error, `prisma.notification`/`setting` don't exist yet.

- [ ] **Step 3: Append Notifications & Settings models to the schema**

Append to `prisma/schema.prisma`:
```prisma
// userId/adminUserId/orderId/sessionId below are deliberately plain columns,
// not Prisma relations: these are high-write, low-criticality log tables
// where a stale reference (user later deleted) shouldn't block inserts or
// require cascade bookkeeping — same trade-off as PaymentWebhookLog.
model Notification {
  id          String   @id @default(uuid())
  userId      Int?     @map("user_id")
  adminUserId Int?     @map("admin_user_id")
  orderId     Int?     @map("order_id")
  type        String
  title       String
  message     String
  isRead      Boolean  @default(false) @map("is_read")
  metadata    Json?
  createdAt   DateTime @default(now()) @map("created_at")

  @@map("notifications")
}

model Setting {
  key   String @id
  value Json

  @@map("settings")
}
```

- [ ] **Step 4: Format and validate**

Run: `npx prisma format && npx prisma validate`
Expected: both succeed.

- [ ] **Step 5: Create and apply the migration**

Run: `npx prisma migrate dev --name notifications_and_settings`
Expected: migration created and applied.

- [ ] **Step 6: Run the test again to verify it passes**

Run: `npm run test:db -- 10-notifications`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations test/db/10-notifications.integration.spec.ts
git commit -m "feat(db): add Notifications and Settings"
```

---

### Task 12: Gift Cards domain

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `test/db/11-giftcards.integration.spec.ts`

**Interfaces:**
- Consumes: `User` (Task 3), `Order` (Task 6).
- Produces: `GiftCard`, `GiftCardTransaction` models; `GiftCardStatus`, `GiftCardTxnType` enums.

- [ ] **Step 1: Write the failing test**

`test/db/11-giftcards.integration.spec.ts`:
```ts
import { PrismaService } from '../../src/prisma/prisma.service';

describe('Gift Cards', () => {
  const prisma = new PrismaService();
  let userId: number;
  let orderId: number;
  let giftCardId: number;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { email: 'test-giftcard-user@example.com', passwordHash: 'x', firstName: 'Gift', lastName: 'Tester' },
    });
    userId = user.id;

    const order = await prisma.order.create({
      data: {
        orderNumber: 'TESTGC00001',
        email: 'test-giftcard-user@example.com',
        billingFullName: 'Gift Tester',
        billingLine1: '1 Test Street',
        billingCity: 'London',
        billingPostcode: 'SW1A 1AA',
        shippingFullName: 'Gift Tester',
        shippingLine1: '1 Test Street',
        shippingCity: 'London',
        shippingPostcode: 'SW1A 1AA',
        subtotal: 25,
        total: 15,
      },
    });
    orderId = order.id;
  });

  afterAll(async () => {
    if (giftCardId) {
      await prisma.giftCardTransaction.deleteMany({ where: { giftCardId } });
      await prisma.giftCard.delete({ where: { id: giftCardId } });
    }
    if (orderId) await prisma.order.delete({ where: { id: orderId } });
    if (userId) await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('issues a gift card and redeems part of its balance against an order', async () => {
    const giftCard = await prisma.giftCard.create({
      data: {
        code: 'TESTGIFT100',
        initialBalance: 25,
        currentBalance: 25,
        purchasedByUserId: userId,
        transactions: { create: { amount: 25, type: 'ISSUE' } },
      },
      include: { transactions: true },
    });
    giftCardId = giftCard.id;
    expect(giftCard.transactions).toHaveLength(1);

    await prisma.giftCardTransaction.create({
      data: { giftCardId, orderId, amount: -10, type: 'REDEEM' },
    });
    await prisma.giftCard.update({ where: { id: giftCardId }, data: { currentBalance: 15 } });

    const updated = await prisma.giftCard.findUniqueOrThrow({
      where: { id: giftCardId },
      include: { transactions: true },
    });
    expect(updated.currentBalance.toString()).toBe('15');
    expect(updated.transactions).toHaveLength(2);
  });

  it('rejects a duplicate gift card code (unique constraint)', async () => {
    await expect(
      prisma.giftCard.create({ data: { code: 'TESTGIFT100', initialBalance: 5, currentBalance: 5 } }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:db -- 11-giftcards`
Expected: FAIL — compile error, `prisma.giftCard`/`giftCardTransaction` don't exist yet.

- [ ] **Step 3: Append Gift Cards models to the schema**

Append to `prisma/schema.prisma`:
```prisma
enum GiftCardStatus {
  ACTIVE
  REDEEMED
  EXPIRED
  DISABLED
}

enum GiftCardTxnType {
  ISSUE
  REDEEM
  REFUND
  ADJUSTMENT
}

model GiftCard {
  id                Int            @id @default(autoincrement())
  uuid              String         @unique @default(uuid())
  code              String         @unique
  initialBalance    Decimal        @map("initial_balance") @db.Decimal(10, 2)
  currentBalance    Decimal        @map("current_balance") @db.Decimal(10, 2)
  currency          String         @default("GBP")
  purchasedByUserId Int?           @map("purchased_by_user_id")
  purchasedByUser   User?          @relation(fields: [purchasedByUserId], references: [id], onDelete: SetNull)
  issuedToEmail     String?        @map("issued_to_email")
  status            GiftCardStatus @default(ACTIVE)
  expiresAt         DateTime?      @map("expires_at")
  createdAt         DateTime       @default(now()) @map("created_at")
  updatedAt         DateTime       @updatedAt @map("updated_at")

  transactions GiftCardTransaction[]

  @@map("gift_cards")
}

model GiftCardTransaction {
  id         Int             @id @default(autoincrement())
  giftCardId Int             @map("gift_card_id")
  giftCard   GiftCard        @relation(fields: [giftCardId], references: [id], onDelete: Restrict)
  orderId    Int?            @map("order_id")
  order      Order?          @relation(fields: [orderId], references: [id], onDelete: SetNull)
  amount     Decimal         @db.Decimal(10, 2)
  type       GiftCardTxnType
  createdAt  DateTime        @default(now()) @map("created_at")

  @@map("gift_card_transactions")
}
```

Also add the back-relation fields on models from prior tasks:
- In `model User { ... }` (Task 3): add `giftCards GiftCard[]`.
- In `model Order { ... }` (Task 6): add `giftCardTransactions GiftCardTransaction[]`.

- [ ] **Step 4: Format and validate**

Run: `npx prisma format && npx prisma validate`
Expected: both succeed.

- [ ] **Step 5: Create and apply the migration**

Run: `npx prisma migrate dev --name gift_cards`
Expected: migration created and applied.

- [ ] **Step 6: Run the test again to verify it passes**

Run: `npm run test:db -- 11-giftcards`
Expected: PASS — including the unique gift-card-code rejection.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations test/db/11-giftcards.integration.spec.ts
git commit -m "feat(db): add Gift Cards (stored-value balance + ledger)"
```

---

### Task 13: Seed script

**Files:**
- Create: `prisma/seed.ts`

**Interfaces:**
- Consumes: every model produced by Tasks 2–12.
- Produces: baseline reference data any future feature-implementation plan can rely on existing in a freshly-migrated database.

- [ ] **Step 1: Write the seed script**

`prisma/seed.ts`:
```ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Roles & permissions
  const superAdminRole = await prisma.role.upsert({
    where: { name: 'Super Admin' },
    update: {},
    create: { name: 'Super Admin', description: 'Full access to every admin capability' },
  });

  const permissionKeys = [
    'products.manage',
    'orders.manage',
    'orders.refund',
    'content.manage',
    'settings.manage',
    'reports.view',
  ];
  for (const key of permissionKeys) {
    const permission = await prisma.permission.upsert({
      where: { key },
      update: {},
      create: { key },
    });
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: superAdminRole.id, permissionId: permission.id } },
      update: {},
      create: { roleId: superAdminRole.id, permissionId: permission.id },
    });
  }

  // Product conditions
  const conditionTitles = ['New', 'Refurbished', 'Open Box', 'Used'];
  for (const title of conditionTitles) {
    await prisma.productCondition.upsert({
      where: { slug: title.toLowerCase().replace(/\s+/g, '-') },
      update: {},
      create: { title, slug: title.toLowerCase().replace(/\s+/g, '-') },
    });
  }

  // Tax rates
  const standardVat = await prisma.taxRate.upsert({
    where: { title: 'Standard' },
    update: {},
    create: { title: 'Standard', ratePercent: 20.0, isDefault: true },
  });
  await prisma.taxRate.upsert({
    where: { title: 'Reduced' },
    update: {},
    create: { title: 'Reduced', ratePercent: 5.0 },
  });
  await prisma.taxRate.upsert({
    where: { title: 'Zero-rated' },
    update: {},
    create: { title: 'Zero-rated', ratePercent: 0.0 },
  });

  // Shipping methods
  const royalMailExisting = await prisma.shippingMethod.findFirst({ where: { title: 'Royal Mail Tracked 48' } });
  if (!royalMailExisting) {
    await prisma.shippingMethod.create({
      data: {
        title: 'Royal Mail Tracked 48',
        carrier: 'Royal Mail',
        rateType: 'FLAT',
        flatRate: 4.99,
        freeOverAmount: 75,
        estimatedDaysMin: 2,
        estimatedDaysMax: 3,
      },
    });
  }
  const dhlExisting = await prisma.shippingMethod.findFirst({ where: { title: 'DHL Next Day' } });
  if (!dhlExisting) {
    await prisma.shippingMethod.create({
      data: {
        title: 'DHL Next Day',
        carrier: 'DHL',
        rateType: 'FLAT',
        flatRate: 9.99,
        estimatedDaysMin: 1,
        estimatedDaysMax: 1,
      },
    });
  }

  // Category tree (subset from requirement.md)
  const pcComponents = await prisma.category.upsert({
    where: { slug: 'pc-components' },
    update: {},
    create: { title: 'PC Components', slug: 'pc-components', sortOrder: 1 },
  });
  await prisma.category.upsert({
    where: { slug: 'cpus-processors' },
    update: {},
    create: { title: 'CPUs / Processors', slug: 'cpus-processors', parentId: pcComponents.id, sortOrder: 1 },
  });
  await prisma.category.upsert({
    where: { slug: 'graphics-cards' },
    update: {},
    create: { title: 'Graphics Cards', slug: 'graphics-cards', parentId: pcComponents.id, sortOrder: 2 },
  });

  const computers = await prisma.category.upsert({
    where: { slug: 'computers' },
    update: {},
    create: { title: 'Computers', slug: 'computers', sortOrder: 2 },
  });
  await prisma.category.upsert({
    where: { slug: 'gaming-pcs' },
    update: {},
    create: { title: 'Gaming PCs', slug: 'gaming-pcs', parentId: computers.id, sortOrder: 1 },
  });

  const laptops = await prisma.category.upsert({
    where: { slug: 'laptops' },
    update: {},
    create: { title: 'Laptops', slug: 'laptops', sortOrder: 3 },
  });
  await prisma.category.upsert({
    where: { slug: 'gaming-laptops' },
    update: {},
    create: { title: 'Gaming Laptops', slug: 'gaming-laptops', parentId: laptops.id, sortOrder: 1 },
  });

  const peripherals = await prisma.category.upsert({
    where: { slug: 'peripherals' },
    update: {},
    create: { title: 'Peripherals', slug: 'peripherals', sortOrder: 4 },
  });
  await prisma.category.upsert({
    where: { slug: 'monitors' },
    update: {},
    create: { title: 'Monitors', slug: 'monitors', parentId: peripherals.id, sortOrder: 1 },
  });

  // Brands
  for (const title of ['AMD', 'NVIDIA', 'Intel', 'ASUS']) {
    await prisma.brand.upsert({
      where: { slug: title.toLowerCase() },
      update: {},
      create: { title, slug: title.toLowerCase() },
    });
  }

  // Demo product + variant (for local frontend development against a non-empty catalog)
  const graphicsCards = await prisma.category.findUniqueOrThrow({ where: { slug: 'graphics-cards' } });
  const nvidia = await prisma.brand.findUniqueOrThrow({ where: { slug: 'nvidia' } });
  const newCondition = await prisma.productCondition.findUniqueOrThrow({ where: { slug: 'new' } });
  const demoProduct = await prisma.product.upsert({
    where: { slug: 'nvidia-geforce-rtx-4070' },
    update: {},
    create: {
      categoryId: graphicsCards.id,
      brandId: nvidia.id,
      productConditionId: newCondition.id,
      taxRateId: standardVat.id,
      title: 'NVIDIA GeForce RTX 4070',
      slug: 'nvidia-geforce-rtx-4070',
      shortDescription: '12GB GDDR6X graphics card',
      status: 'ACTIVE',
    },
  });
  await prisma.productVariant.upsert({
    where: { slug: 'nvidia-geforce-rtx-4070-12gb' },
    update: {},
    create: {
      productId: demoProduct.id,
      title: '12GB',
      slug: 'nvidia-geforce-rtx-4070-12gb',
      price: 549.99,
      stockQty: 25,
      isDefault: true,
    },
  });

  // Settings
  await prisma.setting.upsert({
    where: { key: 'default_vat_rate_percent' },
    update: {},
    create: { key: 'default_vat_rate_percent', value: 20 },
  });
  await prisma.setting.upsert({
    where: { key: 'allowed_shipping_countries' },
    update: {},
    create: { key: 'allowed_shipping_countries', value: ['GB'] },
  });

  // Header menu
  const headerMenu = await prisma.menu.upsert({
    where: { slug: 'header' },
    update: {},
    create: { name: 'Header', slug: 'header', location: 'HEADER' },
  });
  const existingComponentsItem = await prisma.menuItem.findFirst({
    where: { menuId: headerMenu.id, label: 'PC Components' },
  });
  if (!existingComponentsItem) {
    await prisma.menuItem.create({
      data: { menuId: headerMenu.id, label: 'PC Components', categoryId: pcComponents.id, sortOrder: 1 },
    });
  }

  console.log('Seed complete.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

- [ ] **Step 2: Run the seed against the dev database**

Run: `npx prisma db seed`
Expected: prints `Seed complete.` with no errors.

- [ ] **Step 3: Verify the seed data landed correctly**

Run:
```bash
npx prisma studio
```
Expected: opens a browser to `localhost:5555`; spot-check that `roles`, `permissions`, `product_conditions`, `tax_rates`, `shipping_methods`, `categories`, `brands`, `products`, `product_variants`, `settings`, and `menus`/`menu_items` all have the expected rows. Close Prisma Studio when done (Ctrl+C).

- [ ] **Step 4: Re-run the seed to confirm idempotency**

Run: `npx prisma db seed`
Expected: prints `Seed complete.` again with no errors and no duplicate-row errors — every write uses `upsert` or a `findFirst`-guarded `create`.

- [ ] **Step 5: Commit**

```bash
git add prisma/seed.ts
git commit -m "feat(db): add idempotent seed script for reference data"
```

---

### Task 14: Final verification — fresh migrate reset + full test suite + README

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: the entire schema and test suite from Tasks 1–13.
- Produces: proof that the full migration history replays cleanly from empty, and setup docs for the next engineer.

- [ ] **Step 1: Validate and format the final schema**

Run: `npx prisma format && npx prisma validate`
Expected: both succeed with no diff from `format` (schema was kept formatted throughout) and no validation errors.

- [ ] **Step 2: Reset the dev database from scratch**

Run: `npx prisma migrate reset --force`
Expected: drops and recreates `ukshop_dev`, reapplies every migration from Task 1 through Task 12 in order, then automatically runs `prisma/seed.ts` (via the `"prisma": { "seed": ... }` config in `package.json`). Confirm it ends with `Seed complete.` and no errors — this is the strongest proof that the migration history is consistent and has no missing/out-of-order dependency.

- [ ] **Step 3: Run the full DB integration test suite**

Run: `npm run test:db`
Expected: PASS — all 12 test files (`00-connection` through `11-giftcards`) pass against the freshly-reset database.

- [ ] **Step 4: Write setup instructions to the README**

`README.md`:
```markdown
# UK Computer Shop API

NestJS + PostgreSQL + Prisma backend for UK Computer Shop.

## Prerequisites

- Node.js 20+
- Docker (for local Postgres)

## Setup

```bash
npm install
docker compose up -d
cp .env.example .env        # if you don't already have one — see below for values
npx prisma migrate deploy
npx prisma db seed
```

`.env` (gitignored):
```
DATABASE_URL="postgresql://ukshop:ukshop_dev_password@localhost:5432/ukshop_dev?schema=public"
```

`.env.test` (gitignored, used only by `npm run test:db`):
```
DATABASE_URL="postgresql://ukshop:ukshop_dev_password@localhost:5432/ukshop_test?schema=public"
```

## Common commands

| Command | Purpose |
|---|---|
| `npm run start:dev` | Run the API in watch mode |
| `npx prisma studio` | Browse the database visually |
| `npx prisma migrate dev --name <change>` | Create + apply a new migration during development |
| `npm run test:db` | Run the database integration test suite against `ukshop_test` |
| `npx prisma migrate reset --force` | Drop, recreate, remigrate, and reseed the dev database from scratch |

## Database

The schema is documented in [`docs/superpowers/specs/2026-08-28-database-design.md`](docs/superpowers/specs/2026-08-28-database-design.md) and was implemented via [`docs/superpowers/plans/2026-08-28-database-design.md`](docs/superpowers/plans/2026-08-28-database-design.md).
```

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: add setup instructions for local development"
```

---

## Post-plan note

This plan produces the database layer only — no NestJS controllers, services, DTOs, or API endpoints yet. Each domain (Catalog, Cart, Orders, etc.) should get its own feature-implementation plan on top of this schema, using the same brainstorming → spec → plan flow.
