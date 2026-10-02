import { WishlistAlertService } from './wishlist-alert.service';

function setup(options: { stockQty: number; price: number; salePrice?: number | null; item: Record<string, unknown>; sent?: boolean }) {
  const variant = {
    id: 8, title: '1TB', price: 100, salePrice: null, stockQty: options.stockQty,
    product: { title: 'NVMe SSD', slug: 'nvme-ssd', dealEndsAt: null },
    ...(options.price ? { price: options.price } : {}),
    ...(options.salePrice !== undefined ? { salePrice: options.salePrice } : {}),
  };
  const prisma = {
    productVariant: { findUnique: jest.fn().mockResolvedValue(variant), findMany: jest.fn().mockResolvedValue([{ id: 8 }]) },
    wishlistItem: { findMany: jest.fn().mockResolvedValue([{ id: 4, wishlist: { user: { email: 'buyer@example.com' } }, ...options.item }]), update: jest.fn().mockResolvedValue({}) },
  };
  const email = { send: jest.fn().mockResolvedValue(options.sent ?? true) };
  return { prisma, email, service: new WishlistAlertService(prisma as never, email as never) };
}

describe('WishlistAlertService', () => {
  it('sends and marks a requested back-in-stock alert once', async () => {
    const { prisma, email, service } = setup({ stockQty: 5, price: 100, item: { notifyBackInStock: true, notifyPriceDrop: false, backInStockAlertSentAt: null, priceDropBaseline: null } });
    await service.checkVariant(8);
    expect(email.send).toHaveBeenCalledWith('buyer@example.com', expect.stringContaining('Back in stock'), expect.stringContaining('available again'));
    expect(prisma.wishlistItem.update).toHaveBeenCalledWith({ where: { id: 4 }, data: { backInStockAlertSentAt: expect.any(Date) } });
  });

  it('sends a price alert only below the saved baseline, then advances the baseline', async () => {
    const { prisma, email, service } = setup({ stockQty: 5, price: 80, item: { notifyBackInStock: false, notifyPriceDrop: true, backInStockAlertSentAt: null, priceDropBaseline: 100 } });
    await service.checkVariant(8);
    expect(email.send).toHaveBeenCalledWith('buyer@example.com', expect.stringContaining('Price drop'), expect.stringContaining('now'));
    expect(prisma.wishlistItem.update).toHaveBeenCalledWith({ where: { id: 4 }, data: { priceDropBaseline: 80 } });
  });

  it('does not advance alert state when email delivery fails', async () => {
    const { prisma, email, service } = setup({ stockQty: 5, price: 80, sent: false, item: { notifyBackInStock: false, notifyPriceDrop: true, backInStockAlertSentAt: null, priceDropBaseline: 100 } });
    await service.checkVariant(8);
    expect(email.send).toHaveBeenCalledTimes(1);
    expect(prisma.wishlistItem.update).not.toHaveBeenCalled();
  });
});