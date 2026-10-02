import { RETRY_DELAYS_MS, RevalidationService } from './revalidation.service';

describe('RevalidationService', () => {
  const service = new RevalidationService();
  const fetchMock = jest.fn();
  const env = { ...process.env };

  beforeEach(() => {
    global.fetch = fetchMock as unknown as typeof fetch;
    fetchMock.mockReset();
    process.env.REVALIDATION_SECRET = 'test-secret';
    process.env.STOREFRONT_URL = 'http://storefront.test';
    delete process.env.REVALIDATION_URL;
    jest.useFakeTimers();
  });
  afterEach(() => { jest.useRealTimers(); process.env = { ...env }; });

  it('posts the tags and paths with the secret', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    await expect(service.revalidate({ tags: ['homepage', 'homepage'], paths: ['/'] }, 'test')).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://storefront.test/api/revalidate');
    expect(init.headers.Authorization).toBe('Bearer test-secret');
    expect(JSON.parse(init.body)).toEqual({ tags: ['homepage'], paths: ['/'] });
  });

  it('retries a failure and succeeds on a later attempt', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED')).mockResolvedValueOnce({ ok: false, status: 503 }).mockResolvedValueOnce({ ok: true, status: 200 });
    const result = service.revalidate({ tags: ['products'] }, 'test');
    await jest.advanceTimersByTimeAsync(RETRY_DELAYS_MS.reduce((a, b) => a + b, 0));
    await expect(result).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('gives up after the last attempt without throwing', async () => {
    fetchMock.mockRejectedValue(new Error('down'));
    const result = service.revalidate({ tags: ['products'] }, 'test');
    await jest.advanceTimersByTimeAsync(60_000);
    await expect(result).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(RETRY_DELAYS_MS.length + 1);
  });

  it('does not retry a rejected request (4xx)', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401 });
    await expect(service.revalidate({ tags: ['homepage'] }, 'test')).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('skips quietly when no secret is configured', async () => {
    delete process.env.REVALIDATION_SECRET;
    await expect(service.revalidate({ tags: ['homepage'] }, 'test')).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
