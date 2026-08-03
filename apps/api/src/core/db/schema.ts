import {
  pgTable,
  text,
  integer,
  timestamp,
  boolean,
  jsonb,
  uniqueIndex,
  index,
  primaryKey,
  bigserial,
} from 'drizzle-orm/pg-core';

/**
 * Postgres é o sistema de registro. O Redis permanece como barramento de
 * integração com o N8N (chaves chathistory:*, followup_step, etc.) e cache.
 *
 * Regra de fronteira: nada aqui substitui uma chave que o N8N escreve. As
 * tabelas `tenants`/`tenant_users` são donas exclusivas do painel; `conversations`
 * é uma PROJEÇÃO durável (write-behind) do estado operacional que vive no Redis.
 */

// ---- Tenants (dono: painel; substitui o blob tenant:registry) ----
export const tenants = pgTable('tenants', {
  instancia: text('instancia').primaryKey(),
  name: text('name').notNull(),
  active: boolean('active').notNull().default(true),
  connectionState: text('connection_state'), // created | open | close | connecting
  syncStatus: text('sync_status'), // pending | syncing | done | error
  connectedAt: timestamp('connected_at', { withTimezone: true }),
  n8nWebhookUrl: text('n8n_webhook_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const tenantUsers = pgTable(
  'tenant_users',
  {
    id: text('id').primaryKey(), // uuid
    instancia: text('instancia')
      .notNull()
      .references(() => tenants.instancia, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: text('role').notNull(), // admin | operator
  },
  (t) => ({
    // Unicidade no banco elimina a race de addUser por construção.
    uqEmailPerTenant: uniqueIndex('uq_user_email_tenant').on(t.instancia, t.email),
    // Login resolve email->tenant em O(log n), não O(n) varrendo um blob.
    byEmail: index('ix_user_email').on(t.email),
  }),
);

// ---- Reminders (dono: painel) ----
export const reminders = pgTable(
  'reminders',
  {
    id: text('id').primaryKey(),
    instancia: text('instancia').notNull(),
    jid: text('jid').notNull(),
    text: text('text').notNull(),
    triggerAt: timestamp('trigger_at', { withTimezone: true }).notNull(),
    createdBy: text('created_by').notNull(),
    status: text('status').notNull().default('pending'), // pending | triggered | dismissed
  },
  (t) => ({
    // Scheduler busca pendentes vencidos sem SCAN: WHERE status='pending' AND trigger_at<=now
    byDue: index('ix_reminder_due').on(t.status, t.triggerAt),
    byTenant: index('ix_reminder_tenant').on(t.instancia),
  }),
);

// ---- Quick replies (dono: painel) ----
export const quickReplies = pgTable(
  'quick_replies',
  {
    id: text('id').primaryKey(),
    instancia: text('instancia').notNull(),
    name: text('name').notNull(),
    content: text('content').notNull(),
    shortcut: text('shortcut'),
    // Referência de mídia opcional (imagem ou vídeo armazenado em disco).
    // O arquivo físico fica no volume gerenciado pelo MediaStorage (DiskMediaStorage).
    mediaId: text('media_id'),
    mediaType: text('media_type'),       // 'image' | 'video'
    mediaMimetype: text('media_mimetype'),
    mediaFilename: text('media_filename'),
    mediaSize: integer('media_size'),
  },
  (t) => ({
    byTenant: index('ix_quickreply_tenant').on(t.instancia),
  }),
);

// ---- Funnel stages (dono: painel; colunas do Kanban por-tenant) ----
// `key` é estável e único por-tenant (slug), NÃO o rótulo: renomear muda só
// `label`; `conversations.stage` e o Redis `followup_step` seguem apontando pro
// `key`, sem reescrever N conversas. Tenants existentes são semeados com os 7
// defaults (keys S0..S6 PRESERVADOS — o N8N do Shkgroup lê/escreve S0..S6).
export const funnelStages = pgTable(
  'funnel_stages',
  {
    id: text('id').primaryKey(), // uuid
    instancia: text('instancia')
      .notNull()
      .references(() => tenants.instancia, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    label: text('label').notNull(),
    color: text('color').notNull(),
    // `order` é palavra reservada no Postgres — o Drizzle emite aspas ("order")
    // automaticamente por o nome da coluna ser exatamente `order`.
    order: integer('order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTenant: index('ix_funnel_stage_tenant').on(t.instancia),
    // Unicidade do slug por-tenant: alvo do onConflict do seed idempotente e
    // garantia de que dois estágios do mesmo tenant nunca colidem de key.
    uqKeyPerTenant: uniqueIndex('uq_funnel_stage_key').on(t.instancia, t.key),
  }),
);

// ---- Conversations (projeção durável do estado operacional do Redis/N8N) ----
// Campos sensíveis ao tempo (aiState via humanControlUntil) são armazenados como
// INPUT bruto e recomputados na LEITURA — assim a projeção não fica stale quando
// um OFF_UNTIL expira sem novo evento que dispare reprojeção.
export const conversations = pgTable(
  'conversations',
  {
    instancia: text('instancia').notNull(),
    jid: text('jid').notNull(),
    phone: text('phone').notNull(),
    contactName: text('contact_name'),
    stage: text('stage').notNull().default('S0'),
    paymentStatus: text('payment_status'),
    isHot: boolean('is_hot').notNull().default(false),
    optout: boolean('optout').notNull().default(false),
    tags: jsonb('tags').$type<string[]>().notNull().default([]),
    humanControlUntil: timestamp('human_control_until', { withTimezone: true }),
    lastMessagePreview: text('last_message_preview'),
    lastActivity: timestamp('last_activity', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Chave primária composta — identidade da projeção e alvo do onConflict do
    // write-behind. PK declarada (não só unique index) para clareza e para não
    // tropeçar em replicação lógica/tooling que exigem PK.
    pk: primaryKey({ columns: [t.instancia, t.jid] }),
    // Lista paginada por tenant sem fan-out de N chaves Redis.
    byTenantActivity: index('ix_conv_tenant_activity').on(t.instancia, t.lastActivity),
    byTenantStage: index('ix_conv_tenant_stage').on(t.instancia, t.stage),
    byTenantHot: index('ix_conv_tenant_hot').on(t.instancia, t.isHot),
  }),
);

// ---- Messages (projeção durável/archive do chathistory Redis; N8N+BFF escrevem o Redis) ----
// Fonte quente = lista Redis chathistory:{inst}-{phone}; esta tabela é o arquivo
// frio COMPLETO. Dedup = (instancia, jid, msgId). Ordenação/paginação = `seq`
// (bigserial, ordem de INSERÇÃO), NÃO `ts` (nullable). O `seq` só é cronológico
// se o BACKFILL preceder o archive incremental — garantido pelo runbook.
// Cold history NÃO rastreia ACK/status ao vivo (YAGNI) — status vem da leitura quente.
export const messages = pgTable(
  'messages',
  {
    seq: bigserial('seq', { mode: 'number' }).notNull(),
    instancia: text('instancia').notNull(),
    jid: text('jid').notNull(),
    msgId: text('msg_id').notNull(),
    fromMe: boolean('from_me').notNull().default(false),
    type: text('type'),
    content: text('content'),
    mediaKind: text('media_kind'),
    mediaId: text('media_id'),
    mediaMimetype: text('media_mimetype'),
    quoted: jsonb('quoted').$type<{ id: string; preview: string; fromMe: boolean } | null>(),
    ts: timestamp('ts', { withTimezone: true }),
    raw: jsonb('raw').$type<unknown>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.instancia, t.jid, t.msgId] }),
    byConversationSeq: index('ix_msg_conv_seq').on(t.instancia, t.jid, t.seq),
  }),
);

export type MessageRow = typeof messages.$inferSelect;

export type TenantRow = typeof tenants.$inferSelect;
export type TenantUserRow = typeof tenantUsers.$inferSelect;
export type ReminderRow = typeof reminders.$inferSelect;
export type QuickReplyRow = typeof quickReplies.$inferSelect;
export type FunnelStageRow = typeof funnelStages.$inferSelect;
export type ConversationRow = typeof conversations.$inferSelect;
