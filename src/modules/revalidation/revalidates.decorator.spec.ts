import { lastValueFrom, of, throwError } from 'rxjs';
import { RevalidateInterceptor, RevalidationResolver } from './revalidates.decorator';

describe('RevalidateInterceptor', () => {
  const revalidate = jest.fn().mockResolvedValue(true);
  const context = (params: Record<string, string>) => ({
    getHandler: () => function update() {}, getClass: () => class ProductsController {},
    switchToHttp: () => ({ getRequest: () => ({ params, body: {} }) }),
  }) as never;
  const interceptor = (resolver: RevalidationResolver | undefined) =>
    new RevalidateInterceptor({ get: () => resolver } as never, {} as never, { revalidate } as never);

  beforeEach(() => revalidate.mockClear());

  it('revalidates the tags from before and after the change (old and new slug)', async () => {
    let slug = 'old-name';
    const resolver: RevalidationResolver = () => ({ tags: [`product-slug:${slug}`] });
    const result = await lastValueFrom(interceptor(resolver).intercept(context({ id: '7' }), { handle: () => { slug = 'new-name'; return of({ id: 7 }); } }));
    expect(result).toEqual({ id: 7 });
    expect(revalidate).toHaveBeenCalledWith({ tags: ['product-slug:old-name', 'product-slug:new-name'], paths: [] }, 'ProductsController.update id=7');
  });

  it('revalidates nothing when the change fails', async () => {
    await expect(lastValueFrom(interceptor(() => ({ tags: ['homepage'] })).intercept(context({}), { handle: () => throwError(() => new Error('rolled back')) }))).rejects.toThrow('rolled back');
    expect(revalidate).not.toHaveBeenCalled();
  });

  it('never fails the request when working out the tags fails', async () => {
    const result = await lastValueFrom(interceptor(() => { throw new Error('db down'); }).intercept(context({}), { handle: () => of('saved') }));
    expect(result).toBe('saved');
    expect(revalidate).toHaveBeenCalledWith({ tags: [], paths: [] }, 'ProductsController.update');
  });

  it('passes straight through routes without a resolver', async () => {
    expect(await lastValueFrom(interceptor(undefined).intercept(context({}), { handle: () => of('ok') }))).toBe('ok');
    expect(revalidate).not.toHaveBeenCalled();
  });
});
