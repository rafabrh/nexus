# Plano de Implantação — NEXUS Panel (produção)

Hospedagem: **EasyPanel** (`b8ul3d.easypanel.host`, IP `158.220.126.187`)
Domínio: **shkgroup.com.br** (DNS na Hostinger)
Branch de deploy: **`worktree-macos-reskin`**

---

## 1. Arquitetura

- **1 deployment multi-tenant** (api + web) serve todos os clientes; cada cliente = 1 instância na Evolution + 1 fluxo N8N + 1 acesso (email/role no JWT `instancia`).
- **Postgres (novo, exclusivo do painel):** tenants, usuários, reminders, quick replies e a projeção durável de conversas. Tabelas criadas no boot via `migrate()`.
- **Redis (COMPARTILHADO com a Evolution/N8N):** o painel lê/escreve as MESMAS chaves do N8N (`chathistory:{instance}-{phone}`, `state`, `followupStep`, …). É assim que conversas/Kanban aparecem.

> ⚠️ **Crítico:** `REDIS_URL` do painel aponta para o **Redis da Evolution/N8N** (`evolution-api-redis`), **não** um Redis novo isolado. O painel habilita `notify-keyspace-events` nesse Redis no boot.

---

## 2. Domínios (criar)

**Não usar `www.shkgroup.com.br`** (é o site). Criar **subdomínios** — DNS Hostinger, registros **A** → `158.220.126.187`:

| Subdomínio | Serviço EasyPanel | Porta interna |
|---|---|---|
| `painel.shkgroup.com.br` | nexus-web | 3000 |
| `api.shkgroup.com.br` | nexus-api | 4000 |

**Banco de dados: SEM domínio público.** Postgres/Redis só na rede interna do EasyPanel (hostname `projeto_servico`). Expor banco = porta de invasão.

No EasyPanel, em cada serviço → aba **Domínios** → adicionar o subdomínio (TLS Let's Encrypt automático).

---

## 3. Serviços no EasyPanel

| Serviço | Tipo | Build |
|---|---|---|
| **nexus-api** | App | GitHub `rafabrh/nexus` (branch `worktree-macos-reskin`), Dockerfile = `/Dockerfile`, contexto = raiz |
| **nexus-web** | App | mesmo repo/branch, Dockerfile = `/Dockerfile.web`, contexto = raiz |
| **nexus-postgres** | Postgres (template) | novo, banco `nexus` |
| **Redis** | — | **REUSAR** o `evolution-api-redis` existente (compartilhado com N8N) |

---

## 4. Variáveis de ambiente — nexus-api

```
NODE_ENV=production
PORT=4000
TRUST_PROXY=1                      # EasyPanel/Traefik = 1 hop; com Cloudflare na frente = 2

# Postgres NOVO (host interno):
DATABASE_URL=postgres://nexus:<SENHA_PG>@<projeto>_nexus-postgres:5432/nexus

# Redis COMPARTILHADO da Evolution/N8N (host interno):
REDIS_URL=redis://:<SENHA_REDIS>@<projeto>_evolution-api-redis:6379
REDIS_PASSWORD=<SENHA_REDIS>

# Segredos — gerar com: openssl rand -base64 48
JWT_SECRET=<64+ chars>
METRICS_TOKEN=<32+ chars>

# Domínios:
CORS_ALLOWED_ORIGINS=https://painel.shkgroup.com.br
MAGIC_LINK_BASE_URL=https://painel.shkgroup.com.br/auth/callback
APP_BASE_URL=https://api.shkgroup.com.br

# Evolution:
EVOLUTION_API_URL=https://n8n-evolution-api.b8ul3d.easypanel.host
EVOLUTION_API_KEY=<chave real da Evolution>

# Email (Resend) — domínio verificado (SPF/DKIM/DMARC):
RESEND_API_KEY=re_xxx
RESEND_FROM=noreply@shkgroup.com.br
ADMIN_EMAIL=rafa@shkgroup.com.br

# Opcionais:
JWT_EXPIRATION_MS=900000
JWT_REFRESH_EXPIRATION_MS=604800000
LOG_LEVEL=info
SHEETS_DOCUMENT_ID=<se usar leads via Sheets>
GOOGLE_SERVICE_ACCOUNT_JSON=<JSON inline ou caminho>
```

> **NÃO** setar `SEED_INSTANCE` em produção.

---

## 5. Variáveis de ambiente — nexus-web

```
NODE_ENV=production
PORT=3000
NEXT_PUBLIC_API_URL=https://api.shkgroup.com.br
```

> ⚠️ `NEXT_PUBLIC_API_URL` é **inlined no BUILD** do Next (o `Dockerfile.web` recebe via `ARG`). Se mudar depois, **rebuild** o web.

---

## 6. Passos de deploy (ordem)

1. Criar subdomínios na Hostinger (passo 2).
2. Criar `nexus-postgres` no EasyPanel.
3. Criar e implantar `nexus-api` (roda `migrate()` no boot → cria tabelas). Conferir log: `NEXUS API listening on port 4000`.
4. Criar e implantar `nexus-web`.
5. Anexar os domínios (TLS) e validar HTTPS.
6. Cadastrar tenant(s) via rota admin (cada cliente = 1 instância Evo + 1 admin email).
7. Webhook da Evolution → `https://api.shkgroup.com.br/webhook/evolution` (header `apikey` = `EVOLUTION_API_KEY`).
   > Não alterar events/settings da Evolution sem confirmar.

---

## 7. Segurança / hardening

Já no código (branch de deploy):
- Rate limit Redis-backed por tenant/usuário; `trustProxy` (vê IP real atrás do proxy).
- WS auth com paridade ao HTTP (rejeita refresh/revogado).
- Guard global **deny-by-default** + `@Public()` só nas rotas públicas.
- Webhook valida `instance ∈ tenants` (anti-spoof com apikey compartilhada).
- Isolamento multi-tenant (salas socket `tenant:{instancia}`, chaves Redis namespeadas).
- Cookies `httpOnly`/`secure`/`sameSite=lax`; JWT HS256 pinado; magic link uso único + TTL 15min + anti-enumeração.
- a11y: reduce-motion / reduce-transparency / increase-contrast.

A configurar na infra:
- **Nunca** expor Postgres/Redis publicamente (só rede interna).
- **Proteger o painel do EasyPanel** (estava em HTTP puro `:3000`) — HTTPS + restrição por IP.
- **Firewall (Hostinger/VPS):** abrir só 80/443; bloquear 3000/4000/5432/6379.
- **Cloudflare na frente** (recomendado): WAF + rate limit de borda + anti-DDoS + esconde IP de origem. Se usar, `TRUST_PROXY=2`.
- `NODE_ENV=production` (ativa cookie `secure`, desliga seed, gate de `/metrics`).
- Segredos fortes; rotacionar qualquer secret que tenha vazado.

---

## 8. Notas

- **Magic link + scanners de email:** SafeLinks/antivírus podem consumir o link de uso único (GET) antes do clique → "token inválido". Mitigar com etapa de confirmação por POST se aparecer com clientes corporativos.
- **Resend:** verificar `shkgroup.com.br` (SPF/DKIM/DMARC) ou o magic link cai em spam/não chega.
- **Backup:** o RDB/AOF no volume não é backup off-host; sincronizar snapshots para object storage.
