import { LowStockAlertService } from './low-stock-alert.service';

function setup(variant: Record<string, unknown> | null) {
  const prisma = {
    productVariant: { findUnique: jest.fn().mockResolvedValue(variant), update: jest.fn().mockResolvedValue({}) },
    setting: { findUnique: jest.fn().mockResolvedValue({ value: { supportEmail: 'ops@ukshop.test' } }) },
  };
  const email = { send: jest.fn().mockResolvedValue(undefined) };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { prisma, email, service: new LowStockAlertService(prisma as any, email as any) };
}

const variant = (overrides: Record<string, unknown> = {}) => ({
  id: 7, title: '16GB', stockQty: 2, lowStockThreshold: 5, lowStockAlertSentAt: null,
  product: { title: 'DDR5 RAM', receiveLowStockAlert: true }, ...overrides,
});

describe('LowStockAlertService', () => {
  it('emails once when stock dips to the threshold and marks the variant', async () => {
    const { prisma, email, service } = setup(variant());
    await service.checkAndNotify(7);
    expect(email.send).toHaveBeenCalledWith('ops@ukshop.test', expect.any(String), expect.any(String));
    expect(prisma.productVariant.update).toHaveBeenCalledWith({ where: { id: 7 }, data: { lowStockAlertSentAt: expect.any(Date) } });
  });

  it('stays silent while the same dip is already alerted', async () => {
    const { email, service } = setup(variant({ lowStockAlertSentAt: new Date() }));
    await service.checkAndNotify(7);
    expect(email.send).not.toHaveBeenCalled();
  });

  it('clears the marker after restocking so the next dip alerts again', async () => {
    const { prisma, email, service } = setup(variant({ stockQty: 20, lowStockAlertSentAt: new Date() }));
    await service.checkAndNotify(7);
    expect(email.send).not.toHaveBeenCalled();
    expect(prisma.productVariant.update).toHaveBeenCalledWith({ where: { id: 7 }, data: { lowStockAlertSentAt: null } });
  });

  it('does nothing for products that opted out of alerts', async () => {
    const { email, service } = setup(variant({ product: { title: 'DDR5 RAM', receiveLowStockAlert: false } }));
    await service.checkAndNotify(7);
    expect(email.send).not.toHaveBeenCalled();
  });

  it('never throws when the lookup fails', async () => {
    const { prisma, service } = setup(null);
    prisma.productVariant.findUnique.mockRejectedValue(new Error('db down'));
    await expect(service.checkAndNotify(7)).resolves.toBeUndefined();
  });
});
