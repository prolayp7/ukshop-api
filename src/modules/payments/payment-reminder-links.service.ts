import { createHash, randomBytes } from 'crypto';
import { ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { paymentReminderEmail, STOREFRONT_URL } from '../email/email-templates';

const payableStatuses = ['PENDING', 'AWAITING_PAYMENT', 'FAILED'];
const unpaidPaymentStatuses = ['PENDING', 'FAILED'];
const linkLifetimeMs = 48 * 60 * 60 * 1000;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class PaymentReminderLinksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  async sendForOrder(orderId: number) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (!this.isPayable(order) || Number(order.total) <= 0) {
      throw new ConflictException('This order is not available for payment');
    }

    const token = randomBytes(32).toString('base64url');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + linkLifetimeMs);
    const link = await this.prisma.paymentReminderLink.create({
      data: { orderId, tokenHash: hashToken(token), expiresAt },
    });

    const paymentUrl = `${STOREFRONT_URL.replace(/\/$/, '')}/checkout?paymentReminder=${token}`;
    const email = paymentReminderEmail({
      orderNumber: order.orderNumber,
      placedAt: order.placedAt,
      items: order.items.map((item) => ({
        name: item.titleSnapshot,
        meta: `${item.variantTitleSnapshot} · Qty ${item.quantity}`,
        price: Number(item.subtotal),
      })),
      subtotal: Number(order.subtotal),
      discount: Number(order.discountTotal),
      shipping: Number(order.shippingCharge),
      vat: Number(order.vatTotal),
      total: Number(order.total),
      paymentUrl,
      expiresAt,
    });
    const sent = await this.emailService.send(order.email, email.subject, email.html);
    if (!sent) {
      await this.prisma.paymentReminderLink.update({
        where: { id: link.id },
        data: { revokedAt: new Date() },
      });
      throw new ServiceUnavailableException('The payment reminder email could not be sent');
    }

    return { sentTo: order.email, expiresAt };
  }

  async getOrder(token: string) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
      throw new NotFoundException('This payment link is invalid or expired');
    }
    const link = await this.prisma.paymentReminderLink.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { order: { include: { items: true, shippingMethod: true } } },
    });
    const now = new Date();
    if (!link || link.revokedAt || link.expiresAt <= now) {
      throw new NotFoundException('This payment link is invalid or expired');
    }

    const order = link.order;
    if (!this.isPayable(order) || Number(order.total) <= 0) {
      await this.prisma.paymentReminderLink.update({
        where: { id: link.id },
        data: { revokedAt: now },
      });
      throw new NotFoundException('This payment link is no longer available');
    }

    return {
      id: order.id,
      uuid: order.uuid,
      orderNumber: order.orderNumber,
      email: order.email,
      status: order.status,
      paymentStatus: order.paymentStatus,
      shippingFullName: order.shippingFullName,
      shippingLine1: order.shippingLine1,
      shippingLine2: order.shippingLine2,
      shippingCity: order.shippingCity,
      shippingPostcode: order.shippingPostcode,
      subtotal: order.subtotal,
      discountTotal: order.discountTotal,
      shippingCharge: order.shippingCharge,
      vatTotal: order.vatTotal,
      total: order.total,
      couponCode: order.couponCode,
      placedAt: order.placedAt,
      items: order.items,
      shippingMethod: order.shippingMethod
        ? { id: order.shippingMethod.id, title: order.shippingMethod.title, carrier: order.shippingMethod.carrier }
        : null,
    };
  }

  private isPayable(order: { status: string; paymentStatus: string }): boolean {
    return payableStatuses.includes(order.status) && unpaidPaymentStatuses.includes(order.paymentStatus);
  }
}
