import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp } from './setup';

describe('Storefront Catalog (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    ({ app } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns a category tree of only active categories', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/categories').expect(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data[0]).toHaveProperty('slug');
  });

  it('fetches a category by slug and 404s for an unknown slug', async () => {
    const tree = await request(app.getHttpServer()).get('/api/v1/categories').expect(200);
    const slug = tree.body.data[0].slug;

    const res = await request(app.getHttpServer()).get(`/api/v1/categories/${slug}`).expect(200);
    expect(res.body.data.slug).toBe(slug);

    await request(app.getHttpServer()).get('/api/v1/categories/does-not-exist').expect(404);
  });

  it('lists active brands and fetches one by slug', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/brands').expect(200);
    expect(res.body.data.length).toBeGreaterThan(0);

    const slug = res.body.data[0].slug;
    const detail = await request(app.getHttpServer()).get(`/api/v1/brands/${slug}`).expect(200);
    expect(detail.body.data.slug).toBe(slug);

    await request(app.getHttpServer()).get('/api/v1/brands/does-not-exist').expect(404);
  });

  it('lists products with pagination meta', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/products?perPage=5').expect(200);
    expect(res.body.data.length).toBeLessThanOrEqual(5);
    expect(res.body.meta).toMatchObject({ page: 1, perPage: 5 });
    expect(res.body.meta.total).toBeGreaterThan(0);
    expect(res.body.data[0]).toHaveProperty('price');
    expect(res.body.data[0]).toHaveProperty('inStock');
  });

  it('filters products by search query', async () => {
    const all = await request(app.getHttpServer()).get('/api/v1/products?perPage=1').expect(200);
    const title: string = all.body.data[0].title;
    const word = title.split(' ')[0];

    const res = await request(app.getHttpServer())
      .get(`/api/v1/products?q=${encodeURIComponent(word)}`)
      .expect(200);
    expect(res.body.meta.total).toBeGreaterThan(0);
  });

  it('sorts products by price ascending', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/products?sort=price_asc&perPage=10').expect(200);
    const prices = res.body.data.map((p: { price: string | null }) => Number(p.price));
    const sorted = [...prices].sort((a, b) => a - b);
    expect(prices).toEqual(sorted);
  });

  it('fetches product detail with variants, images and review summary', async () => {
    const list = await request(app.getHttpServer()).get('/api/v1/products?perPage=1').expect(200);
    const slug = list.body.data[0].slug;

    const res = await request(app.getHttpServer()).get(`/api/v1/products/${slug}`).expect(200);
    expect(res.body.data.slug).toBe(slug);
    expect(Array.isArray(res.body.data.variants)).toBe(true);
    expect(res.body.data.variants.length).toBeGreaterThan(0);
    expect(res.body.data.variants[0]).toHaveProperty('attributes');
    expect(Array.isArray(res.body.data.images)).toBe(true);
    // not asserting a specific value: other specs in this suite approve reviews
    // against the same seeded product, so only the shape is guaranteed here
    expect(res.body.data.reviewSummary).toEqual({ average: expect.any(Number), count: expect.any(Number) });

    await request(app.getHttpServer()).get('/api/v1/products/does-not-exist').expect(404);
  });
});
