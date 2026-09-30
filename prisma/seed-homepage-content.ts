import { HomepageSectionType, Prisma, PrismaClient } from '@prisma/client';

// Content for the homepage sections whose items are still hardcoded in the storefront
// (ukcshop src/lib/homepage-content.ts and designs/highstreet/Home.tsx). Each section's items are
// stored in its HomepageSection.config next to the editable heading/body, so the admin can manage
// them once the storefront and admin read these keys. The seeded values reproduce what the homepage
// shows today, with two deliberate corrections: the Gaming showcase uses real Gaming PC products
// instead of the three invented builds, and Buying guides link to CMS pages (seeded as drafts).
//
// Config keys written (the contract for wiring the admin and storefront):
//   NEW_ARRIVALS      tabs:       { label, categorySlug | null }[]           (null = all products)
//   BRANDS            brandSlugs: string[]                                    (order shown)
//   TESTIMONIALS      points:     { icon, text }[]                            (the "why buy" list)
//   FAQS              faqIds:     number[]                                    (order shown)
//   SHOP_BY_NEED      cards:      { title, text, categorySlug }[]
//   GAMING_SHOWCASE   products:   { productSlug, tier }[]; chips: categorySlug[]
//   LAPTOP_SHOWCASE   cards:      { title, text, categorySlug }[]
//   BUYING_GUIDES     guides:     { title, tag, pageSlug }[]                  (shown once the page is published)
//   BUSINESS_BANNER   ctaLabel, categorySlug                                 (heading/body are the section text)
//   CATEGORY_SPLIT    columns:    { heading, text, chips: categorySlug[], linkLabel, categorySlug }[]
//
// The last two sections were fixed blocks below the managed sections; when missing they are created
// after every existing section, so the homepage keeps its current order.
//
// Idempotent: a key already present in a section's config is never overwritten, so admin edits
// survive a reseed. Standalone: npx ts-node prisma/seed-homepage-content.ts

type Card = { title: string; text: string; categorySlug: string };

const ARRIVAL_TABS = [
  { label: 'All', categorySlug: null },
  { label: 'Computers', categorySlug: 'computers' },
  { label: 'Components', categorySlug: 'pc-components' },
  { label: 'Laptops', categorySlug: 'laptops' },
  { label: 'Gaming', categorySlug: 'gaming-pcs' },
  { label: 'Peripherals', categorySlug: 'peripherals' },
];

const WHY_POINTS = [
  { icon: 'i-truck', text: 'Fast UK-wide delivery, despatched from Manchester' },
  { icon: 'i-shield', text: 'Manufacturer warranty on every product' },
  { icon: 'i-wrench', text: 'Every system stress-tested for 48 hours before it ships' },
  { icon: 'i-card', text: 'Secure payment and 0% finance on qualifying orders' },
  { icon: 'i-user', text: 'Real technical support from people who build PCs' },
];

const NEED_CARDS: Card[] = [
  { title: 'Gaming', text: 'High-performance PCs and components for 1080p, 1440p and 4K gaming.', categorySlug: 'gaming-pcs' },
  { title: 'Business', text: 'Reliable desktops, laptops and monitors for teams that need uptime.', categorySlug: 'desktop-pcs' },
  { title: 'Creative Work', text: 'Colour-accurate displays and fast storage for photo and video editing.', categorySlug: 'workstations' },
  { title: 'AI & Workstations', text: 'High core-count CPUs and workstation-class GPUs for serious workloads.', categorySlug: 'workstations' },
  { title: 'Home Computing', text: 'Compact, quiet machines for browsing, streaming and everyday admin.', categorySlug: 'mini-pcs' },
  { title: 'Student', text: 'Thin, light laptops built for lecture halls, not boardrooms.', categorySlug: 'ultrabooks' },
];

const LAPTOP_CARDS: Card[] = [
  { title: 'Gaming Laptops', text: 'RTX-powered, high refresh screens, desktop-class performance you can close and carry.', categorySlug: 'gaming-laptops' },
  { title: 'Business Laptops', text: 'Long battery life, sturdy chassis and the security features IT teams ask for.', categorySlug: 'business-laptops' },
  { title: 'Ultrabooks', text: 'Thin, light and long-lasting — built for lectures, commutes and working on the move.', categorySlug: 'ultrabooks' },
];

const BUSINESS_BANNER = { ctaLabel: 'Shop business computing', categorySlug: 'desktop-pcs' };

