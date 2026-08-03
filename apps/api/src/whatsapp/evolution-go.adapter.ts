import { Injectable } from '@nestjs/common';
import { EvolutionGateway } from './evolution-gateway.port';

/**
 * @provisional — Esqueleto do adapter GO (Evolution GO / whatsmeow).
 *
 * O dialeto REST da Evolution GO ainda NÃO foi capturado — isso é um portão
 * manual da "Fase 0". Enquanto esse dialeto não é conhecido, cada método
 * implementa a superfície do `EvolutionGateway` mas LANÇA um erro claro
 * apontando p/ a Fase 0 (mesma disciplina das fixtures @provisional).
 *
 * Isso é seguro em produção: NENHUM tenant está em `gateway='go'`, então este
 * adapter nunca é chamado no runtime real. Quando a Fase 0 capturar o dialeto
 * REST verdadeiro, os `nyi()` são trocados pelas chamadas REST reais — o
 * `implements EvolutionGateway` já garante que as assinaturas batem com o port.
 *
 * As assinaturas abaixo são idênticas às do port (mesmos params e tipos de
 * retorno): além de provar a conformidade via `implements`, isso mantém a
 * aridade correta p/ chamadores/testes que passam argumentos reais.
 */
@Injectable()
export class EvolutionGoAdapter implements EvolutionGateway {
  private nyi(m: string): never {
    throw new Error(
      `EvolutionGoAdapter.${m} não implementado — pendente do dialeto REST GO (Fase 0)`,
    );
  }

  async sendTextMessage(
    _instancia: string,
    _jid: string,
    _text: string,
    _quoted?: { id: string; text?: string },
  ): Promise<Record<string, unknown>> {
    return this.nyi('sendTextMessage');
  }

  async sendMedia(
    _instanceName: string,
    _jid: string,
    _opts: {
      mediatype: 'image' | 'video' | 'document';
      media: string;
      fileName?: string;
      caption?: string;
      mimetype?: string;
    },
  ): Promise<Record<string, unknown>> {
    return this.nyi('sendMedia');
  }

  async sendWhatsAppAudio(
    _instancia: string,
    _jid: string,
    _audio: string,
  ): Promise<Record<string, unknown>> {
    return this.nyi('sendWhatsAppAudio');
  }

  async sendContact(
    _instancia: string,
    _jid: string,
    _contact: { fullName: string; phoneNumber: string; organization?: string; email?: string },
  ): Promise<Record<string, unknown>> {
    return this.nyi('sendContact');
  }

  async sendLocation(
    _instancia: string,
    _jid: string,
    _loc: { latitude: number; longitude: number; name?: string; address?: string },
  ): Promise<Record<string, unknown>> {
    return this.nyi('sendLocation');
  }

  async healthCheck(): Promise<void> {
    return this.nyi('healthCheck');
  }

  async fetchInstances(): Promise<unknown[]> {
    return this.nyi('fetchInstances');
  }

  async getConnectionState(_instancia: string): Promise<Record<string, unknown>> {
    return this.nyi('getConnectionState');
  }

  async probeState(
    _instancia: string,
  ): Promise<
    { status: 'exists'; state: string } | { status: 'absent' } | { status: 'unknown' }
  > {
    return this.nyi('probeState');
  }

  async findContacts(_instanceName: string): Promise<unknown> {
    return this.nyi('findContacts');
  }

  async fetchProfilePictureUrl(_instancia: string, _jid: string): Promise<string | null> {
    return this.nyi('fetchProfilePictureUrl');
  }

  async findMessages(
    _instanceName: string,
    _remoteJid: string,
    _count?: number,
  ): Promise<unknown> {
    return this.nyi('findMessages');
  }

  async getBase64FromMediaMessage(
    _instanceName: string,
    _key: { id: string; remoteJid: string; fromMe: boolean },
  ): Promise<{ base64: string; mimetype?: string }> {
    return this.nyi('getBase64FromMediaMessage');
  }

  async findChats(_instanceName: string): Promise<unknown> {
    return this.nyi('findChats');
  }

  async createInstance(
    _instanceName: string,
    _webhookUrl?: string,
  ): Promise<Record<string, unknown>> {
    return this.nyi('createInstance');
  }

  async getQrCode(_instancia: string): Promise<{ base64: string; code: string }> {
    return this.nyi('getQrCode');
  }

  async deleteInstance(_instancia: string): Promise<void> {
    return this.nyi('deleteInstance');
  }
}
