-- Seed de um tenant GO (piloto — §4.6 "seed via SQL; UI fora de escopo").
-- Rodar MANUALMENTE, com aval do Rafa, DEPOIS de capturar instanceId/ownerJid na
-- Fase 0 (número pareado na Evolution GO). A chave canônica (:instancia) é o NOME
-- do painel/registry (ex.: 'Shkgroup'), NUNCA o UUID da GO.
--
-- Substituir os placeholders:
--   :instancia  -> nome canônico do tenant no registry (ex.: 'Shkgroup')
--   :go_uuid    -> instanceId (UUID) da instância na Evolution GO
--   :owner_jid  -> JID do dono (ex.: '5511999999999@s.whatsapp.net')

-- 1) Config do engine (instanceId + ownerJid entram no jsonb; cfg_version bumpa no conflito).
INSERT INTO tenant_engine_config (instancia, config, cfg_version)
VALUES (
  :instancia,
  jsonb_build_object('instanceId', :go_uuid, 'ownerJid', :owner_jid),
  1
)
ON CONFLICT (instancia) DO UPDATE
  SET config      = EXCLUDED.config,
      cfg_version = tenant_engine_config.cfg_version + 1,
      updated_at  = now();

-- 2) Flip do gateway/transport — o registry é a fonte ÚNICA (§4.6/D7).
-- SÓ no cutover (§7.1), com aval, após re-parear o chip na GO. Deixado comentado
-- de propósito: rodar separado, na janela curta fora de horário.
-- UPDATE tenants SET gateway = 'go', transport = 'amqp' WHERE instancia = :instancia;
