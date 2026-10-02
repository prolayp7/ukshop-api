import { mediaTarget, productTarget } from './targets';

// Minimal in-memory stand-in for the Prisma calls the resolvers make.
const categories: Record<number, { slug: string; parentId: number | null }> = { 1: { slug: 'computers', parentId: null }, 2: { slug: 'gaming-pcs', parentId: 1 } };
const prisma = {
  product: { findMany: async ({ where }: { where: { id: { in: number[] } } }) => where.id.in.filter((id) => id === 7).map((id) => ({ id, slug: 'rog-strix', categoryId: 2, brand: { slug: 'asus' } })) },
  category: { findUnique: async ({ where }: { where: { id: number } }) => categories[where.id] ?? null },
  productVariant: { findUnique: async ({ where }: { where: { id: number } }) => (where.id === 70 ? { productId: 7 } : null) },
} as never;

describe('revalidation targets', () => {
  it('clears a product page, its category chain, brand page and cross-catalogue lists', async () => {
    const { tags } = await productTarget(prisma, [7, undefined, 7]);
    expect(tags).toEqual(['products', 'homepage', 'product:7', 'product-slug:rog-strix', 'brand-slug:asus', 'category-slug:gaming-pcs', 'category-slug:computers']);
  });

  it('still clears the lists when the product id is unknown', async () => {
    expect((await productTarget(prisma, [999])).tags).toEqual(['products', 'homepage']);
  });

  it('maps an image to its owner', async () => {
    expect((await mediaTarget(prisma, { ownerType: 'PRODUCT_VARIANT', ownerId: 70 })).tags).toContain('product-slug:rog-strix');
    expect((await mediaTarget(prisma, { ownerType: 'HERO_SLIDE', ownerId: 3 })).tags).toEqual(['homepage']);
    expect((await mediaTarget(prisma, { ownerType: 'LIBRARY', ownerId: 3 })).tags).toEqual([]);
    expect((await mediaTarget(prisma, null)).tags).toEqual([]);
  });
});
