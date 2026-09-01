import { ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePaymentAttemptDto, PaymentProvider, paymentProviders } from './dto/create-payment-attempt.dto';

const payableOrderStatuses = ['PENDING', 'AWAITING_PAYMENT', 'FAILED'] as const;
type OrderRow = { id: number; uuid: string; total: Prisma.Decimal; payment_status: string; status: string };
type AttemptRow = {
  id: number; uuid: string; order_id: number; provider: PaymentProvider; status: string; amount: Prisma.Decimal;
  currency: string; redirect_url: string | null; failure_code: string | null; failure_message: string | null;
  retryable: boolean; expires_at: Date | null;
};

@Injectable()
export class PaymentAttemptsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreatePaymentAttemptDto, idempotencyKey: string) {
    const configured = await this.prisma.setting.count({
      where: { key: `integration.payment.${dto.provider === 'TWOCHECKOUT' ? '2checkout' : dto.provider.toLowerCase()}` },
    });
    if (!configured) throw new ServiceUnavailableException(`${dto.provider} payments are not configured`);
    const [order] = await this.prisma.$queryRaw<OrderRow[]>`
      SELECT id, uuid, total, payment_status, status::text
      FROM orders WHERE uuid = ${dto.orderUuid} AND lower(email) = lower(${dto.email}) LIMIT 1
    `;
    if (!order) throw new NotFoundException('Order not found');
    if (['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(order.payment_status)) {
      throw new ConflictException('This order has already been paid');
    }
    if (!payableOrderStatuses.includes(order.status as typeof payableOrderStatuses[number])) {
      throw new ConflictException(`Order cannot be paid while it is ${order.status}`);
    }

    const [existing] = await this.findByIdempotency(dto.provider, idempotencyKey);
    if (existing) {
      if (existing.order_id !== order.id) throw new ConflictException('Idempotency key was already used for another order');
      return this.present(existing, order.uuid);
    }

    const attempt = await this.prisma.$transaction(async (tx) => {
      const inserted = await tx.$queryRaw<AttemptRow[]>`
        INSERT INTO payment_attempts (uuid, order_id, provider, idempotency_key, amount, currency, updated_at)
        VALUES (${randomUUID()}, ${order.id}, CAST(${dto.provider} AS "PaymentProvider"), ${idempotencyKey}, ${order.total}, 'GBP', NOW())
        ON CONFLICT (provider, idempotency_key) DO NOTHING
        RETURNING id, uuid, order_id, provider::text, status::text, amount, currency, redirect_url,
                  failure_code, failure_message, retryable, expires_at
      `;
      if (inserted[0]) {
        await tx.$executeRaw`
          INSERT INTO payment_state_history (payment_attempt_id, to_status, source, reason)
          VALUES (${inserted[0].id}, 'CREATED', 'CUSTOMER_API', 'Payment attempt created')
        `;
        return inserted[0];
      }
      const raced = await tx.$queryRaw<AttemptRow[]>`
        SELECT id, uuid, order_id, provider::text, status::text, amount, currency, redirect_url,
               failure_code, failure_message, retryable, expires_at
        FROM payment_attempts
        WHERE provider = CAST(${dto.provider} AS "PaymentProvider") AND idempotency_key = ${idempotencyKey}
      `;
      if (!raced[0] || raced[0].order_id !== order.id) throw new ConflictException('Idempotency key was already used');
      return raced[0];
    });
    return this.present(attempt, order.uuid);
  }

  async status(uuid: string, email: string) {
    const [attempt] = await this.prisma.$queryRaw<(AttemptRow & { order_uuid: string })[]>`
      SELECT pa.id, pa.uuid, pa.order_id, pa.provider::text, pa.status::text, pa.amount, pa.currency,
             pa.redirect_url, pa.failure_code, pa.failure_message, pa.retryable, pa.expires_at, o.uuid AS order_uuid
      FROM payment_attempts pa JOIN orders o ON o.id = pa.order_id
      WHERE pa.uuid = ${uuid} AND lower(o.email) = lower(${email}) LIMIT 1
    `;
    if (!attempt) throw new NotFoundException('Payment attempt not found');
    return this.present(attempt, attempt.order_uuid);
  }

  async methods() {
    const configured = await this.prisma.setting.findMany({
      where: { key: { in: ['integration.payment.stripe', 'integration.payment.paypal', 'integration.payment.2checkout'] } },
      select: { key: true },
    });
    const keys = new Set(configured.map((item) => item.key));
    return paymentProviders.map((provider) => ({
      provider,
      enabled: keys.has(`integration.payment.${provider === 'TWOCHECKOUT' ? '2checkout' : provider.toLowerCase()}`),
    }));
  }

  private findByIdempotency(provider: PaymentProvider, idempotencyKey: string) {
    return this.prisma.$queryRaw<AttemptRow[]>`
      SELECT id, uuid, order_id, provider::text, status::text, amount, currency, redirect_url,
             failure_code, failure_message, retryable, expires_at
      FROM payment_attempts
      WHERE provider = CAST(${provider} AS "PaymentProvider") AND idempotency_key = ${idempotencyKey}
    `;
  }

  private present(attempt: AttemptRow, orderUuid: string) {
    return {
      attemptId: attempt.uuid,
      orderUuid,
      provider: attempt.provider,
      status: attempt.status,
      amount: attempt.amount,
      currency: attempt.currency,
      redirectUrl: attempt.redirect_url,
      error: attempt.failure_code ? { code: attempt.failure_code, message: attempt.failure_message, retryable: attempt.retryable } : null,
      expiresAt: attempt.expires_at,
    };
  }
}
