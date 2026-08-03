import { Injectable, Logger } from '@nestjs/common';
import { RabbitSubscribe, defaultNackErrorHandler } from '@golevelup/nestjs-rabbitmq';
import { normalizeGatewayEvent, type RawGatewayEvent } from '@nexus/shared';
import { EventDedupService } from './event-dedup.service';
import { NormalizeContextProvider } from './normalize-context.provider';
import { WebhookService } from '../webhook/webhook.service';

/**
 * Consumidor de eventos de gateway vindos do RabbitMQ. Tira o painel do caminho
 * crítico: a fila é o buffer durável e este handler só ORQUESTRA
 * (normaliza → deduplica → delega), reusando o `WebhookService.processEvolutionEvent`
 * EXISTENTE — a lógica de processamento não muda.
 *
 * `handle` é público e testável sem AMQP; a anotação `@RabbitSubscribe`
 * (QueueModule, Task 5) apenas o invoca e mapeia o retorno/erro para ack/nack.
 */
@Injectable()
export class EvolutionQueueConsumer {
  private readonly logger = new Logger(EvolutionQueueConsumer.name);

  constructor(
    private readonly ctxProvider: NormalizeContextProvider,
    private readonly dedup: EventDedupService,
    private readonly service: WebhookService,
  ) {}

  /**
   * Ponto de entrada AMQP. A fila `nexus.panel.events` carrega eventos da
   * **Evolution GO** (Fases 1+); o gateway Node segue pelo webhook HTTP. Ao
   * lançar, o `defaultNackErrorHandler` faz nack SEM requeue → a mensagem cai na
   * DLX `nexus.dlx` (não trava a fila). Delega toda a lógica ao `handle`.
   */
  @RabbitSubscribe({
    exchange: 'evolution',
    routingKey: '#',
    queue: 'nexus.panel.events',
    queueOptions: {
      durable: true,
      deadLetterExchange: 'nexus.dlx',
      deadLetterRoutingKey: 'nexus.panel.events.dlq',
    },
    errorHandler: defaultNackErrorHandler,
  })
  async onEvent(raw: RawGatewayEvent): Promise<void> {
    await this.handle(raw, 'go');
  }

  /**
   * Contrato de ack/nack (spec §4.4):
   *  - normalizer `null` (fora do contrato v1, por design) → ACK + log `evt.normalizer-drop`.
   *  - duplicata (dedup por tipo) → ACK + log `evt.dedup-hit`.
   *  - `processEvolutionEvent` lança → RETHROW → o errorHandler AMQP nacka → DLQ.
   *    Nunca engolir o erro: sem rethrow a mensagem venenosa seria "ackada" e perdida.
   */
  async handle(raw: RawGatewayEvent, gateway: 'node' | 'go'): Promise<void> {
    const ctx = this.ctxProvider.contextFor(gateway, raw);
    const v1 = normalizeGatewayEvent(raw, ctx);
    if (!v1) {
      this.logger.debug(`evt.normalizer-drop gateway=${gateway}`);
      void this.safeCount(gateway, 'unknown', 'normalizer-drop');
      return; // ack: fora do contrato v1 (NÃO é erro)
    }

    const ok = await this.dedup.shouldProcess(v1.instance, v1.event, v1.data.key.id);
    if (!ok) {
      this.logger.debug(`evt.dedup-hit ${v1.instance} ${v1.event} ${v1.data.key.id}`);
      void this.safeCount(v1.gateway, v1.instance, 'dedup-hit');
      return; // ack: já processado
    }

    try {
      await this.service.processEvolutionEvent(v1 as unknown as Record<string, unknown>);
      void this.safeCount(v1.gateway, v1.instance, v1.event);
    } catch (err) {
      // A marca de dedup foi setada ANTES do processamento; como este evento
      // falhou e vai para o DLQ, LIBERA a marca para que o replay reprocesse em
      // vez de ser suprimido como duplicata (anti-perda). Aguarda o DEL completar
      // antes do rethrow/nack.
      await this.dedup.release(v1.instance, v1.event, v1.data.key.id);
      // Rethrow para o errorHandler AMQP fazer nack → DLQ (nexus.dlx). Loga aqui
      // para observabilidade; o service já loga o detalhe do processamento.
      this.logger.error(
        `evt.nack-dlq ${v1.instance} ${v1.event}: ${(err as Error)?.message ?? String(err)}`,
      );
      void this.safeCount(v1.gateway, v1.instance, 'nack-dlq');
      throw err;
    }
  }

  /** Incremento de métrica fire-and-forget: nunca deixa a observabilidade
   *  quebrar o processamento (Redis pode estar indisponível). */
  private async safeCount(fonte: string, instancia: string, event: string): Promise<void> {
    try {
      await this.dedup.count(fonte, instancia, event);
    } catch {
      /* métrica é best-effort */
    }
  }
}
