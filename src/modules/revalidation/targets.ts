import { PrismaService } from '../../prisma/prisma.service';
import { CacheTags } from './cache-tags';
import type { RevalidationTarget } from './revalidation.service';

// What each kind of admin change must clear on the storefront. Lookups include soft-deleted rows, so a
// deleted product/category still yields its slug tags.
//
// Tag contract (the storefront tags its cached fetches the same way, see ukcshop src/lib/cache-tags.ts):
//   product-slug:{slug}   one product's page (with its reviews)
//   category-slug:{slug}  one category page's product listing
//   brand-slug:{slug}     one brand page
//   products              cross-catalogue product lists: deals, new arrivals, rails, search suggestions
//   categories            the category tree, and everything that shows category names (all category
//                         pages, product breadcrumbs)
//   brands                the brand list, and everything that shows brand names
//   homepage / menus / settings / faqs / testimonials / cms-page-slug:{slug}

type Db = PrismaService;

export const target = (...tags: string[]): RevalidationTarget => ({ tags });

/** A product's page, its category (and parent categories') listings, its brand page and cross-catalogue lists. */
export async function productTarget(prisma: Db, productIds: (number | null | undefined)[]): Promise<RevalidationTarget> {
  const ids = [...new Set(productIds.filter((id): id is number => Number.isInteger(id) && (id as number) > 0))];
  const tags: string[] = [CacheTags.products, CacheTags.homepage];
  if (!ids.length) return { tags };
  const products = await prisma.product.findMany({ where: { id: { in: ids } }, select: { id: true, slug: true, categoryId: true, brand: { select: { slug: true } } } });
  for (const product of products) {
    tags.push(CacheTags.product(product.id), CacheTags.productSlug(product.slug));
    if (product.brand) tags.push(CacheTags.brandSlug(product.brand.slug));
    tags.push(...(await categoryChainSlugs(prisma, product.categoryId)).map(CacheTags.categorySlug));
  }
  return { tags };
}

/** The category and its ancestors: a parent category page lists its sub-categories' products. */
async function categoryChainSlugs(prisma: Db, categoryId: number | null): Promise<string[]> {
  const slugs: string[] = [];
  for (let id = categoryId, depth = 0; id && depth < 10; depth += 1) {
    const category = await prisma.category.findUnique({ where: { id }, select: { slug: true, parentId: true } });
    if (!category) break;
    slugs.push(category.slug);
    id = category.parentId;
  }
  return slugs;
}

/** Category names and structure show in menus, the homepage, every category page and product breadcrumbs. */
export async function categoryTarget(prisma: Db, categoryIds: (number | null | undefined)[]): Promise<RevalidationTarget> {
  const ids = categoryIds.filter((id): id is number => Number.isInteger(id) && (id as number) > 0);
  const categories = ids.length ? await prisma.category.findMany({ where: { id: { in: ids } }, select: { id: true, slug: true } }) : [];
  return { tags: [CacheTags.categories, CacheTags.menus, CacheTags.homepage, CacheTags.products, ...categories.flatMap((c) => [CacheTags.category(c.id), CacheTags.categorySlug(c.slug)])] };
}

/** Brand names show on brand pages, product pages, listings and the homepage brand grid. */
export async function brandTarget(prisma: Db, brandIds: (number | null | undefined)[]): Promise<RevalidationTarget> {
  const ids = brandIds.filter((id): id is number => Number.isInteger(id) && (id as number) > 0);
  const brands = ids.length ? await prisma.brand.findMany({ where: { id: { in: ids } }, select: { id: true, slug: true } }) : [];
  return { tags: [CacheTags.brands, CacheTags.products, CacheTags.categories, CacheTags.homepage, ...brands.flatMap((b) => [CacheTags.brand(b.id), CacheTags.brandSlug(b.slug)])] };
}

export async function pageTarget(prisma: Db, pageIds: (number | null | undefined)[]): Promise<RevalidationTarget> {
  const ids = pageIds.filter((id): id is number => Number.isInteger(id) && (id as number) > 0);
  const pages = ids.length ? await prisma.page.findMany({ where: { id: { in: ids } }, select: { slug: true } }) : [];
  return { tags: pages.map((page) => CacheTags.cmsPageSlug(page.slug)) };
}

/** A moderated review changes its product's page, ratings in listings and the homepage review score. */
export async function reviewTarget(prisma: Db, reviewId: number): Promise<RevalidationTarget> {
  const review = await prisma.review.findUnique({ where: { id: reviewId }, select: { productId: true } });
  return productTarget(prisma, [review?.productId]);
}

/** An image belongs to its owner, so uploading, editing or deleting it changes the owner's pages. */
export async function mediaTarget(prisma: Db, media: { ownerType?: unknown; ownerId?: unknown } | null | undefined): Promise<RevalidationTarget> {
  const ownerId = Number(media?.ownerId);
  if (!media || !Number.isInteger(ownerId) || ownerId <= 0) return { tags: [] };
  switch (media.ownerType) {
    case 'PRODUCT': return productTarget(prisma, [ownerId]);
    case 'PRODUCT_VARIANT': {
      const variant = await prisma.productVariant.findUnique({ where: { id: ownerId }, select: { productId: true } });
      return productTarget(prisma, [variant?.productId]);
    }
    case 'CATEGORY': return categoryTarget(prisma, [ownerId]);
    case 'BRAND': return brandTarget(prisma, [ownerId]);
    case 'PAGE': return pageTarget(prisma, [ownerId]);
    case 'REVIEW': return reviewTarget(prisma, ownerId);
    case 'HERO_SLIDE': case 'BANNER': return target(CacheTags.homepage);
    case 'TESTIMONIAL': return target(CacheTags.testimonials, CacheTags.homepage);
    default: return { tags: [] };
  }
}
