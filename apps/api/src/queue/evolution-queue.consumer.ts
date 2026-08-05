import { Injectable, Logger } from '@nestjs/common';
import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { normalizeGatewayEvent, type RawGatewayEvent, type NexusEventV1 } from '@nexus/shared';
import { EventDedupService } from './event-dedup.service';
import { NormalizeContextProvider } from './normalize-context.provider';
import { WebhookService } from '../webhook/webhook.service';
import { goQueueErrorHandler } from './go-queue-error-handler';

/**
 * Config compartilhada de uma subscription PASSIVA numa fila da Evolution GO. A GO
 * publica no exchange DEFAULT (routing key = nome da fila), então NÃO passamos
 * `exchange` (sem bind) e NÃO redeclaramos a fila (`createQueueIfNotExists: false`)
 * — a fila é declarada pela própria GO (quorum sem DLX). O cap de retry/DLQ é
 * app-side (ver goQueueErrorHandler).
 */
function goSubscribe(queue: string) {
  return {
    queue,
    createQueueIfNotExists: false,
    errorHandler: goQueueErrorHandler,
  };
}

/**
 * Consumidor de eventos da Evolution GO vindos do RabbitMQ. Tira o painel do
 * caminho crítico: cada fila é buffer durável e este handler só ORQUESTRA
 * (normaliza → deduplica → delega), reusando o `WebhookService.processEvolutionEvent`
 * EXISTENTE — a lógica de processamento não muda.
 *
 * DESCOBERTA (Fase 0): a GO 0.7.2 publica no default exchange, em filas POR EVENTO
 * (`message`, `receipt`, `connected`, `loggedout`, `contact`, `pushname`, `presence`).
 * Cada método abaixo assina uma fila e delega ao `handle`, que roteia por `raw.event`.
 */
@Injectable()
export class EvolutionQueueConsumer {
  private readonly logger = new Logger(EvolutionQueueConsumer.name);

  constructor(
    private readonly ctxProvider: NormalizeContextProvider,
    private readonly dedup: EventDedupService,
    private readonly service: WebhookService,
  ) {}

  @RabbitSubscribe(goSubscribe('message'))
  async onMessage(raw: RawGatewayEvent): Promise<void> {
    await this.handle(raw, 'go');
  }

  @RabbitSubscribe(goSubscribe('receipt'))
  async onReceipt(raw: RawGatewayEvent): Promise<void> {
    await this.handle(raw, 'go');
  }

  @RabbitSubscribe(goSubscribe('presence'))
  async onPresence(raw: RawGatewayEvent): Promise<void> {
    await this.handle(raw, 'go');
  }

  @RabbitSubscribe(goSubscribe('connected'))
  async onConnected(raw: RawGatewayEvent): Promise<void> {
    await this.handle(raw, 'go');
  }

  @RabbitSubscribe(goSubscribe('loggedout'))
  async onLoggedOut(raw: RawGatewayEvent): Promise<void> {
    await this.handle(raw, 'go');
  }

  @RabbitSubscribe(goSubscribe('contact'))
  async onContact(raw: RawGatewayEvent): Promise<void> {
    await this.handle(raw, 'go');
  }

  @RabbitSubscribe(goSubscribe('pushname'))
  async onPushName(raw: RawGatewayEvent): Promise<void> {
    await this.handle(raw, 'go');
  }

  /**
   * Contrato de ack/nack (spec §4.4):
   *  - normalizer `null` (fora do contrato v1, por design) → ACK + log `evt.normalizer-drop`.
   *  - duplicata (dedup por tipo) → ACK + log `evt.dedup-hit`.
   *  - `processEvolutionEvent` lança → RETHROW → o goQueueErrorHandler nacka/DLQ.
   *    Nunca engolir o erro: sem rethrow a mensagem venenosa seria "ackada" e perdida.
   */
  async handle(raw: RawGatewayEvent, gateway: 'node' | 'go'): Promise<void> {
    this.captureRaw(raw);
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
      const t0 = Date.now();
      await this.service.processEvolutionEvent(v1 as unknown as Record<string, unknown>);
      this.logLatency(v1, t0);
      void this.safeCount(v1.gateway, v1.instance, v1.event);
    } catch (err) {
      // A marca de dedup foi setada ANTES do processamento; como este evento
      // falhou e vai para o DLQ, LIBERA a marca para que o replay reprocesse em
      // vez de ser suprimido como duplicata (anti-perda). Aguarda o DEL completar
      // antes do rethrow/nack.
      await this.dedup.release(v1.instance, v1.event, v1.data.key.id);
      // Rethrow para o goQueueErrorHandler fazer o cap (nack requeue até N, então
      // DLQ). Loga aqui para observabilidade; o service já loga o detalhe.
      this.logger.error(
        `evt.nack-dlq ${v1.instance} ${v1.event}: ${(err as Error)?.message ?? String(err)}`,
      );
      void this.safeCount(v1.gateway, v1.instance, 'nack-dlq');
      throw err;
    }
  }

  /**
   * Captura de payload cru (RUNBOOK Fase 0 §4a) — gated por `GO_CAPTURE=true`,
   * OFF por padrão (zero custo no fluxo normal). Loga o envelope AMQP EXATO como
   * o consumer recebe, com tag greppável `evt.capture`, para fechar o shape de
   * eventos ainda sem fixture real (ex.: `Presence`/`ChatPresence`). Ligar por
   * uma JANELA CURTA num número de TESTE e desligar em seguida: o dump é integral
   * (LGPD) e `Message` com mídia base64 é volumoso. `go.fixtures.ts` sanitiza
   * antes de virar fixture — nunca comitar o payload cru.
   */
  private captureRaw(raw: RawGatewayEvent): void {
    if (process.env.GO_CAPTURE !== 'true') return;
    try {
      const event = typeof raw.event === 'string' ? raw.event : 'unknown';
      this.logger.log(`evt.capture event=${event} raw=${JSON.stringify(raw)}`);
    } catch {
      /* captura é best-effort; nunca quebra o processamento */
    }
  }

  /**
   * Instrumentação de latência (RUNBOOK Fase 0) — gated por `GO_LATENCY=true`,
   * OFF por padrão. Loga com tag greppável `evt.latency`:
   *  - `proc_ms`: quanto o painel levou pra processar+reenviar o evento (o forward
   *    pro n8n é fire-and-forget dentro do processEvolutionEvent, então isto mede a
   *    orquestração até o dispatch).
   *  - `wa_lag_ms`: defasagem entre o carimbo da mensagem no WhatsApp
   *    (`messageTimestamp`, epoch s) e o consumo da fila AGORA — a latência REAL do
   *    transporte GO→broker→consumer, que é o número do "latência baixa" do teste.
   * Só emite `wa_lag_ms` quando há `messageTimestamp` numérico (eventos de mensagem).
   */
  private logLatency(v1: NexusEventV1, processStartMs: number): void {
    if (process.env.GO_LATENCY !== 'true') return;
    const procMs = Date.now() - processStartMs;
    const ts = v1.data.messageTimestamp;
    const waLag = typeof ts === 'number' ? Date.now() - ts * 1000 : undefined;
    this.logger.log(
      `evt.latency gateway=${v1.gateway} instancia=${v1.instance} event=${v1.event} proc_ms=${procMs}` +
        (waLag !== undefined ? ` wa_lag_ms=${waLag}` : ''),
    );
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
