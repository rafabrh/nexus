import { Injectable, Inject, Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../core/redis/redis.module';
import { RedisKeys } from '@nexus/shared';
import type { AiControlResponse } from '@nexus/shared';
import type { AiToggleRequestDto } from './dto/ai-toggle-request.dto';
import { EventPublisher } from '../realtime/event.publisher';
import { controlJids } from '../core/whatsapp/control-jids.util';

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
    // Checa a chave canônica E a do remoteJid cru (@lid) — o painel escreve na
    // canônica, mas o N8N (controle humano automático) pode escrever só na cru.
    const jids = await controlJids(this.redis, instancia, jid);
    const values = await Promise.all(
      jids.map((j) => this.redis.get(RedisKeys.humanControlUntil(instancia, j))),
    );
    const untils = values
      .map((v) => (v ? parseInt(v, 10) : NaN))
      .filter((n) => !isNaN(n) && n > Date.now());

    if (untils.length === 0) {
      return { state: 'ON', until: null };
    }

    const until = Math.max(...untils);
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
    // Escreve nas MESMAS chaves que o N8N checa: a canônica (painel) e o
    // remoteJid cru (@lid). Sem os dois, o OFF do painel não alcança o fluxo.
    const jids = await controlJids(this.redis, instancia, jid);
    const previousState = await this.getState(instancia, jid);

    if (dto.state === 'ON') {
      await Promise.all(
        jids.map((j) => this.redis.del(RedisKeys.humanControlUntil(instancia, j))),
      );
      this.logger.log(`IA turned ON for ${instancia}/${jid} — jids=[${jids.join(', ')}]`);
      return { state: 'ON', until: null };
    }

    // OFF permanente (Switch = comando `off NUM`) ou OFF_UNTIL (pausar por tempo =
    // `off NUM 2h`). Espelha o "Admin - OFF" do N8N: MESMO valor permanente e
    // MESMO TTL de 1 ano — botão do painel ≡ comando de chat.
    const permanent = !dto.expireAt;
    const until = permanent
      ? PERMANENT_OFF_MS
      : new Date(dto.expireAt as string).getTime();

    await Promise.all(
      jids.map((j) =>
        this.redis.set(
          RedisKeys.humanControlUntil(instancia, j),
          until.toString(),
          'EX',
          31_536_000,
        ),
      ),
    );
    this.logger.log(
      `IA turned ${
        permanent ? 'OFF (permanent)' : `OFF_UNTIL ${new Date(until).toISOString()}`
      } for ${instancia}/${jid} — jids=[${jids.join(', ')}]`,
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
