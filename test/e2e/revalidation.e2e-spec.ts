import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp } from './setup';
import { PrismaService } from '../../src/prisma/prisma.service';
import { loginAsSuperAdmin } from './helpers/admin-auth';
import { RevalidationService } from '../../src/modules/revalidation/revalidation.service';

// Admin changes tell the storefront which cached data to clear, only after they succeed.
describe('Storefront cache revalidation on admin changes (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let revalidate: jest.SpyInstance;

  const tagsOfLastCall = () => (revalidate.mock.calls.at(-1)?.[0] as { tags: string[] }).tags;
  // The interceptor fires revalidation after the response is produced; let that settle.
  const settle = () => new Promise((resolve) => setImmediate(resolve));

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    token = await loginAsSuperAdmin(app);
    revalidate = jest.spyOn(app.get(RevalidationService), 'revalidate').mockResolvedValue(true);
  });
  beforeEach(() => revalidate.mockClear());
  afterAll(async () => {
    revalidate.mockRestore();
    await app.close();
  });

  it('a product edit clears that product, its category chain, its brand page and the product lists', async () => {
    const product = await prisma.product.findFirstOrThrow({ where: { deletedAt: null, brandId: { not: null } }, include: { category: true, brand: true } });
    await request(app.getHttpServer()).patch(`/api/v1/admin/products/${product.id}`).set('Authorization', `Bearer ${token}`).send({ title: product.title }).expect(200);
    await settle();
    expect(revalidate).toHaveBeenCalledTimes(1);
    expect(tagsOfLastCall()).toEqual(expect.arrayContaining(['products', 'homepage', `product:${product.id}`, `product-slug:${product.slug}`, `category-slug:${product.category.slug}`, `brand-slug:${product.brand!.slug}`]));
  });

  it('a failed change clears nothing', async () => {
    await request(app.getHttpServer()).patch('/api/v1/admin/products/999999999').set('Authorization', `Bearer ${token}`).send({ title: 'Nope' }).expect(404);
    await settle();
    expect(revalidate).not.toHaveBeenCalled();
  });

  it('a settings save clears the settings tag, a homepage section save the homepage tag', async () => {
    const row = await prisma.setting.findUnique({ where: { key: 'topbar.site' } });
    await request(app.getHttpServer()).put('/api/v1/admin/settings/topbar.site').set('Authorization', `Bearer ${token}`).send({ value: row?.value ?? {} }).expect(200);
    await settle();
    expect(tagsOfLastCall()).toEqual(['settings']);

    const section = await prisma.homepageSection.findFirstOrThrow();
    await request(app.getHttpServer()).patch(`/api/v1/admin/homepage-sections/${section.id}`).set('Authorization', `Bearer ${token}`).send({ isVisible: section.isVisible }).expect(200);
    await settle();
    expect(tagsOfLastCall()).toEqual(['homepage']);
  });

  it('reading admin data clears nothing', async () => {
    await request(app.getHttpServer()).get('/api/v1/admin/products?page=1&perPage=1').set('Authorization', `Bearer ${token}`).expect(200);
    await settle();
    expect(revalidate).not.toHaveBeenCalled();
  });
});
