/**
 * Translação do CORPO da mensagem GO (Evolution GO / whatsmeow) → shape que os
 * consumidores do painel esperam (Evolution Node / Baileys). É o gate de
 * "impedância de shape v1↔GO" (Fase 0, passo 7 #3): sem isto, o casing whatsmeow
 * (`URL`, `PTT`, `Seconds`, `Waveform`) atravessa opaco e o painel/proxy leem
 * `undefined` onde esperavam `url`, `ptt`, `seconds`.
 *
 * ONDE isto vive (e por quê): AQUI, no normalizer GO de @nexus/shared. O trabalho
 * do normalizer É fazer a GO parecer com o shape Node que TODOS os consumidores
 * (WebhookService, parser do painel, N8N) já entendem. Espalhar o rename no
 * consumer/boundary vazaria conhecimento de whatsmeow para camadas que são, por
 * design, agnósticas ao gateway. Função PURA, travada pela tabela dourada.
 *
 * O que a whatsmeow entrega DIFERENTE do Baileys (capturado na Fase 0, número de
 * teste — só a ESTRUTURA/casing é real; valores são sintéticos por LGPD):
 *   • Nós de mídia (`imageMessage`/`audioMessage`/`videoMessage`/`documentMessage`/
 *     `stickerMessage`) vêm com o casing do proto whatsmeow: `URL` (não `url`),
 *     `PTT` (não `ptt`), `Seconds`, `Waveform`, `FileLength`, `Mimetype`, etc.
 *   • A mídia recebida vem em base64 INLINE em `Message.base64` — a Node baixa via
 *     `getBase64FromMediaMessage`. No caminho GO o painel NÃO deve baixar por key
 *     (o adapter GO lança de propósito): o base64 já está no evento.
 *   • Texto (`conversation`), `extendedTextMessage`, `reactionMessage`,
 *     `messageContextInfo` já batem com o Baileys → passam opacos.
 *
 * ⚠️ LIMITE CONHECIDO (validar ao vivo na Fase 0): o rename é RASO. Nos payloads
 * capturados, o `contextInfo` DENTRO de um nó de mídia já veio minúsculo
 * (`imageMessage.contextInfo`), então a citação/reply funciona. SE a whatsmeow
 * title-casear o interior do contextInfo em mídia (ex.: `StanzaID`/`QuotedMessage`
 * numa RESPOSTA com imagem), o `extractQuoted` do painel (que lê `stanzaId`/
 * `quotedMessage` minúsculo) perderia a citação — aí este rename precisaria
 * recursar no `contextInfo`. Capturar uma resposta-com-mídia real para confirmar.
 */

/**
 * Renomeia as chaves de um nó de mídia do casing whatsmeow para o casing Baileys
 * que o painel lê. Só toca nas chaves conhecidas; o resto do objeto passa intacto
 * (o painel só lê estas). Idempotente: se a chave já vier minúscula (ex.: `url`),
 * não sobrescreve.
 *
 * Mapa das chaves que o painel/proxy consomem hoje (webhook.service:
 * `extractMedia`/`extractContent`, e o proxy de mídia): `mimetype`, `url`,
 * `caption`, `fileName`, `seconds`, `ptt`, `mediaKey`, `fileSha256`,
 * `fileEncSha256`, `directPath`, `mediaKeyTimestamp`.
 */
const MEDIA_KEY_RENAME: Record<string, string> = {
  URL: 'url',
  PTT: 'ptt',
  Seconds: 'seconds',
  Waveform: 'waveform',
  Mimetype: 'mimetype',
  Caption: 'caption',
  FileName: 'fileName',
  FileLength: 'fileLength',
  FileSHA256: 'fileSha256',
  FileEncSHA256: 'fileEncSha256',
  MediaKey: 'mediaKey',
  DirectPath: 'directPath',
  MediaKeyTimestamp: 'mediaKeyTimestamp',
  Height: 'height',
  Width: 'width',
  JPEGThumbnail: 'jpegThumbnail',
  ContextInfo: 'contextInfo',
};

/** Nós de mídia cujo casing interno a whatsmeow title-caseia (proto). */
const MEDIA_NODES = new Set([
  'imageMessage',
  'audioMessage',
  'videoMessage',
  'documentMessage',
  'stickerMessage',
]);

/**
 * Renomeia as chaves conhecidas de UM nó de mídia (raso). Preserva chaves não
 * mapeadas. Colisão de grafias (whatsmeow + Baileys no MESMO nó) não acontece em
 * payload real — a whatsmeow emite só uma grafia por campo. Como defesa, a
 * PRIMEIRA grafia enumerada vence (não sobrescreve um alvo já preenchido); a
 * ordem de enumeração é a de inserção do objeto, então não há garantia de que a
 * grafia Baileys ganhe — é inócuo justamente porque as duas nunca coexistem.
 */
function renameMediaNode(node: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node)) {
    const target = MEDIA_KEY_RENAME[k] ?? k;
    // Primeira grafia enumerada vence: não sobrescreve um alvo já preenchido.
    if (target in out && out[target] !== undefined) continue;
    out[target] = v;
  }
  return out;
}

/**
 * Normaliza o corpo `Message` da GO para o shape Baileys. Devolve um NOVO objeto
 * (não muta a entrada). Só reescreve os nós de mídia; texto/reação/sticker-vazio/
 * contextInfo e quaisquer campos desconhecidos passam opacos. O `base64` inline
 * é preservado no topo do corpo (o consumer lê dali em vez de baixar por key).
 */
export function normalizeGoMessageBody(
  message: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(message)) {
    if (MEDIA_NODES.has(field) && value && typeof value === 'object' && !Array.isArray(value)) {
      out[field] = renameMediaNode(value as Record<string, unknown>);
    } else {
      // base64 inline, conversation, extendedTextMessage, reactionMessage,
      // messageContextInfo, etc. → passthrough opaco.
      out[field] = value;
    }
  }
  return out;
}
