import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { UpdateWishlistAlertsDto } from './dto/update-wishlist-alerts.dto';

const DEFAULT_SLUG = 'default';

const itemInclude = {
  items: {
    include: {
      productVariant: {
        include: { product: { select: { id: true, title: true, slug: true } } },
      },
    },
    orderBy: { createdAt: 'desc' as const },
  },
};

@Injectable()
export class WishlistService {
  constructor(private readonly prisma: PrismaService) {}

  private async getOrCreate(userId: number) {
    const existing = await this.prisma.wishlist.findUnique({
      where: { userId_slug: { userId, slug: DEFAULT_SLUG } },
      include: itemInclude,
    });
    if (existing) return existing;
    return this.prisma.wishlist.create({
      data: { userId, slug: DEFAULT_SLUG },
      include: itemInclude,
    });
  }

  async get(userId: number) {
    return this.getOrCreate(userId);
  }

  async addItem(userId: number, productVariantId: number) {
    const variant = await this.prisma.productVariant.findFirst({
      where: { id: productVariantId, deletedAt: null, status: 'ACTIVE' },
    });
    if (!variant) throw new NotFoundException('Product variant not found');

    const wishlist = await this.getOrCreate(userId);
    await this.prisma.wishlistItem.upsert({
      where: { wishlistId_productVariantId: { wishlistId: wishlist.id, productVariantId } },
      create: { wishlistId: wishlist.id, productVariantId },
      update: {},
    });
    return this.getOrCreate(userId);
  }

  async removeItem(userId: number, productVariantId: number) {
    const wishlist = await this.getOrCreate(userId);
    const result = await this.prisma.wishlistItem.deleteMany({ where: { wishlistId: wishlist.id, productVariantId } });
    if (!result.count) throw new NotFoundException('Item is not in the wishlist');
    return this.getOrCreate(userId);
  }

  async updateAlerts(userId: number, productVariantId: number, dto: UpdateWishlistAlertsDto) {
    const wishlist = await this.getOrCreate(userId);
    const item = await this.prisma.wishlistItem.findFirst({
      where: { wishlistId: wishlist.id, productVariantId },
      include: { productVariant: { include: { product: { select: { dealEndsAt: true } } } } },
    });
    if (!item) throw new NotFoundException('Product is not in the wishlist');
    const variant = item.productVariant;
    const currentPrice = variant.salePrice && (!variant.product.dealEndsAt || variant.product.dealEndsAt > new Date())
      ? variant.salePrice
      : variant.price;
    await this.prisma.wishlistItem.update({
      where: { id: item.id },
      data: {
        notifyBackInStock: dto.notifyBackInStock,
        backInStockAlertSentAt: dto.notifyBackInStock && variant.stockQty > 0 ? new Date() : null,
        notifyPriceDrop: dto.notifyPriceDrop,
        priceDropBaseline: dto.notifyPriceDrop ? currentPrice : null,
      },
    });
    return this.getOrCreate(userId);
  }
}
