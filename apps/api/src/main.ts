import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import fastifyCookie from '@fastify/cookie';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './core/filters/http-exception.filter';
import { AllExceptionsFilter } from './core/filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false }),
    { bufferLogs: true },
  );

  // Pino structured logging
  app.useLogger(app.get(Logger));

  // Fastify cookie plugin
  await app.register(fastifyCookie, {
    secret: process.env.JWT_SECRET ?? 'cookie-secret',
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
  logger.log(`NEXUS API listening on port ${port}`);
}

bootstrap();