const SPLIT_COLUMNS = [
  { heading: 'Build a better network', text: 'Routers, switches and wireless adapters for a network that keeps up.', chips: ['routers', 'network-switches', 'wireless-adapters'], linkLabel: 'Shop networking', categorySlug: 'networking' },
  { heading: 'Complete your setup', text: 'Keyboards, mice, headsets and webcams to finish the job.', chips: ['keyboards', 'mice', 'headsets', 'webcams'], linkLabel: 'Shop peripherals', categorySlug: 'peripherals' },
];

const GAMING_CHIPS = ['gaming-pcs', 'gaming-laptops', 'graphics-cards', 'monitors', 'keyboards', 'mice', 'headsets'];

// One real Gaming PC per tier: the cheapest active, in-stock model whose title names the GPU.
const GAMING_TIERS = [
  { tier: 'TIER 01 · 1080P', gpu: 'RTX 4060' },
  { tier: 'TIER 02 · 1440P · MOST POPULAR', gpu: 'RTX 4070' },
  { tier: 'TIER 03 · 4K', gpu: 'RTX 4080' },
];

// The eight guides the homepage lists today. No guide pages exist yet, so each gets a draft CMS page
// with an outline; a guide appears on the homepage only once its page is written and published.
const GUIDES: { title: string; slug: string; outline: string[] }[] = [
  { title: 'How to Choose a Gaming PC', slug: 'guide-how-to-choose-a-gaming-pc', outline: ['Decide on your resolution and frame rate', 'Graphics card first', 'Processor, memory and storage', 'Cooling, case and power supply', 'Pre-built or custom?'] },
  { title: 'Best GPU for 1440p Gaming', slug: 'guide-best-gpu-for-1440p-gaming', outline: ['What 1440p asks of a graphics card', 'Video memory', 'Our picks by budget', 'Pairing with the right processor'] },
  { title: 'How Much RAM Do You Need?', slug: 'guide-how-much-ram-do-you-need', outline: ['Everyday use', 'Gaming', 'Creative work and workstations', 'Speed, timings and dual channel'] },
  { title: "SSD vs HDD: What's Right for You?", slug: 'guide-ssd-vs-hdd', outline: ['How they differ', 'NVMe vs SATA SSDs', 'When a hard drive still makes sense', 'Choosing capacity'] },
  { title: 'How to Choose a Laptop', slug: 'guide-how-to-choose-a-laptop', outline: ['What will you use it for?', 'Screen size and weight', 'Processor, memory and storage', 'Battery life', 'Ports and connectivity'] },
  { title: 'Gaming Monitor Buying Guide', slug: 'guide-gaming-monitor-buying-guide', outline: ['Resolution and screen size', 'Refresh rate and response time', 'Panel types', 'Adaptive sync (G-Sync / FreeSync)', 'HDR'] },
  { title: 'How to Build a Gaming PC', slug: 'guide-how-to-build-a-gaming-pc', outline: ['Choosing compatible parts', 'Tools you need', 'Step-by-step assembly', 'First boot and drivers', 'Common mistakes'] },
  { title: 'Best Business Laptops for 2026', slug: 'guide-best-business-laptops-2026', outline: ['What businesses need from a laptop', 'Security and manageability', 'Battery life and build quality', 'Our picks'] },
];

async function gamingProducts(prisma: PrismaClient) {
  const products = await prisma.product.findMany({
    where: { status: 'ACTIVE', category: { slug: 'gaming-pcs' }, variants: { some: { stockQty: { gt: 0 } } } },
    select: { slug: true, title: true, variants: { select: { price: true }, orderBy: { price: 'asc' }, take: 1 } },
  });
  return GAMING_TIERS.flatMap(({ tier, gpu }) => {
    const pick = products
      .filter((product) => product.title.includes(gpu) && product.variants.length)
      .sort((a, b) => Number(a.variants[0].price) - Number(b.variants[0].price))[0];
    return pick ? [{ productSlug: pick.slug, tier }] : [];
  });
}

