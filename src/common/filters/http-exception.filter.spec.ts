import { ArgumentsHost, Logger } from '@nestjs/common';
import { NotFoundException } from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;
  let mockResponse: any;
  let mockHost: any;
  let loggerError: jest.SpyInstance;

  beforeEach(() => {
    filter = new HttpExceptionFilter();
    loggerError = jest.spyOn(Logger.prototype, 'error').mockImplementation();

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    mockHost = {
      switchToHttp: jest.fn().mockReturnValue({
        getResponse: jest.fn().mockReturnValue(mockResponse),
        getRequest: jest.fn().mockReturnValue({ method: 'PATCH', path: '/api/v1/admin/products/620' }),
      }),
    } as unknown as ArgumentsHost;
  });

  afterEach(() => {
    loggerError.mockRestore();
  });

  it('should handle non-HttpException errors with 500 and error envelope', () => {
    const error = new Error('boom');

    filter.catch(error, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(500);
    expect(mockResponse.json).toHaveBeenCalledWith({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
    expect(loggerError).toHaveBeenCalledWith(
      'PATCH /api/v1/admin/products/620 failed with an unhandled exception: boom',
      error.stack,
    );
  });

  it('should handle HttpException (NotFoundException) with correct status and envelope', () => {
    const exception = new NotFoundException('thing not found');

    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(404);
    expect(mockResponse.json).toHaveBeenCalledWith({
      error: { code: 'NOT_FOUND', message: 'thing not found', details: undefined },
    });
  });
});
