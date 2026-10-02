import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { formatMoney } from '../../common/currency';
import { EmailService } from './email.service';
import { wishlistBackInStockEmail, wishlistPriceDropEmail } from './email-templates';

@Injectable()
export class WishlistAlertService {
  private readonly logger = new Logger(WishlistAlertService.name);

  constructor(private readonly prisma: PrismaService, private readonly email: EmailService) {}

  async checkProduct(productId: number): Promise<void> {
    try {
      const variants = await this.prisma.productVariant.findMany({
        where: { productId, deletedAt: null, status: 'ACTIVE' },
        select: { id: true },
      });
      for (const variant of variants) void this.checkVariant(variant.id);
    } catch (error) {
      this.logger.warn(`Wishlist price alert check failed for product ${productId}: ${(error as Error).message}`);
    }
  }

  async checkVariant(variantId: number): Promise<void> {
    try {
      const variant = await this.prisma.productVariant.findUnique({
        where: { id: variantId },
        select: {
          id: true, title: true, price: true, salePrice: true, stockQty: true,
          product: { select: { title: true, slug: true, dealEndsAt: true } },
        },
      });
      if (!variant) return;
      const currentPrice = variant.salePrice !== null && (!variant.product.dealEndsAt || variant.product.dealEndsAt > new Date())
        ? Number(variant.salePrice)
        : Number(variant.price);
      const items = await this.prisma.wishlistItem.findMany({
        where: { productVariantId: variantId, OR: [{ notifyBackInStock: true }, { notifyPriceDrop: true }] },
        include: { wishlist: { include: { user: { select: { email: true } } } } },
      });

      for (const item of items) {
        const email = item.wishlist.user.email;
        if (item.notifyBackInStock) {
          if (variant.stockQty <= 0) {
            if (item.backInStockAlertSentAt) await this.prisma.wishlistItem.update({ where: { id: item.id }, data: { backInStockAlertSentAt: null } });
          } else if (!item.backInStockAlertSentAt) {
            const message = wishlistBackInStockEmail({ productTitle: variant.product.title, variantTitle: variant.title, slug: variant.product.slug });
            if (await this.email.send(email, message.subject, message.html)) {
              await this.prisma.wishlistItem.update({ where: { id: item.id }, data: { backInStockAlertSentAt: new Date() } });
            }
          }
        }

        if (item.notifyPriceDrop) {
          const baseline = item.priceDropBaseline === null ? currentPrice : Number(item.priceDropBaseline);
          if (currentPrice < baseline) {
            const message = wishlistPriceDropEmail({
              productTitle: variant.product.title,
              variantTitle: variant.title,
              slug: variant.product.slug,
              previousPrice: formatMoney(baseline),
              currentPrice: formatMoney(currentPrice),
            });
            if (await this.email.send(email, message.subject, message.html)) {
              await this.prisma.wishlistItem.update({ where: { id: item.id }, data: { priceDropBaseline: currentPrice } });
            }
          }
        }
      }
    } catch (error) {
      this.logger.warn(`Wishlist alert check failed for variant ${variantId}: ${(error as Error).message}`);
    }
  }
}