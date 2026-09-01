import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { buildPaginationMeta, paginationSkipTake } from '../../../../common/pagination';
import { ListStorefrontProductsQueryDto } from './dto/list-storefront-products-query.dto';

const listInclude = {
  category: { select: { id: true, title: true, slug: true } },
  brand: { select: { id: true, title: true, slug: true } },
  variants: {
    where: { deletedAt: null, status: 'ACTIVE' as const },
    select: { id: true, price: true, salePrice: true, stockQty: true, isDefault: true },
    orderBy: [{ isDefault: 'desc' as const }, { id: 'asc' as const }],
  },
};

type ListProduct = Prisma.ProductGetPayload<{ include: typeof listInclude }>;

function pricingOf(variants: ListProduct['variants']) {
  const primary = variants.find((v) => v.isDefault) ?? variants[0] ?? null;
  return {
    price: primary?.price ?? null,
    salePrice: primary?.salePrice ?? null,
    inStock: variants.some((v) => v.stockQty > 0),
  };
}

@Injectable()
export class StorefrontProductsService {
  constructor(private readonly prisma: PrismaService) {}

  private buildWhere(query: ListStorefrontProductsQueryDto): Prisma.ProductWhereInput {
    const conditions: Prisma.ProductWhereInput[] = [{ status: 'ACTIVE', deletedAt: null }];

    if (query.category) {
      conditions.push({
        OR: [
          { category: { slug: query.category } },
          { secondaryCategories: { some: { category: { slug: query.category } } } },
        ],
      });
    }
    if (query.brand) conditions.push({ brand: { slug: query.brand } });
    if (query.q) {
      conditions.push({
        OR: [
          { title: { contains: query.q, mode: 'insensitive' } },
          { shortDescription: { contains: query.q, mode: 'insensitive' } },
          { sku: { contains: query.q, mode: 'insensitive' } },
        ],
      });
    }
    if (query.priceMin !== undefined || query.priceMax !== undefined) {
      conditions.push({
        variants: {
          some: {
            deletedAt: null,
            status: 'ACTIVE',
            price: {
              ...(query.priceMin !== undefined ? { gte: query.priceMin } : {}),
              ...(query.priceMax !== undefined ? { lte: query.priceMax } : {}),
            },
          },
        },
      });
    }

    return { AND: conditions };
  }

  private async fetchProductsByIds(ids: number[]): Promise<ListProduct[]> {
    if (!ids.length) return [];
    const products = await this.prisma.product.findMany({ where: { id: { in: ids } }, include: listInclude });
    const byId = new Map(products.map((p) => [p.id, p]));
    return ids.map((id) => byId.get(id)!).filter(Boolean);
  }

  private async attachMedia(products: ListProduct[]) {
    const productIds = products.map((p) => p.id);
    const media = productIds.length
      ? await this.prisma.media.findMany({
          where: { ownerType: 'PRODUCT', ownerId: { in: productIds } },
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        })
      : [];
    const firstByProduct = new Map<number, (typeof media)[number]>();
    for (const item of media) {
      if (!firstByProduct.has(item.ownerId)) firstByProduct.set(item.ownerId, item);
    }
    return products.map((product) => {
      const { variants, ...rest } = product;
      return {
        ...rest,
        image: firstByProduct.get(product.id)?.url ?? null,
        ...pricingOf(variants),
      };
    });
  }

  async list(query: ListStorefrontProductsQueryDto) {
    const page = query.page!;
    const perPage = query.perPage!;
    const sort = query.sort ?? 'newest';
    const where = this.buildWhere(query);

    if (sort === 'price_asc' || sort === 'price_desc') {
      const variantWhere: Prisma.ProductVariantWhereInput = {
        isDefault: true,
        deletedAt: null,
        status: 'ACTIVE',
        product: where,
      };
      const [variantRows, total] = await Promise.all([
        this.prisma.productVariant.findMany({
          where: variantWhere,
          orderBy: { price: sort === 'price_asc' ? 'asc' : 'desc' },
          ...paginationSkipTake(page, perPage),
          select: { productId: true },
        }),
        this.prisma.productVariant.count({ where: variantWhere }),
      ]);
      const products = await this.fetchProductsByIds(variantRows.map((v) => v.productId));
      return { items: await this.attachMedia(products), meta: buildPaginationMeta(page, perPage, total) };
    }

    const orderBy: Prisma.ProductOrderByWithRelationInput =
      sort === 'name_asc' ? { title: 'asc' } : sort === 'name_desc' ? { title: 'desc' } : { createdAt: 'desc' };

    const [products, total] = await Promise.all([
      this.prisma.product.findMany({ where, orderBy, ...paginationSkipTake(page, perPage), include: listInclude }),
      this.prisma.product.count({ where }),
    ]);
    return { items: await this.attachMedia(products), meta: buildPaginationMeta(page, perPage, total) };
  }

  async bySlug(slug: string) {
    const product = await this.prisma.product.findFirst({
      where: { slug, status: 'ACTIVE', deletedAt: null },
      include: {
        category: { select: { id: true, title: true, slug: true } },
        brand: { select: { id: true, title: true, slug: true } },
        variants: {
          where: { deletedAt: null, status: 'ACTIVE' },
          include: { attributes: { include: { attribute: true, attributeValue: true } } },
          orderBy: [{ isDefault: 'desc' }, { id: 'asc' }],
        },
      },
    });
    if (!product) throw new NotFoundException('Product not found');

    const variantIds = product.variants.map((v) => v.id);
    const [productMedia, variantMedia, reviewAgg] = await Promise.all([
      this.prisma.media.findMany({
        where: { ownerType: 'PRODUCT', ownerId: product.id },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      }),
      variantIds.length
        ? this.prisma.media.findMany({
            where: { ownerType: 'PRODUCT_VARIANT', ownerId: { in: variantIds } },
            orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
          })
        : Promise.resolve([]),
      this.prisma.review.aggregate({
        where: { productId: product.id, status: 'APPROVED' },
        _avg: { rating: true },
        _count: { rating: true },
      }),
    ]);

    const variantMediaByVariant = new Map<number, typeof variantMedia>();
    for (const item of variantMedia) {
      const list = variantMediaByVariant.get(item.ownerId) ?? [];
      list.push(item);
      variantMediaByVariant.set(item.ownerId, list);
    }

    return {
      ...product,
      images: productMedia.map((m) => ({ url: m.url, altText: m.altText })),
      variants: product.variants.map((variant) => ({
        ...variant,
        images: (variantMediaByVariant.get(variant.id) ?? []).map((m) => ({ url: m.url, altText: m.altText })),
      })),
      ...pricingOf(product.variants),
      reviewSummary: {
        average: reviewAgg._avg.rating ?? 0,
        count: reviewAgg._count.rating,
      },
    };
  }
}