export async function seedHomepageContent(prisma: PrismaClient): Promise<string[]> {
  const notes: string[] = [];

  const categorySlugs = new Set((await prisma.category.findMany({ select: { slug: true } })).map((category) => category.slug));
  const realCards = (cards: Card[], section: string) => cards.filter((card) => {
    if (categorySlugs.has(card.categorySlug)) return true;
    notes.push(`${section}: skipped "${card.title}", no category with slug ${card.categorySlug}.`);
    return false;
  });

  // Draft guide pages (matched by slug; existing pages are left untouched).
  for (const guide of GUIDES) {
    if (await prisma.page.findUnique({ where: { slug: guide.slug }, select: { id: true } })) continue;
    await prisma.page.create({
      data: {
        slug: guide.slug, title: guide.title, metaTitle: guide.title, status: 'DRAFT',
        contentBlocks: guide.outline.map((heading) => ({ heading, body: '<p>Write this section before publishing.</p>' })),
      },
    });
    notes.push(`Created draft guide page /pages/${guide.slug}.`);
  }

  // Former fixed blocks: create their section rows at the end of the current order.
  for (const [type, label] of [['BUSINESS_BANNER', 'Business banner'], ['CATEGORY_SPLIT', 'Network & setup links']] as const) {
    if (await prisma.homepageSection.findFirst({ where: { type }, select: { id: true } })) continue;
    const last = await prisma.homepageSection.findFirst({ orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } });
    await prisma.homepageSection.create({ data: { type, label, sortOrder: (last?.sortOrder ?? -1) + 1 } });
    notes.push(`Created the ${label} homepage section.`);
  }

  const brands = await prisma.brand.findMany({ where: { status: 'ACTIVE' }, orderBy: { title: 'asc' }, take: 8, select: { slug: true } });
  const faqs = (await prisma.faqCategory.findMany({
    where: { status: 'ACTIVE' }, orderBy: { sortOrder: 'asc' },
    include: { faqs: { where: { status: 'ACTIVE' }, orderBy: { sortOrder: 'asc' }, select: { id: true } } },
  })).flatMap((category) => category.faqs.map((faq) => faq.id));
  const gaming = await gamingProducts(prisma);
  if (gaming.length < GAMING_TIERS.length) notes.push(`Gaming showcase: found ${gaming.length} of ${GAMING_TIERS.length} tier products in Gaming PCs.`);

  const content: Partial<Record<HomepageSectionType, Record<string, unknown>>> = {
    NEW_ARRIVALS: { tabs: ARRIVAL_TABS.filter((tab) => tab.categorySlug === null || categorySlugs.has(tab.categorySlug)) },
    BRANDS: { brandSlugs: brands.map((brand) => brand.slug) },
    TESTIMONIALS: { points: WHY_POINTS },
    FAQS: { faqIds: faqs },
    SHOP_BY_NEED: { cards: realCards(NEED_CARDS, 'Shop by need') },
    GAMING_SHOWCASE: { products: gaming, chips: GAMING_CHIPS.filter((slug) => categorySlugs.has(slug)) },
    LAPTOP_SHOWCASE: { cards: realCards(LAPTOP_CARDS, 'Laptop showcase') },
    BUYING_GUIDES: { guides: GUIDES.map((guide) => ({ title: guide.title, tag: 'Buying guide', pageSlug: guide.slug })) },
    BUSINESS_BANNER: categorySlugs.has(BUSINESS_BANNER.categorySlug) ? BUSINESS_BANNER : { ctaLabel: BUSINESS_BANNER.ctaLabel },
    CATEGORY_SPLIT: { columns: SPLIT_COLUMNS.map((column) => ({ ...column, chips: column.chips.filter((slug) => categorySlugs.has(slug)) })) },
  };

  for (const [type, values] of Object.entries(content) as [HomepageSectionType, Record<string, unknown>][]) {
    const section = await prisma.homepageSection.findFirst({ where: { type }, select: { id: true, config: true } });
    if (!section) { notes.push(`${type}: no homepage section row; content not seeded.`); continue; }
    const config = section.config && typeof section.config === 'object' && !Array.isArray(section.config) ? section.config as Record<string, unknown> : {};
    const missing = Object.fromEntries(Object.entries(values).filter(([key]) => config[key] === undefined));
    if (!Object.keys(missing).length) continue;
    await prisma.homepageSection.update({ where: { id: section.id }, data: { config: { ...config, ...missing } as Prisma.InputJsonValue } });
    notes.push(`${type}: seeded ${Object.keys(missing).join(', ')}.`);
  }
  return notes.length ? notes : ['Homepage content already seeded; nothing changed.'];
}

if (require.main === module) {
  const prisma = new PrismaClient();
  seedHomepageContent(prisma)
    .then((notes) => notes.forEach((note) => console.log(note)))
    .catch((error) => { console.error(error); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
}
