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

  // ---- Contato (N8N escreve, BFF le) ----

  contact: (phone: string) =>
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
} as const;
