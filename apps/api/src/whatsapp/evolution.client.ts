import { Injectable, Inject } from '@nestjs/common';
import type { EvolutionGateway } from './evolution-gateway.port';
import { EVOLUTION_GATEWAY_NODE, EVOLUTION_GATEWAY_GO } from './evolution-gateway.port';
import { InMemoryGatewayConfigStore } from '../tenant-config/in-memory-gateway-config.store';

/**
 * ROUTER de saída (§4.3). Mantém o MESMO nome de classe e token de DI que a
 * antiga classe `EvolutionClient` — os 5 consumidores que o injetam NÃO mudam.
 *
 * Para cada método do {@link EvolutionGateway}, resolve o gateway do tenant pela
 * INSTÂNCIA (sempre o 1º argumento) via {@link InMemoryGatewayConfigStore.gatewayFor}
 * e delega ao adapter `node` (Evolution REST) ou `go` (Evolution GO) com os
 * MESMOS argumentos, na mesma ordem. Métodos sem instância (`healthCheck`,
 * `fetchInstances`) vão sempre ao node — a superfície GO não os usa.
 */
@Injectable()
export class EvolutionClient implements EvolutionGateway {
  constructor(
    @Inject(EVOLUTION_GATEWAY_NODE) private readonly node: EvolutionGateway,
    @Inject(EVOLUTION_GATEWAY_GO) private readonly go: EvolutionGateway,
    private readonly gateways: InMemoryGatewayConfigStore,
  ) {}

  private pick(instancia: string): EvolutionGateway {
    return this.gateways.gatewayFor(instancia) === 'go' ? this.go : this.node;
  }

  sendTextMessage(
    instancia: string,
    jid: string,
    text: string,
    quoted?: { id: string; text?: string },
  ): Promise<Record<string, unknown>> {
    return this.pick(instancia).sendTextMessage(instancia, jid, text, quoted);
  }

  sendMedia(
    instanceName: string,
    jid: string,
    opts: {
      mediatype: 'image' | 'video' | 'document';
      media: string;
      fileName?: string;
      caption?: string;
      mimetype?: string;
    },
  ): Promise<Record<string, unknown>> {
    return this.pick(instanceName).sendMedia(instanceName, jid, opts);
  }

  sendWhatsAppAudio(
    instancia: string,
    jid: string,
    audio: string,
  ): Promise<Record<string, unknown>> {
    return this.pick(instancia).sendWhatsAppAudio(instancia, jid, audio);
  }

  sendContact(
    instancia: string,
    jid: string,
    contact: { fullName: string; phoneNumber: string; organization?: string; email?: string },
  ): Promise<Record<string, unknown>> {
    return this.pick(instancia).sendContact(instancia, jid, contact);
  }

  sendLocation(
    instancia: string,
    jid: string,
    loc: { latitude: number; longitude: number; name?: string; address?: string },
  ): Promise<Record<string, unknown>> {
    return this.pick(instancia).sendLocation(instancia, jid, loc);
  }

  healthCheck(): Promise<void> {
    return this.node.healthCheck();
  }

  fetchInstances(): Promise<unknown[]> {
    return this.node.fetchInstances();
  }

  getConnectionState(instancia: string): Promise<Record<string, unknown>> {
    return this.pick(instancia).getConnectionState(instancia);
  }

  probeState(
    instancia: string,
  ): Promise<{ status: 'exists'; state: string } | { status: 'absent' } | { status: 'unknown' }> {
    return this.pick(instancia).probeState(instancia);
  }

  findContacts(instanceName: string): Promise<unknown> {
    return this.pick(instanceName).findContacts(instanceName);
  }

  fetchProfilePictureUrl(instancia: string, jid: string): Promise<string | null> {
    return this.pick(instancia).fetchProfilePictureUrl(instancia, jid);
  }

  findMessages(instanceName: string, remoteJid: string, count?: number): Promise<unknown> {
    return this.pick(instanceName).findMessages(instanceName, remoteJid, count);
  }

  getBase64FromMediaMessage(
    instanceName: string,
    key: { id: string; remoteJid: string; fromMe: boolean },
  ): Promise<{ base64: string; mimetype?: string }> {
    return this.pick(instanceName).getBase64FromMediaMessage(instanceName, key);
  }

  findChats(instanceName: string): Promise<unknown> {
    return this.pick(instanceName).findChats(instanceName);
  }

  createInstance(instanceName: string, webhookUrl?: string): Promise<Record<string, unknown>> {
    return this.pick(instanceName).createInstance(instanceName, webhookUrl);
  }

  getQrCode(instancia: string): Promise<{ base64: string; code: string }> {
    return this.pick(instancia).getQrCode(instancia);
  }

  deleteInstance(instancia: string): Promise<void> {
    return this.pick(instancia).deleteInstance(instancia);
  }
}
