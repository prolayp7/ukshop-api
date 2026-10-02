import { createHmac } from 'crypto';
import { Prisma } from '@prisma/client';
import { PaymentWebhooksService } from './payment-webhooks.service';

describe('PaymentWebhooksService Stripe disputes', () => {
  it('stores a dispute once and notifies the configured operations inbox', async () => {
    const secret = 'whsec_test';
    const event = {
      id: 'evt_dispute_created',
      type: 'charge.dispute.created',
      data: { object: { id: 'dp_test', payment_intent: 'pi_test', amount: 1250, currency: 'gbp', status: 'needs_response', reason: 'fraudulent', evidence_details: { due_by: 1_800_000_000 } } },
    };
    const body = Buffer.from(JSON.stringify(event));
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createHmac('sha256', secret).update(`${timestamp}.${body.toString('utf8')}`).digest('hex');
    const prisma = {
      paymentWebhookLog: { create: jest.fn().mockResolvedValue({}), update: jest.fn().mockResolvedValue({}) },
      paymentTransaction: { findFirst: jest.fn().mockResolvedValue({ id: 4, orderId: 9, currency: 'GBP', order: { id: 9, orderNumber: 'UK100' } }) },
      paymentDispute: { upsert: jest.fn().mockResolvedValue({}) },
      setting: { findUnique: jest.fn().mockResolvedValue({ value: { supportEmail: 'ops@example.com' } }) },
    };
    const settings = { internalIntegration: jest.fn().mockResolvedValue({ settings: { webhookSecret: secret } }) };
    const email = { send: jest.fn().mockResolvedValue(true) };
    const service = new PaymentWebhooksService(prisma as never, settings as never, undefined as never, undefined as never, undefined as never, email as never);

    await expect(service.handleStripe(body, `t=${timestamp},v1=${signature}`)).resolves.toEqual({ received: true });

    expect(prisma.paymentDispute.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { providerDisputeId: 'dp_test' },
      create: expect.objectContaining({ orderId: 9, transactionId: 4, status: 'NEEDS_RESPONSE', reasonCode: 'fraudulent' }),
    }));
    expect(email.send).toHaveBeenCalledWith('ops@example.com', expect.stringContaining('Action required'), expect.stringContaining('dispute was opened'));
    expect(prisma.paymentWebhookLog.update).toHaveBeenCalledWith(expect.objectContaining({ data: { processedAt: expect.any(Date) } }));
  });

  it('does not reprocess or resend an already-recorded webhook event', async () => {
    const secret = 'whsec_test';
    const event = { id: 'evt_duplicate', type: 'charge.dispute.created', data: { object: { id: 'dp_dup', payment_intent: 'pi_dup' } } };
    const body = Buffer.from(JSON.stringify(event));
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createHmac('sha256', secret).update(`${timestamp}.${body.toString('utf8')}`).digest('hex');
    const duplicate = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' });
    const prisma = { paymentWebhookLog: { create: jest.fn().mockRejectedValue(duplicate) } };
    const settings = { internalIntegration: jest.fn().mockResolvedValue({ settings: { webhookSecret: secret } }) };
    const email = { send: jest.fn() };
    const service = new PaymentWebhooksService(prisma as never, settings as never, undefined as never, undefined as never, undefined as never, email as never);

    await expect(service.handleStripe(body, `t=${timestamp},v1=${signature}`)).resolves.toEqual({ received: true });
    expect(email.send).not.toHaveBeenCalled();
  });
});