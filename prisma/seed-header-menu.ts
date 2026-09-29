import { PrismaClient } from '@prisma/client';

// Recreates the storefront header navigation - previously hardcoded in ukcshop's Header.tsx - as the
// admin-managed "header" menu: one AUTO mega panel per top-level category, the hand-picked Gaming
// panel, then Brands and Deals. It only runs while the menu is empty or still holds the single
// placeholder item older seeds created, so it never overwrites a menu an admin has edited.
// Standalone: npx ts-node prisma/seed-header-menu.ts [--replace]  (--replace overwrites an edited menu)

const DEPARTMENT_ICONS: Record<string, string> = {
  'PC Components': 'i-gpu',
  Computers: 'i-pc',
  Laptops: 'i-lap',
  Peripherals: 'i-mon',
  Networking: 'i-net',
  Accessories: 'i-cable',
};

// Featured cards; `category` is the title of the category the card links to.
const DEPARTMENT_PROMOS: Record<string, { title: string; text: string; category: string }> = {
  'PC Components': { title: 'Build your own', text: 'Every part, compatibility checked before it ships.', category: 'PC Components' },
  Computers: { title: 'Business fleets', text: 'Volume pricing on Business PCs and Workstations.', category: 'Business PCs' },
  Laptops: { title: 'Student laptops', text: 'Lightweight, long battery life, ready for lectures.', category: 'Student Laptops' },
  Peripherals: { title: 'Build your battlestation', text: 'Monitors, keyboards and headsets that match.', category: 'Monitors' },
  Networking: { title: 'Whole-home Wi-Fi', text: 'Mesh access points for dead-zone-free coverage.', category: 'Networking' },
  Accessories: { title: 'Docking stations', text: 'One cable, full desk setup.', category: 'Docking Stations' },
};

const GAMING_COLUMNS = [
  { title: 'Systems', links: ['Gaming PCs', 'Gaming Laptops'] },
  { title: 'Build it yourself', links: ['Graphics Cards', 'CPUs / Processors', 'Motherboards'] },
  { title: 'Gear', links: ['Monitors', 'Gaming Accessories', 'Headsets', 'Keyboards', 'Mice'] },
];

export async function seedHeaderMenu(prisma: PrismaClient, { replace = false } = {}): Promise<string[]> {
  const notes: string[] = [];
  const menu = await prisma.menu.upsert({ where: { slug: 'header' }, update: {}, create: { name: 'Header', slug: 'header', location: 'HEADER' } });
  const existing = await prisma.menuItem.findMany({ where: { menuId: menu.id }, include: { megaMenuPanel: true } });
  const placeholderOnly = existing.length === 1 && existing[0].label === 'PC Components' && !existing[0].megaMenuPanel;
  if (existing.length && !placeholderOnly && !replace) return ['Header menu already configured; left unchanged (use --replace to rebuild it).'];

  const categories = await prisma.category.findMany({
    where: { status: 'ACTIVE', deletedAt: null },
    select: { id: true, title: true, parentId: true },
    orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
  });
  const byTitle = new Map(categories.map((category) => [category.title.toLowerCase(), category]));
  const find = (title: string) => byTitle.get(title.toLowerCase());

  await prisma.$transaction(async (tx) => {
    await tx.menuItem.deleteMany({ where: { menuId: menu.id } });
    let sortOrder = 1;

    for (const department of categories.filter((category) => category.parentId === null)) {
      const promo = DEPARTMENT_PROMOS[department.title];
      const promoTarget = promo ? find(promo.category) : undefined;
      if (promo && !promoTarget) notes.push(`${department.title}: featured card linked to the department itself ("${promo.category}" does not exist).`);
      await tx.menuItem.create({
        data: {
          menuId: menu.id, label: department.title, categoryId: department.id, sortOrder: sortOrder++, icon: DEPARTMENT_ICONS[department.title] ?? 'i-gpu',
          megaMenuPanel: {
            create: {
              mode: 'AUTO', eyebrow: 'Shop department',
              ...(promo ? { promoEnabled: true, promoTitle: promo.title, promoText: promo.text, promoCta: 'Shop now', promoCategoryId: (promoTarget ?? department).id } : {}),
            },
          },
        },
      });
    }

    const gamingPcs = find('Gaming PCs');
    const columns = GAMING_COLUMNS.map((column, columnIndex) => {
      const links = column.links.flatMap((title, linkIndex) => {
        const category = find(title);
        if (!category) { notes.push(`Gaming: dropped the "${title}" link (no such category).`); return []; }
        return [{ label: title, categoryId: category.id, sortOrder: linkIndex }];
      });
      return { title: column.title, sortOrder: columnIndex, links: { create: links } };
    }).filter((column) => column.links.create.length);
    const pcComponents = find('PC Components');
    await tx.menuItem.create({
      data: {
        menuId: menu.id, label: 'Gaming', highlight: true, sortOrder: sortOrder++,
        ...(gamingPcs ? { categoryId: gamingPcs.id } : { href: '/category' }),
        megaMenuPanel: {
          create: {
            mode: 'CUSTOM', eyebrow: 'Play your way', columns: { create: columns },
            promoEnabled: Boolean(pcComponents), promoTitle: 'Level up your gaming', promoText: 'Prebuilt rigs, tested and benchmarked before they ship.', promoCta: 'Explore gaming', promoCategoryId: pcComponents?.id ?? null,
          },
        },
      },
    });

    await tx.menuItem.create({ data: { menuId: menu.id, label: 'Brands', href: '/brands', sortOrder: sortOrder++ } });
    await tx.menuItem.create({ data: { menuId: menu.id, label: 'Deals', href: '/deals', highlight: true, sortOrder: sortOrder++ } });
  });
  return [`Header menu rebuilt${existing.length ? ` (replaced ${existing.length} existing item${existing.length === 1 ? '' : 's'})` : ''}.`, ...notes];
}

if (require.main === module) {
  const prisma = new PrismaClient();
  seedHeaderMenu(prisma, { replace: process.argv.includes('--replace') })
    .then((notes) => notes.forEach((note) => console.log(note)))
    .catch((error) => { console.error(error); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
}
