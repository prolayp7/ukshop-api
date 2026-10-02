import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { EmailService } from '../../src/modules/email/email.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { loginAsSuperAdmin } from './helpers/admin-auth';
import { createTestApp } from './setup';

describe('Newsletter campaign and unsubscribe (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let sendSpy: jest.SpyInstance;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    token = await loginAsSuperAdmin(app);
  });

  beforeEach(() => {
    sendSpy = jest.spyOn(app.get(EmailService), 'send').mockResolvedValue(true);
  });

  afterEach(() => sendSpy.mockRestore());
  afterAll(async () => app.close());

  it('requires a confirmation GET, supports one-click POST, and excludes unsubscribed addresses from campaigns', async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const activeBefore = await prisma.newsletterSubscriber.count({ where: { unsubscribedAt: null } });
    const active = await prisma.newsletterSubscriber.create({ data: { email: `campaign-active-${stamp}@example.com` } });
    const departing = await prisma.newsletterSubscriber.create({ data: { email: `campaign-unsub-${stamp}@example.com` } });
    sendSpy.mockClear();

    const confirmation = await request(app.getHttpServer())
      .get(`/api/v1/newsletter/unsubscribe?token=${departing.unsubscribeToken}`)
      .expect(200);
    expect(confirmation.text).toContain('Confirm unsubscribe');
    expect((await prisma.newsletterSubscriber.findUniqueOrThrow({ where: { id: departing.id } })).unsubscribedAt).toBeNull();

    await request(app.getHttpServer())
      .post('/api/v1/newsletter/unsubscribe')
      .send({ token: departing.unsubscribeToken })
      .expect(200);
    expect((await prisma.newsletterSubscriber.findUniqueOrThrow({ where: { id: departing.id } })).unsubscribedAt).toBeInstanceOf(Date);

    const sent = await request(app.getHttpServer())
      .post('/api/v1/admin/newsletter-subscribers/campaign')
      .set('Authorization', `Bearer ${token}`)
      .send({ subject: 'A real update', preheader: 'New stock is in', heading: 'This week at UK Shop', message: 'New items are available.' })
      .expect(201);

    expect(sent.body.data).toEqual({ recipients: activeBefore + 1, sent: activeBefore + 1, failed: 0 });
    expect(sendSpy).toHaveBeenCalledTimes(activeBefore + 1);
    expect(sendSpy.mock.calls.some((call) => call[0] === active.email)).toBe(true);
    expect(sendSpy.mock.calls.some((call) => call[0] === departing.email)).toBe(false);
    expect(sendSpy.mock.calls.find((call) => call[0] === active.email)?.[4]).toMatchObject({ 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' });
  });
});