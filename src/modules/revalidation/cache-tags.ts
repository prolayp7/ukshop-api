// Storefront cache tags. Must stay in step with ukcshop src/lib/cache-tags.ts: the storefront tags its
// cached fetches with these, and only accepts these for revalidation.
export const CacheTags = {
  /** Homepage sections, hero slides and badges, banners and featured rails. */
  homepage: 'homepage',
  /** Settings > General, footer, top bar and account-creation page content. */
  settings: 'settings',
  /** Header mega menu and footer menu. */
  menus: 'menus',
  /** The category tree and category listings. */
  categories: 'categories',
  category: (id: number) => `category:${id}`,
  categorySlug: (slug: string) => `category-slug:${slug}`,
  /** Product listings (category pages, search, deals, rails). */
  products: 'products',
  /** Product detail specifications depend on the product attribute schema. */
  attributes: 'attributes',
  product: (id: number) => `product:${id}`,
  productSlug: (slug: string) => `product-slug:${slug}`,
  brands: 'brands',
  brand: (id: number) => `brand:${id}`,
  brandSlug: (slug: string) => `brand-slug:${slug}`,
  cmsPageSlug: (slug: string) => `cms-page-slug:${slug}`,
  faqs: 'faqs',
  testimonials: 'testimonials',
} as const;
