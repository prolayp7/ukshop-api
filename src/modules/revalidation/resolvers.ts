import { CacheTags } from './cache-tags';
import type { RevalidationResolver } from './revalidates.decorator';
import { brandTarget, categoryTarget, mediaTarget, pageTarget, productTarget, reviewTarget, target } from './targets';

// Which storefront cache each admin route clears. Route `:id` params are the resource id (for product
// sub-routes such as variants, stock and FAQs, the product id); a create returns the new row's id.
const num = (value: unknown) => (value === undefined || value === null || value === '' ? undefined : Number(value));
const resultId = (result: unknown) => (result && typeof result === 'object' && 'id' in result ? num((result as { id: unknown }).id) : undefined);

export const onProduct: RevalidationResolver = ({ params, result, prisma }) => productTarget(prisma, [num(params.id), resultId(result)]);
/** A bulk import can touch any product, category listing or brand page. */
export const onProductImport: RevalidationResolver = () => target(CacheTags.products, CacheTags.categories, CacheTags.brands, CacheTags.homepage);
export const onCategory: RevalidationResolver = ({ params, result, prisma }) => categoryTarget(prisma, [num(params.id), resultId(result)]);
export const onBrand: RevalidationResolver = ({ params, result, prisma }) => brandTarget(prisma, [num(params.id), resultId(result)]);
/** Attributes are the filters on every category page and the specifications on product pages. */
export const onProductAttributes: RevalidationResolver = () => target(CacheTags.categories, CacheTags.products, CacheTags.attributes);
export const onReview: RevalidationResolver = ({ params, prisma }) => reviewTarget(prisma, Number(params.id));
export const onPage: RevalidationResolver = ({ params, result, prisma }) => pageTarget(prisma, [num(params.id), resultId(result)]);
export const onMedia: RevalidationResolver = async ({ params, result, prisma }) =>
  mediaTarget(prisma, result ?? (params.id ? await prisma.media.findUnique({ where: { id: Number(params.id) }, select: { ownerType: true, ownerId: true } }) : null));
export const onHomepage: RevalidationResolver = () => target(CacheTags.homepage);
export const onMenus: RevalidationResolver = () => target(CacheTags.menus);
export const onSettings: RevalidationResolver = () => target(CacheTags.settings);
export const onFaqs: RevalidationResolver = () => target(CacheTags.faqs, CacheTags.homepage);
export const onTestimonials: RevalidationResolver = () => target(CacheTags.testimonials, CacheTags.homepage);
