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
  // Note: Category.slug is no longer a Prisma `@unique` field (it's enforced via a
  // partial unique index scoped to live rows instead, so soft-deleted slugs can be
  // reused - see the schema_review_fixes migration), so it can't be used in an
  // `upsert`/`findUnique` where-clause. Fall back to findFirst + conditional create.
  const findOrCreateCategory = (where: { slug: string }, create: Parameters<typeof prisma.category.create>[0]['data']) =>
    prisma.category.findFirst({ where }).then((existing) => existing ?? prisma.category.create({ data: create }));

  const pcComponents = await findOrCreateCategory(
    { slug: 'pc-components' },
    { title: 'PC Components', slug: 'pc-components', sortOrder: 1 },
  );
  await findOrCreateCategory(
    { slug: 'cpus-processors' },
    { title: 'CPUs / Processors', slug: 'cpus-processors', parentId: pcComponents.id, sortOrder: 1 },
  );
  await findOrCreateCategory(
    { slug: 'graphics-cards' },
    { title: 'Graphics Cards', slug: 'graphics-cards', parentId: pcComponents.id, sortOrder: 2 },
  );

  const computers = await findOrCreateCategory(
    { slug: 'computers' },
    { title: 'Computers', slug: 'computers', sortOrder: 2 },
  );
  await findOrCreateCategory(
    { slug: 'gaming-pcs' },
    { title: 'Gaming PCs', slug: 'gaming-pcs', parentId: computers.id, sortOrder: 1 },
  );

  const laptops = await findOrCreateCategory(
    { slug: 'laptops' },
    { title: 'Laptops', slug: 'laptops', sortOrder: 3 },
  );
  await findOrCreateCategory(
    { slug: 'gaming-laptops' },
    { title: 'Gaming Laptops', slug: 'gaming-laptops', parentId: laptops.id, sortOrder: 1 },
  );

  const peripherals = await findOrCreateCategory(
    { slug: 'peripherals' },
    { title: 'Peripherals', slug: 'peripherals', sortOrder: 4 },
  );
  await findOrCreateCategory(
    { slug: 'monitors' },
    { title: 'Monitors', slug: 'monitors', parentId: peripherals.id, sortOrder: 1 },
  );

  // Brands
  for (const title of ['AMD', 'NVIDIA', 'Intel', 'ASUS']) {
    await prisma.brand.upsert({
      where: { slug: title.toLowerCase() },
      update: {},
      create: { title, slug: title.toLowerCase() },
    });
  }

  // Demo product + variant (for local frontend development against a non-empty catalog)
  // Product.slug and ProductVariant.slug are likewise no longer `@unique` (same partial-index
  // reasoning as Category.slug above), so use findFirst-or-create here too.
  const graphicsCards = await prisma.category.findFirstOrThrow({ where: { slug: 'graphics-cards' } });
  const nvidia = await prisma.brand.findUniqueOrThrow({ where: { slug: 'nvidia' } });
  const newCondition = await prisma.productCondition.findUniqueOrThrow({ where: { slug: 'new' } });
  const demoProduct = await prisma.product.findFirst({ where: { slug: 'nvidia-geforce-rtx-4070' } }).then(
    (existing) =>
      existing ??
      prisma.product.create({
        data: {
          categoryId: graphicsCards.id,
          brandId: nvidia.id,
          productConditionId: newCondition.id,
          taxRateId: standardVat.id,
          title: 'NVIDIA GeForce RTX 4070',
          slug: 'nvidia-geforce-rtx-4070',
          shortDescription: '12GB GDDR6X graphics card',
          status: 'ACTIVE',
        },
      }),
  );
  const demoVariantExisting = await prisma.productVariant.findFirst({ where: { slug: 'nvidia-geforce-rtx-4070-12gb' } });
  if (!demoVariantExisting) {
    await prisma.productVariant.create({
      data: {
        productId: demoProduct.id,
        title: '12GB',
        slug: 'nvidia-geforce-rtx-4070-12gb',
        price: 549.99,
        stockQty: 25,
        isDefault: true,
      },
    });
  }

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
