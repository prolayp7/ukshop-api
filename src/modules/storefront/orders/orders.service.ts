import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { buildPaginationMeta, paginationSkipTake } from '../../../common/pagination';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { CartService } from '../cart/cart.service';
import { StorefrontShippingService } from '../shipping/storefront-shipping.service';
import { StorefrontCouponsService } from '../coupons/coupons.service';
import { CheckoutDto } from './dto/checkout.dto';

const orderDetailInclude = {
  items: true,
  shippingMethod: { select: { id: true, title: true, carrier: true } },
  shipments: { include: { events: { orderBy: { occurredAt: 'desc' as const } } } },
  statusHistory: { orderBy: { createdAt: 'asc' as const } },
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cartService: CartService,
    private readonly shippingService: StorefrontShippingService,
    private readonly couponsService: StorefrontCouponsService,
  ) {}

  private async generateOrderNumber(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = `UK${Date.now().toString(36).toUpperCase()}${randomBytes(2).toString('hex').toUpperCase()}`;
      const exists = await this.prisma.order.findUnique({ where: { orderNumber: candidate }, select: { id: true } });
      if (!exists) return candidate;
    }
    throw new Error('Could not generate a unique order number');
  }

  private async findByUuid(uuid: string) {
    const order = await this.prisma.order.findFirst({ where: { uuid }, include: orderDetailInclude });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  async checkout(customerId: number | undefined, guestToken: string | undefined, dto: CheckoutDto) {
    const cart = await this.cartService.cartForCheckout(customerId, guestToken);
    const activeItems = cart?.items.filter((i) => !i.savedForLater) ?? [];
    if (!activeItems.length) throw new BadRequestException('Cart is empty');

    let email = dto.email;
    if (customerId) {
      const customer = await this.prisma.user.findUnique({ where: { id: customerId } });
      email = email ?? customer!.email;
    }
    if (!email) throw new BadRequestException('Email is required for guest checkout');

    const lines = activeItems.map((item) => {
      const variant = item.productVariant;
      if (item.quantity > variant.stockQty) {
        throw new BadRequestException(`"${variant.product.title}" only has ${variant.stockQty} in stock`);
      }
      const unitPrice = Number(variant.salePrice ?? variant.price);
      const vatRatePercent = Number(variant.product.taxRate?.ratePercent ?? 0);
      const subtotal = round2(unitPrice * item.quantity);
      const vatAmount = round2(subtotal * (vatRatePercent / 100));
      return {
        productId: variant.product.id,
        productVariantId: variant.id,
        titleSnapshot: variant.product.title,
        variantTitleSnapshot: variant.title,
        skuSnapshot: variant.barcode,
        quantity: item.quantity,
        unitPrice,
        vatRatePercent,
        vatAmount,
        subtotal,
        onSale: variant.salePrice !== null,
        weightKg: Number(variant.weightKg ?? 0) * item.quantity,
      };
    });

    const subtotal = round2(lines.reduce((sum, l) => sum + l.subtotal, 0));
    const vatTotal = round2(lines.reduce((sum, l) => sum + l.vatAmount, 0));
    const totalWeightKg = round2(lines.reduce((sum, l) => sum + l.weightKg, 0));

    const shippingQuote = await this.shippingService.rateFor(dto.shippingMethodId, totalWeightKg, subtotal);
    let shippingCharge = shippingQuote.rate;

    let discountTotal = 0;
    let couponLineAmount = 0;
    let couponResult: Awaited<ReturnType<StorefrontCouponsService['validate']>> | null = null;
    if (dto.couponCode) {
      couponResult = await this.couponsService.validate(
        dto.couponCode,
        lines.map((l) => ({ lineSubtotal: l.subtotal, onSale: l.onSale })),
        customerId,
      );
      if (couponResult.freeShipping) {
        couponLineAmount = shippingCharge;
        shippingCharge = 0;
      } else {
        discountTotal = couponResult.discountAmount;
        couponLineAmount = couponResult.discountAmount;
      }
    }

    const total = round2(subtotal - discountTotal + shippingCharge + vatTotal);
    const shipping = dto.shippingAddress;
    const billing = dto.billingAddress ?? dto.shippingAddress;
    const orderNumber = await this.generateOrderNumber();

    const created = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          orderNumber,
          userId: customerId,
          email,
          phone: dto.phone,
          status: 'AWAITING_PAYMENT',
          paymentStatus: 'PENDING',
          billingFullName: billing.fullName,
          billingCompanyName: billing.companyName,
          billingLine1: billing.line1,
          billingLine2: billing.line2,
          billingCity: billing.city,
          billingCounty: billing.county,
          billingPostcode: billing.postcode,
          billingCountry: billing.country ?? 'GB',
          billingPhone: billing.phone,
          shippingFullName: shipping.fullName,
          shippingCompanyName: shipping.companyName,
          shippingLine1: shipping.line1,
          shippingLine2: shipping.line2,
          shippingCity: shipping.city,
          shippingCounty: shipping.county,
          shippingPostcode: shipping.postcode,
          shippingCountry: shipping.country ?? 'GB',
          shippingPhone: shipping.phone,
          shippingMethodId: dto.shippingMethodId,
          subtotal,
          discountTotal,
          shippingCharge,
          vatTotal,
          total,
          couponCode: couponResult?.coupon.code,
          customerNote: dto.customerNote,
          items: {
            create: lines.map((l) => ({
              productId: l.productId,
              productVariantId: l.productVariantId,
              titleSnapshot: l.titleSnapshot,
              variantTitleSnapshot: l.variantTitleSnapshot,
              skuSnapshot: l.skuSnapshot,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              vatRatePercent: l.vatRatePercent,
              vatAmount: l.vatAmount,
              subtotal: l.subtotal,
            })),
          },
          statusHistory: { create: { toStatus: 'AWAITING_PAYMENT' } },
          ...(couponResult
            ? {
                couponLine: {
                  create: { couponId: couponResult.coupon.id, couponCode: couponResult.coupon.code, discountAmount: couponLineAmount },
                },
              }
            : {}),
        },
      });

      for (const item of activeItems) {
        await tx.productVariant.update({
          where: { id: item.productVariantId },
          data: { stockQty: { decrement: item.quantity } },
        });
      }
      if (couponResult) {
        await tx.coupon.update({ where: { id: couponResult.coupon.id }, data: { usageCount: { increment: 1 } } });
      }
      if (cart) {
        await tx.cartItem.deleteMany({ where: { cartId: cart.id, savedForLater: false } });
      }

      return order;
    });

    return this.findByUuid(created.uuid);
  }

  async list(customerId: number, query: PaginationQueryDto) {
    const page = query.page!;
    const perPage = query.perPage!;
    const where = { userId: customerId };
    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        ...paginationSkipTake(page, perPage),
        orderBy: { placedAt: 'desc' },
        include: { items: true },
      }),
      this.prisma.order.count({ where }),
    ]);
    return { items: orders, meta: buildPaginationMeta(page, perPage, total) };
  }

  async detail(customerId: number, uuid: string) {
    const order = await this.findByUuid(uuid);
    if (order.userId !== customerId) throw new NotFoundException('Order not found');
    return order;
  }
}
