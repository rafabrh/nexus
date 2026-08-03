/**
 * Superfície de saída do gateway WhatsApp (§4.3). Extraída do `EvolutionClient`
 * atual: os métodos públicos, com assinaturas idênticas, viram um port que os
 * adapters `node` (Evolution REST) e `go` (Evolution GO) devem implementar. Um
 * router (o próprio `EvolutionClient`) escolhe o adapter por instância.
 */
export interface EvolutionGateway {
  sendTextMessage(
    instancia: string,
    jid: string,
    text: string,
    quoted?: { id: string; text?: string },
  ): Promise<Record<string, unknown>>;

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
  ): Promise<Record<string, unknown>>;

  sendWhatsAppAudio(
    instancia: string,
    jid: string,
    audio: string,
  ): Promise<Record<string, unknown>>;

  sendContact(
    instancia: string,
    jid: string,
    contact: { fullName: string; phoneNumber: string; organization?: string; email?: string },
  ): Promise<Record<string, unknown>>;

  sendLocation(
    instancia: string,
    jid: string,
    loc: { latitude: number; longitude: number; name?: string; address?: string },
  ): Promise<Record<string, unknown>>;

  healthCheck(): Promise<void>;

  fetchInstances(): Promise<unknown[]>;

  getConnectionState(instancia: string): Promise<Record<string, unknown>>;

  probeState(
    instancia: string,
  ): Promise<{ status: 'exists'; state: string } | { status: 'absent' } | { status: 'unknown' }>;

  findContacts(instanceName: string): Promise<unknown>;

  fetchProfilePictureUrl(instancia: string, jid: string): Promise<string | null>;

  findMessages(instanceName: string, remoteJid: string, count?: number): Promise<unknown>;

  getBase64FromMediaMessage(
    instanceName: string,
    key: { id: string; remoteJid: string; fromMe: boolean },
  ): Promise<{ base64: string; mimetype?: string }>;

  findChats(instanceName: string): Promise<unknown>;

  createInstance(instanceName: string, webhookUrl?: string): Promise<Record<string, unknown>>;

  getQrCode(instancia: string): Promise<{ base64: string; code: string }>;

  deleteInstance(instancia: string): Promise<void>;
}

/** Token de DI para o adapter node (Evolution REST/Baileys). */
export const EVOLUTION_GATEWAY_NODE = 'EVOLUTION_GATEWAY_NODE';
/** Token de DI para o adapter go (Evolution GO/whatsmeow). */
export const EVOLUTION_GATEWAY_GO = 'EVOLUTION_GATEWAY_GO';
