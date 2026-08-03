import { DynamicModule, Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';
import { WebhookModule } from '../webhook/webhook.module';
import { TenantConfigModule } from '../tenant-config/tenant-config.module';
import { GATEWAY_CONFIG_STORE } from '../tenant-config/gateway-config-store';
import { InMemoryGatewayConfigStore } from '../tenant-config/in-memory-gateway-config.store';
import { EventDedupService } from './event-dedup.service';
import { NormalizeContextProvider } from './normalize-context.provider';
import { EvolutionQueueConsumer } from './evolution-queue.consumer';

/**
 * Módulo do consumer RabbitMQ (Etapa 2 — desacoplamento). GATED no boot: só
 * conecta ao broker e registra a subscription quando `QUEUE_CONSUMER_ENABLED`
 * ==='true' E `RABBITMQ_URL` está presente. Caso contrário o módulo sobe VAZIO
 * — o boot local/prod atual (sem broker) NÃO quebra.
 *
 * Por que o kill-switch fica no boot (e não em runtime): o @golevelup descobre
 * as `@RabbitSubscribe` na inicialização e abre o consumo. Não registrar o
 * provider decorado (nem importar o RabbitMQModule) = nada é consumido, sem
 * conexão AMQP nenhuma. Ativar só APÓS o broker no ar (Fase 0/1, 🔒).
 */
@Module({})
export class QueueModule {
  static register(): DynamicModule {
    const enabled =
      process.env.QUEUE_CONSUMER_ENABLED === 'true' && !!process.env.RABBITMQ_URL;

    if (!enabled) {
      new Logger(QueueModule.name).log(
        'consumer OFF (QUEUE_CONSUMER_ENABLED!=true ou RABBITMQ_URL ausente) — nenhuma subscription registrada',
      );
      return { module: QueueModule };
    }

    return {
      module: QueueModule,
      imports: [
        // O consumer reusa o WebhookService.processEvolutionEvent EXISTENTE.
        WebhookModule,
        // Config store: fornece o InMemoryGatewayConfigStore que resolve o seam GO.
        TenantConfigModule,
        RabbitMQModule.forRootAsync({
          imports: [ConfigModule],
          inject: [ConfigService],
          useFactory: (config: ConfigService) => ({
            uri: config.getOrThrow<string>('RABBITMQ_URL'),
            // Exchange topic de onde a Evolution GO publica os eventos.
            exchanges: [{ name: 'evolution', type: 'topic' }],
            prefetchCount: Number(config.get<number>('QUEUE_PREFETCH') ?? 10),
            // Não travar o boot esperando o broker: reconecta em background
            // (o painel continua servindo o webhook HTTP enquanto isso).
            connectionInitOptions: { wait: false },
          }),
        }),
      ],
      providers: [
        EventDedupService,
        NormalizeContextProvider,
        EvolutionQueueConsumer,
        // Cabeia o seam: o NormalizeContextProvider recebe o store real →
        // o branch GO de contextFor resolve instanceId→instancia e ownerJid.
        { provide: GATEWAY_CONFIG_STORE, useExisting: InMemoryGatewayConfigStore },
      ],
    };
  }
}
