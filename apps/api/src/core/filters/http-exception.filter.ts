import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';

/**
 * RFC 7807 Problem Details for HTTP APIs.
 * Catches all HttpException instances and formats them as
 * application/problem+json.
 */
@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: HttpException, host: ArgumentsHost): void {
    // Filter global roda também no consumer RabbitMQ (contexto não-HTTP): sem
    // reply HTTP, re-lança a exceção ORIGINAL para o errorHandler do transporte
    // (golevelup) tratar retry/DLQ — senão `reply.status()` num reply inexistente
    // mascara a causa e engole a falha (a mensagem seria ACKada e perdida).
    if (host.getType() !== 'http') {
      this.logger.warn(
        `HttpException fora de contexto HTTP (${host.getType()}): ${exception.message}`,
      );
      throw exception;
    }

    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();

    const detail =
      typeof exceptionResponse === 'string'
        ? exceptionResponse
        : (exceptionResponse as Record<string, unknown>).message ?? exception.message;

    // Preserva os campos EXTRAS do payload de uma HttpException-objeto (ex.: `count`
    // no 409 de "excluir coluna com cards") — `statusCode`/`error`/`message` já viram
    // status/title/detail e não são reespalhados.
    const extra =
      typeof exceptionResponse === 'object' && exceptionResponse !== null
        ? Object.fromEntries(
            Object.entries(exceptionResponse as Record<string, unknown>).filter(
              ([k]) => !['statusCode', 'error', 'message'].includes(k),
            ),
          )
        : {};

    const problemDetails = {
      type: `https://httpstatuses.com/${status}`,
      title: this.getTitle(status),
      status,
      detail,
      // Espelha `detail` como `message` para clientes que leem `body.message`
      // (o ApiError do web); `detail` permanece para consumidores RFC 7807.
      message: detail,
      ...extra,
      instance: request.url,
      timestamp: new Date().toISOString(),
    };

    this.logger.warn(
      `HTTP ${status} ${request.method} ${request.url}: ${
        typeof detail === 'string' ? detail : JSON.stringify(detail)
      }`,
    );

    reply.status(status).header('content-type', 'application/problem+json').send(problemDetails);
  }

  private getTitle(status: number): string {
    const titles: Record<number, string> = {
      400: 'Bad Request',
      401: 'Unauthorized',
      403: 'Forbidden',
      404: 'Not Found',
      409: 'Conflict',
      422: 'Unprocessable Entity',
      429: 'Too Many Requests',
      500: 'Internal Server Error',
    };
    return titles[status] ?? 'Error';
  }
}
