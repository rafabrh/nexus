import { Injectable, Inject, ConflictException, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { DB, type Database } from '../core/db/db.module';
import { tenants, tenantUsers } from '../core/db/schema';
import type { TenantEntry, TenantUser } from '@nexus/shared';
import type { TenantRow, TenantUserRow } from '../core/db/schema';

/**
 * Acesso a tenants sobre Postgres. Substitui o read-modify-write do blob
 * `tenant:registry`. Cada mutação é uma operação por linha com garantias do
 * banco (PK, unique, FK) — a race de lost-update do blob deixa de existir por
 * construção, sem lock aplicativo.
 */
@Injectable()
export class TenantRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  private toEntry(row: TenantRow, users: TenantUserRow[]): TenantEntry {
    return {
      instancia: row.instancia,
      name: row.name,
      active: row.active,
      users: users.map((u) => ({ email: u.email, role: u.role as TenantUser['role'] })),
      createdAt: row.createdAt.toISOString(),
      connectionState: (row.connectionState ?? undefined) as TenantEntry['connectionState'],
      syncStatus: (row.syncStatus ?? undefined) as TenantEntry['syncStatus'],
      connectedAt: row.connectedAt?.toISOString(),
      n8nWebhookUrl: row.n8nWebhookUrl ?? undefined,
    };
  }

  private async usersByInstancias(instancias: string[]): Promise<Map<string, TenantUserRow[]>> {
    const map = new Map<string, TenantUserRow[]>();
    if (instancias.length === 0) return map;
    const rows = await this.db
      .select()
      .from(tenantUsers)
      .where(inArray(tenantUsers.instancia, instancias));
    for (const u of rows) {
      const list = map.get(u.instancia) ?? [];
      list.push(u);
      map.set(u.instancia, list);
    }
    return map;
  }

  async list(): Promise<TenantEntry[]> {
    const rows = await this.db.select().from(tenants);
    const usersMap = await this.usersByInstancias(rows.map((r) => r.instancia));
    return rows.map((r) => this.toEntry(r, usersMap.get(r.instancia) ?? []));
  }

  async get(instancia: string): Promise<TenantEntry | null> {
    const [row] = await this.db.select().from(tenants).where(eq(tenants.instancia, instancia));
    if (!row) return null;
    const users = await this.db.select().from(tenantUsers).where(eq(tenantUsers.instancia, instancia));
    return this.toEntry(row, users);
  }

  /** Login: resolve email -> tenant via índice ix_user_email (O(log n)). */
  async findByEmail(email: string): Promise<TenantEntry | null> {
    const normalized = email.toLowerCase();
    const [hit] = await this.db
      .select({ instancia: tenantUsers.instancia })
      .from(tenantUsers)
      .where(eq(tenantUsers.email, normalized))
      .limit(1);
    if (!hit) return null;
    return this.get(hit.instancia);
  }

  async register(instancia: string, adminEmail: string): Promise<TenantEntry> {
    const normalized = adminEmail.toLowerCase().trim();

    // ISOLAMENTO: o nome da instância é usado como segmento de chave Redis
    // (chathistory:{inst}-{phone} e chat:{inst}:{jid}). Um '-' ou ':' no nome
    // quebra o parsing do EventTranslator e roteia eventos realtime para o tenant
    // errado. Defense-in-depth além do RegisterTenantDto (cobre o dev-seed).
    if (!/^[a-zA-Z0-9_]+$/.test(instancia)) {
      throw new BadRequestException(
        `Instancia '${instancia}' invalida: use apenas letras, numeros e underscore (sem '-' nem ':').`,
      );
    }

    // ISOLAMENTO CROSS-TENANT: nunca anexar um responsável a um tenant que já
    // pertence a outro. register() continua idempotente para o MESMO dono
    // (re-registro), mas se a instância já existe e este email NÃO é um de seus
    // usuários, recusamos. Sem esta guarda, registrar um "novo assinante" com um
    // nome de instância que colide com um cliente existente daria ao novo email
    // acesso de admin às conversas/contatos do cliente antigo.
    const existing = await this.get(instancia);
    if (existing && !existing.users.some((u) => u.email.toLowerCase() === normalized)) {
      throw new ConflictException(
        `Instancia '${instancia}' ja esta registrada para outro responsavel`,
      );
    }

    await this.db.transaction(async (tx) => {
      await tx
        .insert(tenants)
        .values({ instancia, name: instancia, active: true })
        .onConflictDoNothing();
      await tx
        .insert(tenantUsers)
        .values({ id: randomUUID(), instancia, email: normalized, role: 'admin' })
        .onConflictDoNothing(); // uq_user_email_tenant — idempotente
    });
    // get() nunca é null aqui: o tenant existe (recém-criado ou já existente).
    return (await this.get(instancia))!;
  }

  async setActive(instancia: string, active: boolean): Promise<TenantEntry | null> {
    const res = await this.db
      .update(tenants)
      .set({ active })
      .where(eq(tenants.instancia, instancia))
      .returning({ instancia: tenants.instancia });
    if (res.length === 0) return null;
    return this.get(instancia);
  }

  /**
   * Grava (ou limpa, com null) a URL do webhook do fluxo N8N do tenant. É esta
   * URL que o WebhookService usa para reencaminhar o payload cru — sem ela, a
   * instância sobe sem IA. UPDATE por linha, mesmo padrão do setActive.
   */
  async setN8nWebhookUrl(instancia: string, url: string | null): Promise<TenantEntry | null> {
    const res = await this.db
      .update(tenants)
      .set({ n8nWebhookUrl: url })
      .where(eq(tenants.instancia, instancia))
      .returning({ instancia: tenants.instancia });
    if (res.length === 0) return null;
    return this.get(instancia);
  }

  async addUser(instancia: string, user: TenantUser): Promise<TenantEntry | null> {
    const exists = await this.get(instancia);
    if (!exists) return null;
    await this.db
      .insert(tenantUsers)
      .values({
        id: randomUUID(),
        instancia,
        email: user.email.toLowerCase().trim(),
        role: user.role,
      })
      .onConflictDoNothing(); // race eliminada: unicidade garantida pelo banco
    return this.get(instancia);
  }

  async removeUser(instancia: string, email: string): Promise<TenantEntry | null> {
    const exists = await this.get(instancia);
    if (!exists) return null;
    await this.db
      .delete(tenantUsers)
      .where(and(eq(tenantUsers.instancia, instancia), eq(tenantUsers.email, email.toLowerCase().trim())));
    return this.get(instancia);
  }

  /**
   * Atualiza estado de conexão/sync. UPDATE por linha — sem RMW de blob, sem
   * sobrescrever cadastro concorrente. Chamado pelo webhook e pelo onboarding.
   */
  async updateState(
    instancia: string,
    patch: { connectionState?: string; syncStatus?: string },
  ): Promise<void> {
    const set: Partial<TenantRow> = {};
    if (patch.connectionState !== undefined) {
      set.connectionState = patch.connectionState;
      if (patch.connectionState === 'open') {
        // só grava connectedAt na primeira conexão
        const [cur] = await this.db
          .select({ connectedAt: tenants.connectedAt })
          .from(tenants)
          .where(eq(tenants.instancia, instancia));
        if (cur && !cur.connectedAt) set.connectedAt = new Date();
      }
    }
    if (patch.syncStatus !== undefined) set.syncStatus = patch.syncStatus;
    if (Object.keys(set).length === 0) return;
    await this.db.update(tenants).set(set).where(eq(tenants.instancia, instancia));
  }
}
