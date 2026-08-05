-- Seed de VALIDAÇÃO do loop GO→painel→n8n (Fase 0, "terminar os testes antes").
-- Objetivo: deixar a instância GO de teste (nexus_teste, JÁ pareada e validada no
-- passo 8) 100% testável PELO PAINEL, reusando o workflow n8n do vtdryfit como
-- downstream — pra medir a latência (ligar GO_LATENCY=true no nexus-api).
--
-- Rodar MANUALMENTE no Postgres de prod, com aval do Rafa. Substituir:
--   :instancia        -> instância GO de teste no registry (default 'nexus_teste')
--   :vtdryfit_n8n_url -> URL do WEBHOOK n8n do vtdryfit (o mesmo que o tenant
--                        vtdryfit já usa hoje) — é o "reuse" do workflow com IA.
--   :test_email       -> e-mail de login no painel. NÃO reutilizar um e-mail que
--                        já acessa OUTRA instância (regra "um e-mail = uma
--                        instância" torna o login não-determinístico).
--
-- ⚠️ DEPENDÊNCIA DE ROTEAMENTO DE RESPOSTA (ler antes de rodar):
--   Isto cabeia só o SENTIDO DE IDA (GO→painel→n8n): mensagens que chegam na
--   nexus_teste são reencaminhadas ao n8n do vtdryfit. A VOLTA (a resposta da IA)
--   só cai na conversa da nexus_teste se o WORKFLOW do vtdryfit responder pela
--   `instance` do PAYLOAD (instance-aware). Se ele tiver a instância/numero
--   HARDCODED, a IA responde no número do vtdryfit, não no da nexus_teste — aí o
--   ajuste é no n8n (ler docs/n8n-workflow-atual.md), não no painel.

-- 1) Aponta o forward da nexus_teste pro n8n do vtdryfit + garante o canal GO.
--    (gateway/transport já devem estar 'go'/'amqp' pelo seed 2.3-go-tenant.sql;
--    reforçado aqui de forma idempotente.)
UPDATE tenants
   SET n8n_webhook_url = :vtdryfit_n8n_url,
       gateway         = 'go',
       transport       = 'amqp'
 WHERE instancia = :instancia;

-- 2) Usuário de acesso ao painel do tenant de teste (login por e-mail, sem senha).
--    role 'admin' (o painel usa admin | operator). Idempotente pela unique
--    (instancia, email).
INSERT INTO tenant_users (id, instancia, email, role)
VALUES (gen_random_uuid(), :instancia, :test_email, 'admin')
ON CONFLICT (instancia, email) DO NOTHING;

-- 3) Conferência (rodar e checar):
--    SELECT instancia, gateway, transport, n8n_webhook_url FROM tenants
--     WHERE instancia = :instancia;
--    SELECT email, role FROM tenant_users WHERE instancia = :instancia;
