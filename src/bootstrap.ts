import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { mkdirSync } from 'fs';
import { resolve } from 'path';

export const mediaUploadDirectory = resolve(
  process.env.MEDIA_UPLOAD_DIR ?? resolve(process.cwd(), 'uploads'),
);

export function configureApp(app: INestApplication): void {
  mkdirSync(mediaUploadDirectory, { recursive: true });
  const staticApp = app as INestApplication & {
    useStaticAssets?: (path: string, options?: { prefix?: string }) => void;
  };
  staticApp.useStaticAssets?.(mediaUploadDirectory, { prefix: '/uploads/' });
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
