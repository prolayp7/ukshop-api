import { INestApplication } from '@nestjs/common';
import { createHash } from 'crypto';
import * as request from 'supertest';
import { createTestApp } from './setup';
import { PrismaService } from '../../src/prisma/prisma.service';
import { EmailService } from '../../src/modules/email/email.service';
import { PaymentAttemptsService } from '../../src/modules/payments/payment-attempts.service';
import { loginAsSuperAdmin } from './helpers/admin-auth';
import { registerCustomer } from './helpers/customer-auth';
import { createReturn, inspectReturn } from './helpers/returns';

// Resilience (checkout/status-update/refund/notification all succeeding with
// no SMTP configured) is already proven implicitly: every other e2e spec in
// this suite exercises those flows against the real, unconfigured EmailService
// and none of them fail. This file verifies the trigger wiring itself - that
// the right email fires, with the right recipient/content, at the right point
// - by spying on the live EmailService instance instead of mocking SMTP.

describe('Transactional email triggers (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let sendSpy: jest.SpyInstance;
  let adminToken: string;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    adminToken = await loginAsSuperAdmin(app);
  });

  beforeEach(() => {
    sendSpy = jest.spyOn(app.get(EmailService), 'send').mockResolvedValue(true);
  });

  afterEach(() => {
    sendSpy.mockRestore();
  });

  afterAll(async () => {
    await app.close();
  });

  async function placeOrder() {
    const list = await request(app.getHttpServer()).get('/api/v1/products?perPage=1').expect(200);
    const detail = await request(app.getHttpServer()).get(`/api/v1/products/${list.body.data[0].slug}`).expect(200);
    const variantId = detail.body.data.variants[0].id;
    await prisma.productVariant.update({ where: { id: variantId }, data: { stockQty: 20 } });
    const method = await prisma.shippingMethod.findFirst({ where: { status: 'ACTIVE' } });

    const email = `email-trigger-${Date.now()}-${Math.random()}@example.com`;
    const { accessToken: customerToken } = await registerCustomer(app, { email, password: 'SuperSecret123!', firstName: 'Trig', lastName: 'Ger' });

    await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ productVariantId: variantId, quantity: 1 })
      .expect(201);

    sendSpy.mockClear(); // isolate the checkout call itself from setup noise

    const orderRes = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ shippingAddress: { fullName: 'Trig Ger', line1: '1 Trigger Ave', city: 'Leeds', postcode: 'LS1 1AA' }, shippingMethodId: method!.id })
      .expect(201);

    return { email, orderUuid: orderRes.body.data.uuid as string, customerToken };
  }

  it('sends customer confirmation and a new-order alert after payment capture', async () => {
    const { email, orderUuid } = await placeOrder();
    const order = await prisma.order.findUniqueOrThrow({ where: { uuid: orderUuid } });
    const attempt = await prisma.paymentAttempt.create({ data: {
      orderId: order.id, provider: 'STRIPE', idempotencyKey: `email-paid-${Date.now()}-${Math.random()}`,
      amount: order.total, currency: 'GBP', status: 'PROCESSING',
    } });

    sendSpy.mockClear();
    await app.get(PaymentAttemptsService).finalizeCapture(attempt.id, {
      captured: true,
      providerTransactionId: `email-payment-${order.uuid}`,
      paidAmount: Number(order.total).toFixed(2),
      paidCurrency: 'GBP',
    });

    expect(sendSpy).toHaveBeenCalledTimes(2);
    const customerMail = sendSpy.mock.calls.find((call) => call[0] === email);
    expect(customerMail?.[1]).toMatch(/^Order confirmed/);
    expect(customerMail?.[2]).toContain('getting it ready');
    expect(sendSpy.mock.calls.some((call) => String(call[1]).startsWith('New paid order'))).toBe(true);
  });

  it('sends a shipped email (with tracking) when admin marks the order SHIPPED', async () => {
    const { email, orderUuid } = await placeOrder();
    const order = await prisma.order.findUniqueOrThrow({ where: { uuid: orderUuid } });

    sendSpy.mockClear();
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/orders/${order.id}/tracking`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ trackingCarrier: 'DHL', trackingNumber: 'DHL999' })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/orders/${order.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ toStatus: 'PROCESSING' })
      .expect(200);
    sendSpy.mockClear();
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/orders/${order.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ toStatus: 'SHIPPED' })
      .expect(200);

    expect(sendSpy).toHaveBeenCalledTimes(1);
    const [to, subject, html] = sendSpy.mock.calls[0];
    expect(to).toBe(email);
    expect(subject).toMatch(/^Your order has shipped/);
    expect(html).toContain('DHL999');
  });

  it('sends a payment reminder with an expiring link that can resume an unpaid order', async () => {
    const { email, orderUuid } = await placeOrder();
    const order = await prisma.order.findUniqueOrThrow({ where: { uuid: orderUuid }, include: { items: true } });
    sendSpy.mockClear();

    const response = await request(app.getHttpServer())
      .post('/api/v1/admin/orders/' + order.id + '/payment-reminder')
      .set('Authorization', 'Bearer ' + adminToken)
      .expect(201);

    expect(response.body.data.sentTo).toBe(email);
    expect(sendSpy).toHaveBeenCalledTimes(1);
    const sentMail = sendSpy.mock.calls[0];
    expect(sentMail[0]).toBe(email);
    expect(sentMail[1]).toBe('Payment reminder - ' + order.orderNumber);
    expect(sentMail[2]).toContain(order.orderNumber);
    expect(sentMail[2]).toContain(order.items[0].titleSnapshot);

    const token = /paymentReminder=([A-Za-z0-9_-]{43})/.exec(sentMail[2])?.[1];
    expect(token).toBeDefined();
    const link = await prisma.paymentReminderLink.findUniqueOrThrow({
      where: { tokenHash: createHash('sha256').update(token!).digest('hex') },
    });
    expect(link.tokenHash).not.toBe(token);
    expect(link.expiresAt.getTime()).toBeGreaterThan(Date.now());

    const resumed = await request(app.getHttpServer())
      .get('/api/v1/payments/reminder-links/' + token)
      .expect(200);
    expect(resumed.headers['cache-control']).toContain('no-store');
    expect(resumed.body.data.email).toBe(email);
    expect(resumed.body.data.orderNumber).toBe(order.orderNumber);
    expect(resumed.body.data.items).toHaveLength(order.items.length);
  });

  it('rejects an expired payment reminder link', async () => {
    const { orderUuid } = await placeOrder();
    const order = await prisma.order.findUniqueOrThrow({ where: { uuid: orderUuid } });
    sendSpy.mockClear();
    const response = await request(app.getHttpServer())
      .post('/api/v1/admin/orders/' + order.id + '/payment-reminder')
      .set('Authorization', 'Bearer ' + adminToken)
      .expect(201);
    const token = /paymentReminder=([A-Za-z0-9_-]{43})/.exec(sendSpy.mock.calls[0][2])?.[1];
    expect(token).toBeDefined();
    const link = await prisma.paymentReminderLink.findUniqueOrThrow({
      where: { tokenHash: createHash('sha256').update(token!).digest('hex') },
    });
    await prisma.paymentReminderLink.update({
      where: { id: link.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    await request(app.getHttpServer())
      .get('/api/v1/payments/reminder-links/' + token)
      .expect(404);
    expect(response.body.data.sentTo).toBe(order.email);
  });

  it('rejects reminders for orders that are already paid', async () => {
    const { orderUuid } = await placeOrder();
    const order = await prisma.order.findUniqueOrThrow({ where: { uuid: orderUuid } });
    await prisma.order.update({ where: { id: order.id }, data: { paymentStatus: 'PAID' } });

    await request(app.getHttpServer())
      .post('/api/v1/admin/orders/' + order.id + '/payment-reminder')
      .set('Authorization', 'Bearer ' + adminToken)
      .expect(409);
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it('revokes a reminder token when the email cannot be sent', async () => {
    const { orderUuid } = await placeOrder();
    const order = await prisma.order.findUniqueOrThrow({ where: { uuid: orderUuid } });
    sendSpy.mockClear();
    sendSpy.mockResolvedValue(false);

    await request(app.getHttpServer())
      .post('/api/v1/admin/orders/' + order.id + '/payment-reminder')
      .set('Authorization', 'Bearer ' + adminToken)
      .expect(503);

    const reminder = await prisma.paymentReminderLink.findFirstOrThrow({ where: { orderId: order.id } });
    expect(reminder.revokedAt).not.toBeNull();
  });

  it('sends a delivered email when admin marks the order DELIVERED', async () => {
    const { email, orderUuid } = await placeOrder();
    const order = await prisma.order.findUniqueOrThrow({ where: { uuid: orderUuid } });
    for (const toStatus of ['PROCESSING', 'PACKED', 'SHIPPED']) {
      await request(app.getHttpServer())
        .patch(`/api/v1/admin/orders/${order.id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ toStatus })
        .expect(200);
    }

    sendSpy.mockClear();
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/orders/${order.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ toStatus: 'DELIVERED' })
      .expect(200);

    expect(sendSpy).toHaveBeenCalledTimes(1);
    const [to, subject] = sendSpy.mock.calls[0];
    expect(to).toBe(email);
    expect(subject).toMatch(/^Order delivered/);
  });

  it('sends dedicated return-approved and return-received emails', async () => {
    const { email, orderUuid } = await placeOrder();
    const order = await prisma.order.findUniqueOrThrow({ where: { uuid: orderUuid } });
    const ret = await createReturn(prisma, order.id);

    sendSpy.mockClear();
    await request(app.getHttpServer()).post(`/api/v1/admin/returns/${ret.returnId}/approve`).set('Authorization', `Bearer ${adminToken}`).send({ items: [{ returnItemId: ret.returnItemId, quantity: ret.quantity }] }).expect(201);
    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy.mock.calls[0][0]).toBe(email);
    expect(sendSpy.mock.calls[0][1]).toMatch(/^Return approved/);

    sendSpy.mockClear();
    await request(app.getHttpServer()).post(`/api/v1/admin/returns/${ret.returnId}/pickup`).set('Authorization', `Bearer ${adminToken}`).send({ courier: 'Evri', pickupDate: '2026-10-01', pickupWindow: '9am-1pm' }).expect(201);
    await request(app.getHttpServer()).post(`/api/v1/admin/returns/${ret.returnId}/picked-up`).set('Authorization', `Bearer ${adminToken}`).send({}).expect(201);
    await request(app.getHttpServer()).post(`/api/v1/admin/returns/${ret.returnId}/receive`).set('Authorization', `Bearer ${adminToken}`).send({ items: [{ returnItemId: ret.returnItemId, quantity: ret.quantity }] }).expect(201);
    expect(sendSpy.mock.calls.some((call) => call[1] === `Return received - ${ret.returnId}`)).toBe(false);
    expect(sendSpy.mock.calls.some((call) => String(call[1]).startsWith('Return received - RET-T'))).toBe(true);
  });

  it('sends a dedicated return-rejected email with the admin reason', async () => {
    const { email, orderUuid } = await placeOrder();
    const order = await prisma.order.findUniqueOrThrow({ where: { uuid: orderUuid } });
    const ret = await createReturn(prisma, order.id);

    sendSpy.mockClear();
    await request(app.getHttpServer())
      .post(`/api/v1/admin/returns/${ret.returnId}/reject`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Item was outside the return window.' })
      .expect(201);

    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy.mock.calls[0][0]).toBe(email);
    expect(sendSpy.mock.calls[0][1]).toMatch(/^Return update - RET-T/);
    expect(sendSpy.mock.calls[0][2]).toContain('outside the return window');
  });

  it('sends a refund email once a return is refunded', async () => {
    const { email, orderUuid } = await placeOrder();
    const order = await prisma.order.findUniqueOrThrow({ where: { uuid: orderUuid }, include: { items: true } });

    await prisma.paymentTransaction.create({
      data: { orderId: order.id, provider: 'MANUAL', providerTransactionId: `email_test_${orderUuid}`, amount: order.total, status: 'CAPTURED' },
    });
    const ret = await createReturn(prisma, order.id);
    await inspectReturn(app, adminToken, ret);

    sendSpy.mockClear();
    await request(app.getHttpServer())
      .post(`/api/v1/admin/returns/${ret.returnId}/refund`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);

    expect(sendSpy).toHaveBeenCalledTimes(1);
    const [to, subject] = sendSpy.mock.calls[0];
    expect(to).toBe(email);
    expect(subject).toMatch(/^(Full|Partial) refund processed/);
  });

  it('emails the customer when an admin sends them a notification, and skips email for broadcast notifications', async () => {
    const { email } = await placeOrder();
    const customer = await prisma.user.findFirstOrThrow({ where: { email } });

    sendSpy.mockClear();
    await request(app.getHttpServer())
      .post('/api/v1/admin/notifications')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: customer.id, type: 'MARKETING', title: 'Sale this weekend', message: '20% off everything' })
      .expect(201);

    expect(sendSpy).toHaveBeenCalledTimes(1);
    const [to, subject] = sendSpy.mock.calls[0];
    expect(to).toBe(email);
    expect(subject).toBe('Sale this weekend');

    sendSpy.mockClear();
    await request(app.getHttpServer())
      .post('/api/v1/admin/notifications')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ type: 'SYSTEM', title: 'Broadcast', message: 'No specific customer' })
      .expect(201);
    expect(sendSpy).not.toHaveBeenCalled();
  });
});
