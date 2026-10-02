import { AdminNewsletterService } from './newsletter.service';

describe('AdminNewsletterService campaigns', () => {
  it('sends only to active subscribers and includes one-click unsubscribe headers', async () => {
    const subscribers = [
      { email: 'one@example.com', unsubscribeToken: 'token-one' },
      { email: 'two@example.com', unsubscribeToken: 'token-two' },
    ];
    const prisma = { newsletterSubscriber: { findMany: jest.fn().mockResolvedValue(subscribers) } };
    const email = { send: jest.fn().mockResolvedValue(true) };
    const service = new AdminNewsletterService(prisma as never, email as never);

    const result = await service.sendCampaign({ subject: 'Deals', preheader: 'New offers', heading: 'Weekly offers', message: 'Text' });

    expect(prisma.newsletterSubscriber.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { unsubscribedAt: null } }));
    expect(result).toEqual({ recipients: 2, sent: 2, failed: 0 });
    expect(email.send).toHaveBeenCalledTimes(2);
    expect(email.send.mock.calls[0][4]).toMatchObject({ 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' });
    expect(email.send.mock.calls[0][3]).toBeUndefined();
  });

  it('reports SMTP failures without aborting the rest of a campaign', async () => {
    const subscribers = Array.from({ length: 12 }, (_, index) => ({ email: `user${index}@example.com`, unsubscribeToken: `token-${index}` }));
    const prisma = { newsletterSubscriber: { findMany: jest.fn().mockResolvedValue(subscribers) } };
    const email = { send: jest.fn().mockResolvedValueOnce(false).mockResolvedValue(true) };
    const service = new AdminNewsletterService(prisma as never, email as never);

    const result = await service.sendCampaign({ subject: 'Deals', preheader: 'New offers', heading: 'Weekly offers', message: 'Text' });

    expect(result).toEqual({ recipients: 12, sent: 11, failed: 1 });
  });
});