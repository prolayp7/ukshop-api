import { uploadCacheControl } from './bootstrap';

describe('uploadCacheControl', () => {
  it('caches uploads with a random name for a year', () => {
    expect(uploadCacheControl('/srv/storage/logos/logo-63dea1e81c138e5e2a7266e58890dc01.webp')).toBe('public, max-age=31536000, immutable');
    expect(uploadCacheControl('/srv/storage/products/thumbnails/ab12cd34ef56ab12cd34ef56ab12cd34-thumb.webp')).toBe('public, max-age=31536000, immutable');
  });

  it('revalidates files that could be replaced in place', () => {
    expect(uploadCacheControl('/srv/storage/misc/banner.jpg')).toBe('public, max-age=0, must-revalidate');
    // A hex-named folder does not make the file inside it safe.
    expect(uploadCacheControl('/srv/storage/0123456789abcdef0123456789abcdef/banner.jpg')).toBe('public, max-age=0, must-revalidate');
  });
});
