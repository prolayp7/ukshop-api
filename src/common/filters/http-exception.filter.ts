import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from '@nestjs/common';
import { Response } from 'express';

const STATUS_CODE_MAP: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'UNPROCESSABLE',
  429: 'RATE_LIMITED',
  500: 'INTERNAL_ERROR',
};

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status = exception.getStatus();
    const body = exception.getResponse();

    let code = STATUS_CODE_MAP[status] ?? 'ERROR';
    let message = exception.message;
    let details: unknown;

    if (typeof body === 'object' && body !== null) {
      const record = body as Record<string, unknown>;
      if (Array.isArray(record.message)) {
        code = 'VALIDATION_ERROR';
        message = 'Validation failed';
        details = { errors: record.message };
      } else if (typeof record.message === 'string') {
        message = record.message;
      }
    }

    response.status(status).json({ error: { code, message, details } });
  }
}
