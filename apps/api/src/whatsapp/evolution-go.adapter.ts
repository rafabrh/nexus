import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { evolutionPolicy } from '../core/resilience/policies';
import { EvolutionGateway } from './evolution-gateway.port';
import { InMemoryGatewayConfigStore } from '../tenant-config/in-memory-gateway-config.store';

/**
 * Adapter GO (Evolution GO / whatsmeow) — dialeto REST capturado na Fase 0.
 *
 * Diferenças do Node que este adapter encapsula:
 *  - A instância é identificada pelo **token da instância** no header `apikey`
 *    (NÃO por path/body). Calls de instância (`/send/*`, `/instance/status|qr`)
 *    usam esse token, resolvido de `InMemoryGatewayConfigStore.goCredentials`.
 *    Calls administrativas (`/instance/all`, `/server/ok`) usam a GLOBAL_API_KEY.
 *  - `/send/media` usa `url` (não base64 inline); NÃO existe `/send/audio`
 *    (áudio vai por `/send/media type=audio`); `/send/contact` usa `vcard`.
 *  - A GO entrega mídia recebida em base64 INLINE no evento → não há fetch de
 *    histórico/contatos/foto: esses métodos DEGRADAM (retornam vazio), não lançam.
 *  - `probeState` degrada p/ `{status:'unknown'}` em erro (gate auditoria 2.4) —
 *    senão quebraria o connection-reconciler no 1º tenant GO.
 *
 * Seguro em prod: só é chamado p/ tenants em `gateway='go'` (nenhum hoje).
 */
@Injectable()
export class EvolutionGoAdapter implements EvolutionGateway {
  private readonly baseUrl: string;
  private readonly globalKey: string;
  private readonly logger = new Logger(EvolutionGoAdapter.name);

  constructor(
    private readonly config: ConfigService,
    private readonly gateways: InMemoryGatewayConfigStore,
  ) {
    this.baseUrl = config
      .get<string>('EVOLUTION_GO_URL', 'https://evogo.shkgroup.com.br')
      .replace(/\/+$/, '');
    this.globalKey = config.get<string>('EVOLUTION_GO_API_KEY', '');
  }

  /** Token (apikey) da instância GO p/ o tenant. Lança claro se não seedado. */
  private instanceKey(instancia: string): string {
    const token = this.gateways.goCredentials(instancia)?.token;
    if (!token) {
      throw new Error(
        `EvolutionGoAdapter: sem instanceToken para "${instancia}" — seed do tenant GO pendente (Fase 0)`,
      );
    }
    return token;
  }

