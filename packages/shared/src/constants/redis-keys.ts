export const RedisKeys = {
  // ---- Chaves de conversa (N8N + BFF leem/escrevem) ----

  humanControlUntil: (inst: string, jid: string) =>
    `chat:${inst}:${jid}:humanControlUntil`,

  paymentStatus: (inst: string, jid: string) =>
    `chat:${inst}:${jid}:paymentStatus`,

  followupStep: (inst: string, jid: string) =>
    `chat:${inst}:${jid}:followup_step`,

  notas: (inst: string, jid: string) =>
    `chat:${inst}:${jid}:notas`,

  tags: (inst: string, jid: string) =>
    `chat:${inst}:${jid}:tags`,

  optout: (inst: string, jid: string) =>
    `chat:${inst}:${jid}:optout`,

  state: (inst: string, jid: string) =>
    `chat:${inst}:${jid}:state`,

  buffer: (inst: string, jid: string) =>
    `chat:${inst}:${jid}:buffer`,

  processing: (inst: string, jid: string) =>
    `chat:${inst}:${jid}:processing`,

  // ---- Historico LangChain (N8N escreve, BFF le) ----
  // IMPORTANT: phone = digits only, WITHOUT @s.whatsapp.net
  // N8N stores as chathistory:{instance}-{phone}

  chatHistory: (inst: string, phone: string) =>
    `chathistory:${inst}-${phone}`,

  // ---- Contato (namespaced por instancia — BFF popula e le a sua chave) ----
  // O N8N escreve a chave global `contact:{phone}`, mas o BFF NAO depende dela:
  // mantem a sua propria chave `contact:{inst}:{phone}` para isolar PII por tenant.

  contact: (inst: string, phone: string) =>
    `contact:${inst}:${phone}`,

  // Chave GLOBAL legada que o N8N popula (`contact:{phone}`, sem instância). O
  // BFF a lê APENAS como fallback de nome/foto para contatos históricos que ainda
  // não passaram pelo namespacing por tenant. Nunca escreve nela.
  contactGlobalLegacy: (phone: string) =>
    `contact:${phone}`,

  // ---- BFF exclusivo ----

  eventStream: (inst: string) =>
    `events:${inst}`,

  tenantRegistry: () =>
    'tenant:registry',

  sessionBlacklist: (jti: string) =>
    `session:blacklist:${jti}`,

  magicLink: (token: string) =>
    `magiclink:${token}`,

  // Anti-spam de reenvio (minimizacao LGPD): enquanto esta chave curta existir,
  // sendMagicLink NAO dispara outro email para o mesmo endereco. Evita lotar a
  // caixa do cliente quando ele reclica "enviar link". Token = UUID, nunca
  // colide com o segmento literal `cooldown:`.
  magicLinkCooldown: (email: string) =>
    `magiclink:cooldown:${email}`,

  idempotency: (reqId: string) =>
    `idempotency:${reqId}`,

  // Dedup do reencaminhamento pro N8N: a Evolution reenvia o webhook em retries;
  // esta chave (SET NX, TTL curto) garante que a MESMA mensagem so e reencaminhada
  // uma vez — a IA nunca responde 2x por causa de retry de webhook.
  n8nForwardDedup: (inst: string, msgId: string) =>
    `n8n:fwd:${inst}:${msgId}`,

  // ---- isHot flag ----

  isHot: (inst: string, jid: string) =>
    `chat:${inst}:${jid}:isHot`,

  // ---- Contador de nao-lidas (BFF exclusivo) ----
  // Incrementado a cada mensagem RECEBIDA do cliente (fromMe=false); zerado
  // quando o operador abre a conversa (markRead). O N8N nao conhece esta chave.
  unread: (inst: string, jid: string) =>
    `chat:${inst}:${jid}:unread`,

  // ---- Reminders ----

  reminder: (inst: string, id: string) =>
    `reminder:${inst}:${id}`,

  reminders: (inst: string) =>
    `reminders:${inst}`,

  // ---- Quick Replies ----

  quickReplies: (inst: string) =>
    `quickreplies:${inst}`,

  // ---- Onboarding / Instance state ----

  instanceState: (inst: string) =>
    `instanceState:${inst}`,

  syncStatus: (inst: string) =>
    `syncStatus:${inst}`,

  // Throttle marker: limits how often getState() re-probes the Evolution API
  // for a given instance (TTL key — present means "probed recently").
  instanceProbeAt: (inst: string) =>
    `instanceProbeAt:${inst}`,

  // ---- Cache (TTL-based, invalidated by webhook) ----

  cacheConversations: (inst: string) =>
    `cache:conversations:${inst}`,

  cacheDashboard: (inst: string) =>
    `cache:dashboard:${inst}`,

  cacheContacts: (inst: string) =>
    `cache:contacts:${inst}`,

  // ---- Conversation discovery index (BFF maintains, list reads) ----

  conversationIndex: (inst: string) =>
    `conversas:${inst}`,
} as const;
