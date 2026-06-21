import { Module, Global, Logger, type OnModuleDestroy, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export const DB = 'DB';
export const PG_CLIENT = 'PG_CLIENT';

export type Database = PostgresJsDatabase<typeof schema>;

/**
 * Conexão Postgres global. O pool é pequeno de propósito: o container roda com
 * 256MB e o BFF é I/O-bound sobre o Redis — o Postgres só carrega o sistema de
 * registro e a projeção de conversas, não o caminho quente de mensagens.
 */
@Global()
@Module({
  providers: [
    {
      provide: PG_CLIENT,
      useFactory: (config: ConfigService) => {
        const logger = new Logger('DbModule');
        const url = config.getOrThrow<string>('DATABASE_URL');
        const client = postgres(url, {
          max: Number(process.env.DB_POOL_MAX ?? 10),
          idle_timeout: 20,
          connect_timeout: 10,
          onnotice: () => {}, // silencia NOTICEs ruidosos
        });
        logger.log('Postgres pool created');
        return client;
      },
      inject: [ConfigService],
    },
    {
      provide: DB,
      useFactory: (client: postgres.Sql) =>
        drizzle(client, { schema }),
      inject: [PG_CLIENT],
    },
  ],
  exports: [DB, PG_CLIENT],
})
export class DbModule implements OnModuleDestroy {
  constructor(@Inject(PG_CLIENT) private readonly client: postgres.Sql) {}

  async onModuleDestroy(): Promise<void> {
    await this.client.end({ timeout: 5 });
  }
}
