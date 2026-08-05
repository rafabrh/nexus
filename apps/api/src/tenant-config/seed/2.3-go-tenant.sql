-- Seed de um tenant GO (piloto — §4.6 "seed via SQL; UI fora de escopo").
-- Rodar MANUALMENTE, com aval do Rafa, DEPOIS de capturar instanceId/ownerJid/
-- instanceToken na Fase 0 (número pareado na Evolution GO). A chave canônica
-- (:instancia) é o NOME do painel/registry (ex.: 'Shkgroup' ou 'nexus_teste'),
-- NUNCA o UUID da GO e SEM hífen/':' (o registry valida /^[a-zA-Z0-9_]+$/ e o
-- nome vira segmento de chave Redis — hífen quebra o EventTranslator).
--
-- Substituir os placeholders:
--   :instancia      -> nome canônico do tenant no registry (ex.: 'nexus_teste')
--   :go_uuid        -> instanceId (UUID) da instância na Evolution GO
--   :owner_jid      -> JID do dono (ex.: '5511999999999@s.whatsapp.net')
--   :instance_token -> token (apikey) da instância GO (envio pelo EvolutionGoAdapter)

-- 0) Garante o tenant no registry (FK de tenant_engine_config -> tenants). Para um
--    tenant NOVO de teste; um tenant de PROD (ex.: Shkgroup) já existe, então este
--    INSERT é no-op. `gateway='go'`/`transport='amqp'` já entram aqui p/ o número
--    de TESTE (num cutover de PROD, ver o passo 2, na janela curta).
INSERT INTO tenants (instancia, name, active, gateway, transport)
VALUES (:instancia, :instancia, true, 'go', 'amqp')
ON CONFLICT (instancia) DO NOTHING;

-- 1) Config do engine: instanceId + ownerJid + instanceToken entram no jsonb;
--    cfg_version bumpa no conflito (o reconcile detecta o drift e re-hidrata).
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
  SET config      = EXCLUDED.config,
      cfg_version = tenant_engine_config.cfg_version + 1,
      updated_at  = now();

-- 2) Flip do gateway/transport de um tenant de PRODUÇÃO — o registry é a fonte
--    ÚNICA (§4.6/D7). SÓ no cutover (§7.1), com aval, após re-parear o chip na GO.
--    (Para o tenant de TESTE, o passo 0 acima já deixou gateway='go'.) Deixado
--    comentado de propósito: rodar separado, na janela curta fora de horário.
-- UPDATE tenants SET gateway = 'go', transport = 'amqp' WHERE instancia = :instancia;

-- 3) (Opcional) Usuário de acesso ao painel do tenant de TESTE. Use um e-mail que
--    NÃO seja usuário de outra instância (a regra "um e-mail = uma instância" torna
--    o login não-determinístico se o mesmo e-mail acessar duas). NÃO reutilize o
--    e-mail de acesso do tenant de produção.
-- INSERT INTO tenant_users (id, instancia, email, role)
-- VALUES (gen_random_uuid(), :instancia, :test_email, 'admin')
-- ON CONFLICT DO NOTHING;
