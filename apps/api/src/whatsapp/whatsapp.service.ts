import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EvolutionClient } from './evolution.client';

export interface WhatsAppInstance {
  name: string;
  connectionStatus: string;
}

export interface ConnectionState {
  state: string;
  instance: string;
}

export interface IntegrationStatus {
  evolution: {
    configured: boolean;
    connected: boolean;
  };
  n8n: {
    webhookUrl: string;
  };
}

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);

  constructor(
    private readonly evolution: EvolutionClient,
    private readonly config: ConfigService,
  ) {}

  async getInstances(): Promise<WhatsAppInstance[]> {
    try {
      const raw = await this.evolution.fetchInstances();
      if (!Array.isArray(raw)) return [];

      return raw.map((inst) => ({

        name: String((inst as Record<string, unknown>).name ?? (inst as Record<string, unknown>).instanceName ?? ''),
        connectionStatus: String((inst as Record<string, unknown>).connectionStatus ?? (inst as Record<string, unknown>).status ?? 'unknown'),
      }));
    } catch (err) {
      this.logger.warn(`Failed to fetch instances: ${(err as Error).message}`);
      return [];
    }
  }

  async getConnectionState(instanceName: string): Promise<ConnectionState> {
    try {
      const raw = await this.evolution.getConnectionState(instanceName);
      const state = this.resolveState(raw);
      return { state, instance: instanceName };
    } catch (err) {
      this.logger.warn(`Failed to get state for ${instanceName}: ${(err as Error).message}`);
      return { state: 'disconnected', instance: instanceName };
    }
  }

  async getIntegrationStatus(): Promise<IntegrationStatus> {
    const evolutionUrl = this.config.get<string>('EVOLUTION_API_URL', '');
    const evolutionKey = this.config.get<string>('EVOLUTION_API_KEY', '');
    const configured = !!evolutionUrl && !!evolutionKey;
    let connected = false;

    if (configured) {
      try {
        await this.evolution.healthCheck();
        connected = true;
      } catch {
        // Evolution not reachable
      }
    }

    const appBaseUrl = this.config.get<string>('APP_BASE_URL', 'http://localhost:4000');

    return {
      evolution: { configured, connected },
      n8n: { webhookUrl: `${appBaseUrl}/api/v1/webhook/evolution` },
    };
  }

  private resolveState(raw: Record<string, unknown>): string {
    if (!raw) return 'disconnected';

    // Evolution API v2 format: { instance: { state: "open" } }
    const instanceObj = raw.instance as Record<string, unknown> | undefined;
    if (instanceObj && typeof instanceObj.state === 'string') {
      return this.mapState(instanceObj.state);
    }

    // Flat format: { state: "open" }
    if (typeof raw.state === 'string') {
      return this.mapState(raw.state);
    }

    return 'disconnected';
  }

  private mapState(state: string): string {
    switch (state) {
      case 'open':
        return 'connected';
      case 'connecting':
        return 'connecting';
      case 'close':
        return 'disconnected';
      default:
        return 'disconnected';
    }
  }
}
