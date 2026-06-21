import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { evolutionPolicy } from '../core/resilience/policies';

@Injectable()
export class EvolutionClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly logger = new Logger(EvolutionClient.name);

  constructor(private readonly config: ConfigService) {
    this.baseUrl = config.get<string>('EVOLUTION_API_URL', 'https://n8n-evolution-api.b8ul3d.easypanel.host');
    this.apiKey = config.get<string>('EVOLUTION_API_KEY', '');
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    return evolutionPolicy.execute(async () => {
      const url = `${this.baseUrl}${path}`;
      this.logger.debug(`${method} ${url}`);

      const res = await fetch(url, {
        method,
        headers: {
          apikey: this.apiKey,
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Evolution API ${res.status}: ${text}`);
      }

      const contentType = res.headers.get('content-type') ?? '';
      if (contentType.includes('application/json')) {
        return (await res.json()) as T;
      }
      return undefined as T;
    });
  }

  async sendTextMessage(instancia: string, jid: string, text: string): Promise<void> {
    await this.request('POST', `/message/sendText/${instancia}`, {
      number: jid,
      text,
    });
  }

  async healthCheck(): Promise<void> {
    await this.request('GET', '/instance/fetchInstances');
  }

  async fetchInstances(): Promise<unknown[]> {
    return this.request<unknown[]>('GET', '/instance/fetchInstances');
  }

  async getConnectionState(instancia: string): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>('GET', `/instance/connectionState/${instancia}`);
  }

  /**
   * Probes an instance, collapsing the raw call into three states that callers
   * MUST treat differently:
   *  - `exists`  : instance is live (with its connection state)
   *  - `absent`  : Evolution returned 404 — the instance genuinely does not exist
   *  - `unknown` : the call failed (timeout/network/5xx) — we cannot tell
   *
   * `unknown` must never be collapsed into `absent`: a transient error could
   * otherwise trigger destructive recreation of a live instance.
   */
  async probeState(
    instancia: string,
  ): Promise<{ status: 'exists'; state: string } | { status: 'absent' } | { status: 'unknown' }> {
    try {
      const res = await this.getConnectionState(instancia);
      const instanceObj = (res as Record<string, unknown>)?.instance as
        | Record<string, unknown>
        | undefined;
      const state = instanceObj?.state ?? (res as Record<string, unknown>)?.state;
      return { status: 'exists', state: typeof state === 'string' ? state : 'close' };
    } catch (err) {
      const msg = (err as Error).message ?? '';
      if (msg.includes('404') || msg.toLowerCase().includes('does not exist')) {
        return { status: 'absent' };
      }
      this.logger.warn(`probeState: Evolution unreachable for ${instancia}: ${msg}`);
      return { status: 'unknown' };
    }
  }

  async findContacts(instanceName: string): Promise<unknown> {
    return this.request('POST', `/chat/findContacts/${instanceName}`, {});
  }

  async findMessages(instanceName: string, remoteJid: string, limit: number): Promise<unknown> {
    return this.request('POST', `/chat/findMessages/${instanceName}`, {
      where: { key: { remoteJid } },
      limit,
    });
  }

  async findChats(instanceName: string): Promise<unknown> {
    return this.request('POST', `/chat/findChats/${instanceName}`, {});
  }

  async createInstance(instanceName: string, webhookUrl?: string): Promise<Record<string, unknown>> {
    const body: Record<string, unknown> = {
      instanceName,
      integration: 'WHATSAPP-BAILEYS',
      qrcode: true,
    };
    if (webhookUrl) {
      body.webhook = {
        url: webhookUrl,
        byEvents: false,
        base64: false,
        events: [
          'messages.upsert',
          'connection.update',
          'contacts.update',
          'contacts.upsert',
        ],
      };
    }
    return this.request<Record<string, unknown>>('POST', '/instance/create', body);
  }

  async getQrCode(instancia: string): Promise<{ base64: string; code: string }> {
    return this.request<{ base64: string; code: string }>('GET', `/instance/connect/${instancia}`);
  }

  async deleteInstance(instancia: string): Promise<void> {
    await this.request('DELETE', `/instance/delete/${instancia}`);
  }

  // NOTA: setWebhook NAO deve ser chamado automaticamente.
  // O webhook do N8N em https://n8n.shkgroups.com/webhook/shkgroupwpp
  // e SAGRADO e nao deve ser sobrescrito.
}
