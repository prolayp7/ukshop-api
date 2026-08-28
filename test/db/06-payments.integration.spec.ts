import { PrismaService } from '../../src/prisma/prisma.service';

describe('Payments', () => {
  const prisma = new PrismaService();
  let orderId: number;
  let transactionId: number;

  beforeAll(async () => {
    const order = await prisma.order.create({
      data: {
        orderNumber: 'TESTPAY00001',
        email: 'test-payments@example.com',
        billingFullName: 'Pay Tester',
        billingLine1: '1 Test Street',
        billingCity: 'London',
        billingPostcode: 'SW1A 1AA',
        shippingFullName: 'Pay Tester',
        shippingLine1: '1 Test Street',
        shippingCity: 'London',
        shippingPostcode: 'SW1A 1AA',
        subtotal: 50,
        total: 50,
      },
    });
    orderId = order.id;
  });

  afterAll(async () => {
    await prisma.paymentDispute.deleteMany({ where: { orderId } });
    await prisma.paymentRefund.deleteMany({ where: { orderId } });
    if (transactionId) await prisma.paymentTransaction.delete({ where: { id: transactionId } });
    await prisma.paymentWebhookLog.deleteMany({ where: { provider: 'test-provider' } });
    if (orderId) await prisma.order.delete({ where: { id: orderId } });
    await prisma.$disconnect();
  });

  it('creates a payment transaction with a refund and a dispute', async () => {
    const transaction = await prisma.paymentTransaction.create({
      data: {
        orderId,
        provider: 'stripe',
        providerTransactionId: 'pi_test_12345',
        amount: 50,
        status: 'CAPTURED',
      },
    });
    transactionId = transaction.id;
    expect(transaction.uuid).toBeDefined();

    const refund = await prisma.paymentRefund.create({
      data: { transactionId, orderId, amount: 10, status: 'PROCESSED' },
    });
    expect(refund.amount.toString()).toBe('10');

    const dispute = await prisma.paymentDispute.create({
      data: {
        transactionId,
        orderId,
        providerDisputeId: 'dp_test_12345',
        amount: 50,
        status: 'NEEDS_RESPONSE',
      },
    });
    expect(dispute.status).toBe('NEEDS_RESPONSE');

    await prisma.paymentWebhookLog.create({
      data: { provider: 'test-provider', eventType: 'payment_intent.succeeded', payload: { id: 'pi_test_12345' } },
    });
    const logs = await prisma.paymentWebhookLog.findMany({ where: { provider: 'test-provider' } });
    expect(logs).toHaveLength(1);
  });

  it('rejects a duplicate providerTransactionId (unique constraint)', async () => {
    await expect(
      prisma.paymentTransaction.create({
        data: { orderId, provider: 'stripe', providerTransactionId: 'pi_test_12345', amount: 50, status: 'CAPTURED' },
      }),
    ).rejects.toThrow();
  });
});
