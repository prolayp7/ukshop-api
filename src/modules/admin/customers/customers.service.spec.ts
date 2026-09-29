import { EmailService } from '../../email/email.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { CustomersService } from './customers.service';

describe('CustomersService.remove', () => {
  it('completes a pending deletion request and sends the final email', async () => {
    const customer = {
      id: 7,
      email: 'customer@example.com',
      firstName: 'Test',
      deletionRequests: [{ id: 12, requestedAt: new Date(), status: 'PENDING' }],
    };
    const transaction = {
      user: { update: jest.fn().mockResolvedValue(undefined) },
      customerRefreshToken: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      customerDeletionRequest: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const prisma = {
      user: { findFirst: jest.fn().mockResolvedValue(customer) },
      $transaction: jest.fn((callback: (tx: typeof transaction) => Promise<void>) => callback(transaction)),
    };
    const email = { send: jest.fn().mockResolvedValue(true) };
    const service = new CustomersService(prisma as unknown as PrismaService, email as unknown as EmailService);

    await service.remove(customer.id);

    expect(transaction.user.update).toHaveBeenCalledWith({ where: { id: customer.id }, data: { deletedAt: expect.any(Date) } });
    expect(transaction.customerRefreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: customer.id, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(transaction.customerDeletionRequest.updateMany).toHaveBeenCalledWith({
      where: { id: 12, status: 'PENDING' },
      data: { status: 'COMPLETED', processedAt: expect.any(Date) },
    });
    expect(email.send).toHaveBeenCalledWith(customer.email, 'Your UK Shop account has been deleted', expect.any(String));
  });
});
