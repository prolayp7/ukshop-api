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
