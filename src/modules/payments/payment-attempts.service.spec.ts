import { ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PaymentAttemptsService } from './payment-attempts.service';

describe('PaymentAttemptsService', () => {
  const dto = { orderUuid: '846fcbd1-e7fc-4d6f-bde2-cadbc24355d5', email: 'buyer@example.com', provider: 'STRIPE' as const };

  it('rejects an unconfigured provider before creating an attempt', async () => {
    const prisma = { setting: { count: jest.fn().mockResolvedValue(0) } };
    const service = new PaymentAttemptsService(prisma as never);

    await expect(service.create(dto, 'checkout-session-0001')).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(prisma.setting.count).toHaveBeenCalledWith({ where: { key: 'integration.payment.stripe' } });
  });

  it('uses the server-side order total and records initial history', async () => {
    const total = new Prisma.Decimal('149.95');
    const attempt = {
      id: 91,
      uuid: 'a339dc4e-a2ec-4313-832f-97185679860b',
      order_id: 12,
      provider: 'STRIPE' as const,
      status: 'CREATED',
      amount: total,
      currency: 'GBP',
      redirect_url: null,
      failure_code: null,
      failure_message: null,
      retryable: false,
      expires_at: null,
    };
    const rootQuery = jest.fn()
      .mockResolvedValueOnce([{ id: 12, uuid: dto.orderUuid, total, payment_status: 'PENDING', status: 'AWAITING_PAYMENT' }])
      .mockResolvedValueOnce([]);
    const tx = { $queryRaw: jest.fn().mockResolvedValue([attempt]), $executeRaw: jest.fn().mockResolvedValue(1) };
    const prisma = {
      setting: { count: jest.fn().mockResolvedValue(1) },
      $queryRaw: rootQuery,
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const service = new PaymentAttemptsService(prisma as never);

    const result = await service.create(dto, 'checkout-session-0001');

    expect(result).toMatchObject({ attemptId: attempt.uuid, amount: total, currency: 'GBP', status: 'CREATED' });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });
});
