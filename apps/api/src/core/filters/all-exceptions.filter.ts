import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';

/**
 * Catch-all exception filter.
 * Handles any unhandled exception that is NOT an HttpException.
 * Logs the full stack trace and returns a generic 500 in RFC 7807 format.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    // If it's an HttpException, format it as RFC 7807 (same as HttpExceptionFilter)
    if (exception instanceof HttpException) {
      const ctx = host.switchToHttp();
      const reply = ctx.getResponse<FastifyReply>();
      const request = ctx.getRequest<FastifyRequest>();
      const httpStatus = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      const detail =
        typeof exceptionResponse === 'string'
          ? exceptionResponse
          : (exceptionResponse as Record<string, unknown>).message ?? exception.message;

      reply
        .status(httpStatus)
        .header('content-type', 'application/problem+json')
        .send({
          type: `https://httpstatuses.com/${httpStatus}`,
          title: 'Error',
          status: httpStatus,
          detail,
          instance: request.url,
          timestamp: new Date().toISOString(),
        });
      return;
    }

    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();
    const status = HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof Error ? exception.message : 'Unknown error';
    const stack =
      exception instanceof Error ? exception.stack : undefined;

    this.logger.error(
      `Unhandled exception on ${request.method} ${request.url}: ${message}`,
      stack,
    );

    const problemDetails = {
      type: 'https://httpstatuses.com/500',
      title: 'Internal Server Error',
      status,
      detail: process.env.NODE_ENV === 'production'
        ? 'An unexpected error occurred'
        : message,
      instance: request.url,
      timestamp: new Date().toISOString(),
    };

    reply
      .status(status)
      .header('content-type', 'application/problem+json')
      .send(problemDetails);
  }
}
