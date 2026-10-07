import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp } from './setup';
import { registerCustomer } from './helpers/customer-auth';

describe('Storefront Wishlist (e2e)', () => {
  let app: INestApplication;
  let accessToken: string;
  let variantId: number;

  beforeAll(async () => {
    ({ app } = await createTestApp());

    const email = `wishlist-${Date.now()}@example.com`;
    ({ accessToken } = await registerCustomer(app, { email, password: 'SuperSecret123!', firstName: 'Wish', lastName: 'List' }));

    const list = await request(app.getHttpServer()).get('/api/v1/products?perPage=1').expect(200);
    const detail = await request(app.getHttpServer()).get(`/api/v1/products/${list.body.data[0].slug}`).expect(200);
    variantId = detail.body.data.variants[0].id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects requests without a token', async () => {
    await request(app.getHttpServer()).get('/api/v1/wishlist').expect(401);
  });

  it('handles concurrent first reads for a new wishlist', async () => {
    const email = `wishlist-concurrent-${Date.now()}@example.com`;
    const { accessToken: concurrentToken } = await registerCustomer(app, { email, password: 'SuperSecret123!', firstName: 'Wish', lastName: 'List' });
    const responses = await Promise.all(Array.from({ length: 5 }, () =>
      request(app.getHttpServer()).get('/api/v1/wishlist').set('Authorization', `Bearer ${concurrentToken}`),
    ));

    for (const response of responses) {
      expect(response.status).toBe(200);
      expect(response.body.data.items).toHaveLength(0);
    }
  });

  it('starts empty, adds, dedupes, and removes an item', async () => {
    const auth = (req: request.Test) => req.set('Authorization', `Bearer ${accessToken}`);

    const empty = await auth(request(app.getHttpServer()).get('/api/v1/wishlist')).expect(200);
    expect(empty.body.data.items).toHaveLength(0);

    const added = await auth(request(app.getHttpServer()).post('/api/v1/wishlist/items'))
      .send({ productVariantId: variantId })
      .expect(201);
    expect(added.body.data.items).toHaveLength(1);

    const addedAgain = await auth(request(app.getHttpServer()).post('/api/v1/wishlist/items'))
      .send({ productVariantId: variantId })
      .expect(201);
    expect(addedAgain.body.data.items).toHaveLength(1); // unique constraint dedupes

    const removed = await auth(request(app.getHttpServer()).delete(`/api/v1/wishlist/items/${variantId}`)).expect(200);
    expect(removed.body.data.items).toHaveLength(0);

    await auth(request(app.getHttpServer()).delete(`/api/v1/wishlist/items/${variantId}`)).expect(404);
  });
});
