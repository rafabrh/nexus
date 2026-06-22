import { Global, Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { TerminusModule } from '@nestjs/terminus';
import { RedisModule } from './redis/redis.module';
import { RedisService } from './redis/redis.service';
import { DbModule } from './db/db.module';
import { HealthModule } from './health/health.module';
import { MetricsService } from './metrics/metrics.service';
import { MetricsController } from './metrics/metrics.controller';
import { MetricsAuthGuard } from './metrics/metrics-auth.guard';

@Global()
@Module({
  imports: [
    RedisModule,
    DbModule,
    LoggerModule.forRoot({
      pinoHttp: {
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty', options: { colorize: true } }
            : undefined,
        level: process.env.LOG_LEVEL ?? 'info',
        // Never log credentials. pino-http logs req/res headers by default,
        // which would leak the JWT cookies and Authorization bearer tokens.
        redact: {
          paths: [
            'req.headers.cookie',
            'req.headers.authorization',
            'res.headers["set-cookie"]',
            'req.headers.apikey',
          ],
          censor: '[REDACTED]',
        },
        autoLogging: {
          ignore: (req: { url?: string }) =>
            req.url === '/health' ||
            req.url === '/health/liveness' ||
            req.url === '/health/readiness' ||
            req.url === '/metrics',
        },
      },
    }),
    TerminusModule,
    HealthModule,
  ],
  providers: [RedisService, MetricsService, MetricsAuthGuard],
  controllers: [MetricsController],
  exports: [RedisService, MetricsService],
})
export class CoreModule {}