  private async request<T>(
    method: string,
    path: string,
    opts: { apikey: string; body?: unknown } = { apikey: this.globalKey },
  ): Promise<T> {
    return evolutionPolicy.execute(async () => {
      const url = `${this.baseUrl}${path}`;
      this.logger.debug(`${method} ${url}`);
      const res = await fetch(url, {
        method,
        headers: { apikey: opts.apikey, 'Content-Type': 'application/json' },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Evolution GO ${res.status}: ${text}`);
      }
      const contentType = res.headers.get('content-type') ?? '';
      if (contentType.includes('application/json')) return (await res.json()) as T;
      return undefined as T;
    });
  }

  // ---- Envio (token da instância) ----

  async sendTextMessage(
    instancia: string,
    jid: string,
    text: string,
    quoted?: { id: string; text?: string },
  ): Promise<Record<string, unknown>> {
    const body: Record<string, unknown> = { number: jid, text };
    if (quoted?.id) body.quoted = { id: quoted.id };
    return this.request('POST', '/send/text', { apikey: this.instanceKey(instancia), body });
  }

  async sendMedia(
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
    // GO: /send/media usa `url` (URL http ou data-URI) + `type`.
    const body: Record<string, unknown> = { number: jid, url: opts.media, type: opts.mediatype };
    if (opts.caption) body.caption = opts.caption;
    if (opts.fileName) body.filename = opts.fileName;
    return this.request('POST', '/send/media', { apikey: this.instanceKey(instanceName), body });
  }

  async sendWhatsAppAudio(
    instancia: string,
    jid: string,
    audio: string,
  ): Promise<Record<string, unknown>> {
    // Sem /send/audio no GO → áudio (PTT) vai por /send/media type=audio.
    return this.request('POST', '/send/media', {
      apikey: this.instanceKey(instancia),
      body: { number: jid, url: audio, type: 'audio' },
    });
  }

  async sendContact(
    instancia: string,
    jid: string,
    contact: { fullName: string; phoneNumber: string; organization?: string; email?: string },
  ): Promise<Record<string, unknown>> {
    const vcard: Record<string, unknown> = {
      fullName: contact.fullName,
      phoneNumber: contact.phoneNumber,
    };
    if (contact.organization) vcard.organization = contact.organization;
    if (contact.email) vcard.email = contact.email;
    return this.request('POST', '/send/contact', {
      apikey: this.instanceKey(instancia),
      body: { number: jid, vcard },
    });
  }

  async sendLocation(
    instancia: string,
    jid: string,
    loc: { latitude: number; longitude: number; name?: string; address?: string },
  ): Promise<Record<string, unknown>> {
    const body: Record<string, unknown> = {
      number: jid,
      latitude: loc.latitude,
      longitude: loc.longitude,
    };
    if (loc.name) body.name = loc.name;
    if (loc.address) body.address = loc.address;
    return this.request('POST', '/send/location', { apikey: this.instanceKey(instancia), body });
  }

  // ---- Admin / estado ----

  async healthCheck(): Promise<void> {
    await this.request<{ status?: string }>('GET', '/server/ok', { apikey: this.globalKey });
  }

  async fetchInstances(): Promise<unknown[]> {
    const res = await this.request<{ data?: unknown[] }>('GET', '/instance/all', {
      apikey: this.globalKey,
    });
    return res?.data ?? [];
  }

  async getConnectionState(instancia: string): Promise<Record<string, unknown>> {
    const res = await this.request<{ data?: Record<string, unknown> }>('GET', '/instance/status', {
      apikey: this.instanceKey(instancia),
    });
    return res?.data ?? {};
  }

  async probeState(
    instancia: string,
  ): Promise<
    { status: 'exists'; state: string } | { status: 'absent' } | { status: 'unknown' }
  > {
    // DEGRADA p/ 'unknown' em QUALQUER erro (gate 2.4): sem token seedado, GO fora
    // do ar, timeout etc. — nunca lança (não pode quebrar o connection-reconciler).
    const creds = this.gateways.goCredentials(instancia);
    if (!creds?.token) return { status: 'unknown' };
    try {
      const res = await this.request<{ data?: { Connected?: boolean; LoggedIn?: boolean } }>(
        'GET',
        '/instance/status',
        { apikey: creds.token },
      );
      const d = res?.data ?? {};
      if (d.LoggedIn) return { status: 'exists', state: 'open' };
      if (d.Connected) return { status: 'exists', state: 'connecting' };
      return { status: 'exists', state: 'close' };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/\b404\b/.test(msg)) return { status: 'absent' };
      this.logger.warn(`probeState(${instancia}) degradou p/ unknown: ${msg}`);
      return { status: 'unknown' };
    }
  }

  async getQrCode(instancia: string): Promise<{ base64: string; code: string }> {
    const res = await this.request<{ data?: { qrcode?: string; code?: string } }>(
      'GET',
      '/instance/qr',
      { apikey: this.instanceKey(instancia) },
    );
    const qrcode = res?.data?.qrcode ?? '';
    const base64 = qrcode.startsWith('data:image') ? qrcode.split(',', 2)[1] ?? '' : qrcode;
    return { base64, code: res?.data?.code ?? qrcode };
  }

  async createInstance(
    instanceName: string,
    _webhookUrl?: string,
  ): Promise<Record<string, unknown>> {
    // GO create exige um token da instância (vira a apikey dela). O connect com
    // webhook/subscribe é um passo separado (não coberto por esta superfície).
    const token = randomBytes(24).toString('hex');
    return this.request('POST', '/instance/create', {
      apikey: this.globalKey,
      body: { name: instanceName, token },
    });
  }

  async deleteInstance(instancia: string): Promise<void> {
    const uuid = this.gateways.goCredentials(instancia)?.instanceId;
    if (uuid) {
      await this.request('DELETE', `/instance/delete/${uuid}`, { apikey: this.globalKey });
      return;
    }
    // Sem UUID conhecido → logout pela própria instância (token).
    await this.request('DELETE', '/instance/logout', { apikey: this.instanceKey(instancia) });
  }

  // ---- Sem equivalente GO → DEGRADAM (a GO não expõe estes fetches) ----

  async findContacts(_instanceName: string): Promise<unknown> {
    return []; // GO não tem /contact/list — contatos chegam via evento.
  }

  async findChats(_instanceName: string): Promise<unknown> {
    return []; // GO não tem /chat/list.
  }

  async findMessages(_instanceName: string, _remoteJid: string, _count?: number): Promise<unknown> {
    return []; // GO não expõe fetch de histórico por chat (histórico vem no sync).
  }

  async fetchProfilePictureUrl(_instancia: string, _jid: string): Promise<string | null> {
    return null; // GO não expõe fetch de foto de perfil nesta superfície.
  }

  async getBase64FromMediaMessage(
    _instanceName: string,
    _key: { id: string; remoteJid: string; fromMe: boolean },
  ): Promise<{ base64: string; mimetype?: string }> {
    // A GO entrega a mídia em base64 INLINE no evento (Message.base64). Baixar por
    // `key` não se aplica: o consumidor deve ler o base64 do próprio evento.
    throw new Error(
      'EvolutionGoAdapter.getBase64FromMediaMessage: GO entrega mídia base64 inline no evento — não baixar por key',
    );
  }
}
