import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import { EmailService } from '../../email/email.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { StorefrontAuthService } from './storefront-auth.service';

describe('StorefrontAuthService.register', () => {
  it('records a deletion request and acknowledges it without deleting the account', async () => {
    const user = { email: 'customer@example.com', firstName: 'Test' };
    const request = { id: 12, status: 'PENDING' as const, requestedAt: new Date() };
    const prisma = {
      user: { findFirst: jest.fn().mockResolvedValue(user), update: jest.fn() },
      customerDeletionRequest: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(request),
      },
    };
    const email = { send: jest.fn().mockResolvedValue(true) };
    const service = new StorefrontAuthService(
      prisma as unknown as PrismaService,
      {} as JwtService,
      email as unknown as EmailService,
    );

    const result = await service.requestAccountDeletion(7);

    expect(result).toEqual({ request, alreadyRequested: false, emailSent: true });
    expect(email.send).toHaveBeenCalledWith(user.email, 'We received your account deletion request', expect.any(String));
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('includes the saved phone number in the verified customer response', async () => {
    const user = {
      id: 7,
      uuid: 'customer-uuid',
      email: 'customer@example.com',
      firstName: 'Test',
      lastName: 'Customer',
      phone: '07123456789',
      status: 'ACTIVE',
    };
    const prisma = {
      otpVerification: {
        findFirst: jest.fn().mockResolvedValue({ id: 1, expiresAt: new Date(Date.now() + 60_000) }),
        update: jest.fn().mockResolvedValue(undefined),
      },
      user: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findFirst: jest.fn().mockResolvedValue(user),
      },
      customerRefreshToken: { create: jest.fn().mockResolvedValue(undefined) },
    };
    const jwt = { signAsync: jest.fn().mockResolvedValue('access-token') };
    const service = new StorefrontAuthService(
      prisma as unknown as PrismaService,
      jwt as unknown as JwtService,
      {} as EmailService,
    );

    const result = await service.verifyOtp(user.email, 'email_verification', '123456');

    expect(result.customer?.phone).toBe(user.phone);
  });

  it('returns a conflict when the phone number is already registered', async () => {
    const prismaError = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target: ['phone'] },
    });
    const prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockRejectedValue(prismaError),
      },
      otpVerification: { create: jest.fn() },
    };
    const service = new StorefrontAuthService(
      prisma as unknown as PrismaService,
      {} as JwtService,
      {} as EmailService,
    );

    await expect(service.register({
      email: 'new-customer@example.com',
      password: 'StrongPassword123!',
      firstName: 'New',
      lastName: 'Customer',
      phone: '07123456789',
    })).rejects.toThrow(new ConflictException('An account with that phone number already exists'));
    expect(prisma.otpVerification.create).not.toHaveBeenCalled();
  });
});
