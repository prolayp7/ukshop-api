import { Prisma } from '@prisma/client';
import { RefundSettlementService } from './refund-settlement.service';
import { buildCreditNotePdf } from './credit-note-pdf';

describe('buildCreditNotePdf', () => {
  it('creates a PDF with the credit note number and refund amount', async () => {
    const pdf = await buildCreditNotePdf({
      currency: 'GBP',
      creditNoteNumber: 'CN-000123',
      orderNumber: 'UK-1050',
      refundNumber: 'REF-9001',
      issuedAt: new Date('2026-10-03T12:00:00Z'),
      customerEmail: 'customer@example.com',
      company: {
        name: 'RigForge',
        legalName: 'RigForge Ltd',
        address: '1 Market Street, London EC1A 1AA',
        vatNumber: 'GB123456789',
        email: 'billing@rigforge.example',
        phone: '+44 20 7946 0958',
        copyright: '© 2026 RigForge Ltd',
      },
      billing: {
        name: 'A Customer',
        company: null,
        address: '12 Example Street\nLeeds\nLS1 1AA',
      },
      amount: 42.5,
      reason: 'Returned item refund',
    });

    expect(pdf.length).toBeGreaterThan(200);
    expect(pdf.toString('utf8', 0, 32)).toContain('%PDF');
    expect(pdf.toString('utf8')).toContain('CN-000123');
  });

  it('adds a credit-note PDF attachment when a processed refund is emailed', async () => {
    const amount = new Prisma.Decimal('42.50');
    const refund = {
      id: 42,
      transactionId: 9,
      orderId: 7,
      amount,
      status: 'PENDING',
      reason: 'Damaged item',
      returnRequestId: 15,
      order: {
        id: 7,
        orderNumber: 'UK-1050',
        email: 'customer@example.com',
        billingFullName: 'A Customer',
        billingCompanyName: null,
        billingLine1: '12 Example Street',
        billingLine2: 'Leeds',
        billingCity: 'Leeds',
        billingPostcode: 'LS1 1AA',
      },
      transaction: { amount: new Prisma.Decimal('80.00'), currency: 'GBP' },
      returnRequest: { returnNumber: 'RET-4401' },
    };
    const tx = {
      paymentRefund: {
        update: jest.fn().mockResolvedValue(undefined),
        count: jest.fn().mockResolvedValue(0),
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: new Prisma.Decimal('42.50') } }),
      },
      paymentTransaction: { findUniqueOrThrow: jest.fn().mockResolvedValue({ amount: new Prisma.Decimal('80.00') }) },
      order: { update: jest.fn().mockResolvedValue(undefined) },
    };
    const prisma = {
      paymentRefund: {
        findUnique: jest.fn().mockResolvedValue(refund),
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: new Prisma.Decimal('42.50') } }),
      },
      $transaction: jest.fn(async (cb: (client: typeof tx) => Promise<void>) => cb(tx)),
      setting: { findUnique: jest.fn().mockResolvedValue({ value: { companyAddress: '1 Market Street, London EC1A 1AA', vatNumber: 'GB123456789', supportEmail: 'billing@rigforge.example', supportPhone1: '+44 20 7946 0958', copyright: '© 2026 RigForge Ltd' } }) },
    };
    const core = { setStatus: jest.fn().mockResolvedValue(undefined), settleOrderStatus: jest.fn().mockResolvedValue(undefined) };
    const emailService = { send: jest.fn().mockResolvedValue(true) };
    const service = new RefundSettlementService(prisma as any, core as any, emailService as any);

    await service.settle(42, 'PROCESSED', { actor: { type: 'CUSTOMER', id: 99 }, providerRefundId: 'pay_123' });

    expect(emailService.send).toHaveBeenCalledWith(
      'customer@example.com',
      expect.stringContaining('refund'),
      expect.any(String),
      expect.arrayContaining([
        expect.objectContaining({ filename: expect.stringContaining('credit-note-'), contentType: 'application/pdf' }),
      ]),
    );
  });
});
