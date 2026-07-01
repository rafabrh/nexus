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

  // ---- isHot flag ----

  isHot: (inst: string, jid: string) =>
    `chat:${inst}:${jid}:isHot`,

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
