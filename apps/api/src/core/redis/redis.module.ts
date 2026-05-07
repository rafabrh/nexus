import { Module, Global, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export const REDIS_CLIENT = 'REDIS_CLIENT';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: (config: ConfigService) => {
        const logger = new Logger('RedisModule');
        const url = config.getOrThrow<string>('REDIS_URL');
        const password = config.get<string>('REDIS_PASSWORD');

        const client = new Redis(url, {
          password: password || undefined,
          maxRetriesPerRequest: 3,
          retryStrategy: (times: number) => Math.min(times * 200, 5000),
          lazyConnect: true,
          enableReadyCheck: true,
        });

        client.on('connect', () => {
          logger.log('Redis connected');
        });

        client.on('error', (err: Error) => {
          logger.error(`Redis error: ${err.message}`);
        });

        client.on('close', () => {
          logger.warn('Redis connection closed');
        });

        client.connect().catch((err: Error) => {
          logger.error(`Redis initial connect failed: ${err.message}`);
        });

        return client;
      },
      inject: [ConfigService],
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
