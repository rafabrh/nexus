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

  chatHistory: (inst: string, jid: string) =>
    `chathistory:${inst}-${jid}`,

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
} as const;
