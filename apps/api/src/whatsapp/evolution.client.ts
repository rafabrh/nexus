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

  // NOTA: setWebhook NAO deve ser chamado automaticamente.
  // O webhook do N8N em https://n8n.shkgroups.com/webhook/shkgroupwpp
  // e SAGRADO e nao deve ser sobrescrito.
}
