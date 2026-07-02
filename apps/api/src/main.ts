import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import fastifyCookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { join } from 'path';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './core/filters/http-exception.filter';
import { AllExceptionsFilter } from './core/filters/all-exceptions.filter';
import { RedisIoAdapter } from './realtime/redis-io.adapter';
import { REDIS_CLIENT } from './core/redis/redis.module';
import { DB, type Database } from './core/db/db.module';
import { resolveTrustProxy } from './core/config/trust-proxy';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false, trustProxy: resolveTrustProxy() }),
    { bufferLogs: true },
  );

  // Pino structured logging
  app.useLogger(app.get(Logger));

  // Apply pending DB migrations BEFORE serving traffic. This must run before
  // app.listen() — that call fires the onApplicationBootstrap backfills, which
  // already query Postgres. The drizzle/ folder is shipped in the runtime image
  // (drizzle-kit is a devDependency and is pruned from production).
  const migrationsFolder = join(__dirname, '..', 'drizzle');
  await migrate(app.get<Database>(DB), { migrationsFolder });
  app.get(Logger).log(`Database migrations applied (${migrationsFolder})`);

  // Helmet — security headers
  await app.register(helmet, {
    contentSecurityPolicy: false, // CSP managed by frontend/proxy
  });

  // Fastify cookie plugin — reuse the validated JWT secret (no weak fallback).
  const configService = app.get(ConfigService);
  await app.register(fastifyCookie, {
    secret: configService.getOrThrow<string>('JWT_SECRET'),
  });

  // Global prefix
  app.setGlobalPrefix('api/v1', {
    exclude: ['health', 'health/liveness', 'health/readiness', 'metrics', 'docs'],
  });

  // Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Exception filters (order matters: last registered = first executed)
  app.useGlobalFilters(
    new AllExceptionsFilter(),
    new HttpExceptionFilter(),
  );

  // Socket.IO Redis adapter — broadcasts reach clients on every replica.
  const redisAdapter = new RedisIoAdapter(app, app.get(REDIS_CLIENT));
  await redisAdapter.connect();
  app.useWebSocketAdapter(redisAdapter);

  // CORS
  app.enableCors({
    origin: process.env.CORS_ALLOWED_ORIGINS?.split(',') ?? [
      'http://localhost:3000',
    ],
    credentials: true,
  });

  // Swagger
  const config = new DocumentBuilder()
    .setTitle('NEXUS Panel API')
    .setDescription('BFF for the NEXUS WhatsApp AI Agent Panel')
    .setVersion('2.0')
    .addBearerAuth()
    .addCookieAuth('access_token')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const port = process.env.PORT ?? 4000;
  await app.listen(port, '0.0.0.0');

  const logger = app.get(Logger);
  // Marcador de versao do build: confirma NO LOG DE BOOT qual codigo subiu, sem
  // precisar deduzir por timestamp. `GIT_SHA` e injetado pelo build quando
  // disponivel; o fallback identifica a versao do codigo commitada junto.
  const buildVersion = process.env.GIT_SHA ?? 'sendmsg-fix-2026-07-01';
  logger.log(`NEXUS API listening on port ${port} — build=${buildVersion}`);
}

bootstrap();
