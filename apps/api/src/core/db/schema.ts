import {
  pgTable,
  text,
  timestamp,
  boolean,
  jsonb,
  uniqueIndex,
  index,
  primaryKey,
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
  },
  (t) => ({
    byTenant: index('ix_quickreply_tenant').on(t.instancia),
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

export type TenantRow = typeof tenants.$inferSelect;
export type TenantUserRow = typeof tenantUsers.$inferSelect;
export type ReminderRow = typeof reminders.$inferSelect;
export type QuickReplyRow = typeof quickReplies.$inferSelect;
export type ConversationRow = typeof conversations.$inferSelect;
