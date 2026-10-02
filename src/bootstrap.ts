import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { mkdirSync } from 'fs';
import { resolve } from 'path';

export const mediaUploadDirectory = resolve(
  process.env.MEDIA_UPLOAD_DIR ?? resolve(process.cwd(), 'uploads'),
);

// Persistent storage buckets under mediaUploadDirectory, kept outside the
// project root (via MEDIA_UPLOAD_DIR) so deploys/rollbacks never touch them.
export const mediaBuckets = {
  productOriginals: 'products/originals',
  productThumbnails: 'products/thumbnails',
  productOptimized: 'products/optimized',
  categories: 'categories',
  brands: 'brands',
  logos: 'logos',
  misc: 'misc',
  temporary: 'temporary',
} as const;

// Uploads saved by MediaService carry a random 32-hex name and are never overwritten, so their content
// can't change: browsers and the storefront image optimiser may keep them for a year. Any other file
// (copied into the storage folder by hand or a script) could be replaced in place, so it is revalidated.
export function uploadCacheControl(path: string): string {
  return /[0-9a-f]{32}[^/]*$/.test(path) ? 'public, max-age=31536000, immutable' : 'public, max-age=0, must-revalidate';
}

const DEFAULT_STOREFRONT_ORIGINS = ['http://localhost:3000', 'http://localhost:3001'];

function storefrontOrigins(): string[] {
  const configured = process.env.STOREFRONT_ORIGIN;
  return configured ? configured.split(',').map((origin) => origin.trim()).filter(Boolean) : DEFAULT_STOREFRONT_ORIGINS;
}

export function configureApp(app: INestApplication): void {
  for (const bucket of Object.values(mediaBuckets)) mkdirSync(resolve(mediaUploadDirectory, bucket), { recursive: true });
  const staticApp = app as INestApplication & {
    useStaticAssets?: (path: string, options?: { prefix?: string; setHeaders?: (res: { setHeader(name: string, value: string): void }, path: string) => void }) => void;
  };
  // Served from MEDIA_UPLOAD_DIR (the storage folder outside the project) at /uploads/*.
  staticApp.useStaticAssets?.(mediaUploadDirectory, { prefix: '/uploads/', setHeaders: (res, path) => res.setHeader('Cache-Control', uploadCacheControl(path)) });
  app.enableCors({ origin: storefrontOrigins(), credentials: true });
  // When the API is private behind the storefront, every request arrives from the storefront server.
  // TRUST_PROXY_HOPS (usually 1) makes req.ip - and so the per-IP rate limit - use the client address
  // it forwards in X-Forwarded-For. Leave unset if the API is reachable directly: the header is spoofable.
  const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS ?? 0);
  if (trustProxyHops > 0) app.getHttpAdapter().getInstance().set('trust proxy', trustProxyHops);
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.useGlobalFilters(new HttpExceptionFilter());
}
