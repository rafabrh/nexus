-- Cutover de PRODUÇÃO do tenant do sócio (vtdryfit): Evolution Node -> Evolution GO.
-- Modelado no 2.3-go-tenant.sql, mas para um tenant que JÁ EXISTE e JÁ ATENDE
-- prod hoje (Node + n8n + painel). Aqui NÃO se cria tenant: só seeda a config GO
-- (J1) e faz o FLIP do gateway (J2). O runbook completo (pré-reqs, n8n, logout do
-- Node, verificação, rollback) está em docs/RUNBOOK-cutover-vtdryfit-go.md.
--
-- Rodar MANUALMENTE no Postgres de prod, com aval do Rafa, DENTRO DA JANELA.
--
-- ⚠️ ANTES de rodar (pré-requisitos P2/P3 do runbook):
--   - a EvoGO já pareada no número do sócio (companion ADICIONAL; Node ainda vivo);
--   - :go_uuid CONFIRMADO AO VIVO via /instance/all (o identificador anotado antes
--     tinha formato de UUID INCOMPLETO — não seedar de memória);
--   - :instance_token capturado (é a apikey da instância GO, usada no envio).
--
-- Placeholders (psql -v var=... OU substituição manual):
--   :instancia      -> nome canônico do tenant no registry. PROVÁVEL 'vtdryfit',
--                      mas CONFIRME com a query de descoberta (passo 0). Regra do
--                      registry: /^[a-zA-Z0-9_]+$/ — sem hífen/':'.
--   :go_uuid        -> instanceId (UUID) da instância na Evolution GO.
--   :owner_jid      -> JID do dono, ex.: '5511999999999@s.whatsapp.net'.
--   :instance_token -> token (apikey) da instância GO.

-- ============================================================================
-- 0) DESCOBERTA — confirmar o nome canônico e o estado ATUAL (não muda nada).
--    Rode e confira: gateway DEVE estar 'node' e n8n_webhook_url preenchido.
-- ============================================================================
--   SELECT instancia, name, active, gateway, transport, n8n_webhook_url
--     FROM tenants
--    WHERE instancia ILIKE '%vtdryfit%' OR name ILIKE '%vtdryfit%';

-- ============================================================================
-- J1) SEED da config do engine (FORA ou no início da janela — ainda NÃO migra).
--     Enquanto gateway continuar 'node', o store NÃO hidrata gateway/UUID/creds
--     (hydrate ignora quem não é 'go'), então o consumer DROPA os eventos GO com
--     segurança. Seedar a config aqui é inócuo até o flip do J2.
-- ============================================================================
INSERT INTO tenant_engine_config (instancia, config, cfg_version)
VALUES (
  :instancia,
  jsonb_build_object(
    'instanceId',    :go_uuid,
    'ownerJid',      :owner_jid,
    'instanceToken', :instance_token
  ),
  1
)
ON CONFLICT (instancia) DO UPDATE
  SET config      = tenant_engine_config.config
                      || jsonb_build_object(
                           'instanceId',    :go_uuid,
                           'ownerJid',      :owner_jid,
                           'instanceToken', :instance_token
                         ),
      cfg_version = tenant_engine_config.cfg_version + 1,
      updated_at  = now();

-- ============================================================================
-- J2) FLIP do gateway/transport — ESTE é o cutover. Rodar SÓ na janela curta,
--     logo antes do logout do companion Node (J4 do runbook). Após o próximo
--     reconcile (<= TENANT_CFG_RECONCILE_SEC, default 60s) OU restart do
--     nexus-api, o store hidrata gateway='go' + UUID->instancia + creds:
--       - o consumer passa a rotear os eventos da fila GO para este tenant;
--       - o router de saída do painel passa a enviar via EvolutionGoAdapter.
-- ============================================================================
UPDATE tenants
   SET gateway = 'go', transport = 'amqp'
 WHERE instancia = :instancia;

-- ============================================================================
-- VERIFICAÇÃO (rodar após o reconcile/restart):
-- ============================================================================
--   SELECT instancia, gateway, transport FROM tenants WHERE instancia = :instancia;
--   SELECT instancia, cfg_version, config FROM tenant_engine_config WHERE instancia = :instancia;
--   -- No Redis: a chave tenant:cfg:<instancia> deve refletir instanceId/ownerJid.
--   -- Nos logs do nexus-api: NÃO deve haver o erro CRITICAL de ISOLAMENTO
--   --   ("instanceId ... mapeado para múltiplos tenants") — se houver, o UUID
--   --   colide com outro tenant e o roteamento fica DESABILITADO (corrigir o seed).

-- ============================================================================
-- ROLLBACK (se a GO vacilar — ver R1..R4 no runbook). Reverte o flip; o histórico
-- do painel é preservado (mesmo tenant). Reverter o envio do n8n e re-parear o
-- companion Node também (fora do SQL).
-- ============================================================================
--   UPDATE tenants SET gateway = 'node', transport = 'webhook' WHERE instancia = :instancia;
