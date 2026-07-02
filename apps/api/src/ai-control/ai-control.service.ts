import { Injectable, Inject, Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../core/redis/redis.module';
import { RedisKeys } from '@nexus/shared';
import type { AiControlResponse } from '@nexus/shared';
import type { AiToggleRequestDto } from './dto/ai-toggle-request.dto';
import { EventPublisher } from '../realtime/event.publisher';

/**
 * "OFF permanente" — o MESMO valor que o comando `off NUM` do N8N grava (nó
 * "Admin - OFF (set humanControlUntil)"). É um timestamp no ano ~2100, então a
 * checagem do fluxo (`humanControlUntil > Date.now()`) fica sempre verdadeira até
 * um `on`/`reset` limpar a chave. Manter idêntico garante que o botão do painel e
 * o comando de chat tenham efeito EXATAMENTE igual.
 */
const PERMANENT_OFF_MS = 4102444800000;

@Injectable()
export class AiControlService {
  private readonly logger = new Logger(AiControlService.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly publisher: EventPublisher,
  ) {}

  async getState(instancia: string, jid: string): Promise<AiControlResponse> {
    const key = RedisKeys.humanControlUntil(instancia, jid);
    const value = await this.redis.get(key);

    if (!value) {
      return { state: 'ON', until: null };
    }

    const until = parseInt(value, 10);
    if (isNaN(until) || until <= Date.now()) {
      return { state: 'ON', until: null };
    }

    // Valor "permanente" (ano ~2100) = OFF permanente (comando `off`), não uma
    // pausa temporizada — a UI mostra "Desligada", sem horário-limite.
    if (until >= PERMANENT_OFF_MS) {
      return { state: 'OFF', until: null };
    }

    return {
      state: 'OFF_UNTIL',
      until: new Date(until).toISOString(),
    };
  }

  async toggle(instancia: string, jid: string, dto: AiToggleRequestDto): Promise<AiControlResponse> {
    const key = RedisKeys.humanControlUntil(instancia, jid);

    // Detect previous state to determine if handoff should be emitted
    const previousState = await this.getState(instancia, jid);

    if (dto.state === 'ON') {
      await this.redis.del(key);
      this.logger.log(`IA turned ON for ${instancia}/${jid}`);
      return { state: 'ON', until: null };
    }

    // OFF permanente (Switch = comando `off NUM`) ou OFF_UNTIL (pausar por tempo =
    // `off NUM 2h`). Espelha o "Admin - OFF" do N8N: MESMA chave, MESMO valor
    // permanente e MESMO TTL de 1 ano — botão do painel ≡ comando de chat.
    const permanent = !dto.expireAt;
    const until = permanent
      ? PERMANENT_OFF_MS
      : new Date(dto.expireAt as string).getTime();

    await this.redis.set(key, until.toString(), 'EX', 31_536_000);
    this.logger.log(
      `IA turned ${
        permanent ? 'OFF (permanent)' : `OFF_UNTIL ${new Date(until).toISOString()}`
      } for ${instancia}/${jid}`,
    );

    // Emit handoff.triggered when transitioning from ON to OFF/OFF_UNTIL
    if (previousState.state === 'ON') {
      await this.publisher.publish({
        type: 'handoff.triggered',
        instancia,
        jid,
        ts: Date.now(),
        payload: { until: permanent ? null : new Date(until).toISOString() },
      });
    }

    return permanent
      ? { state: 'OFF', until: null }
      : { state: 'OFF_UNTIL', until: new Date(until).toISOString() };
  }
}
