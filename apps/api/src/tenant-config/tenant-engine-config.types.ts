/**
 * Conteúdo do `config jsonb` de `tenant_engine_config` (§4.6). Aberto por design:
 * o inventário rico (persona/prompt, templates `/tpl`, flags de módulo, timezone,
 * buffer/timeouts, `llmProvider`/`llmModel`/`llmBudgetCap`) fecha na Fase 0 / Etapa 4.
 *
 * A Fatia 2.3 usa só os campos EXIGIDOS pela GO, que a Node não traz no payload:
 *  - `instanceId`: UUID da instância GO (whatsmeow) → reverse map instanceId→instancia.
 *  - `ownerJid`: JID do dono → gate de self-chat / injetado no `sender` do evento GO.
 */
export interface TenantEngineConfig {
  /** UUID da instância GO (whatsmeow). Ausente em tenants Node. */
  instanceId?: string;
  /** JID do dono da instância (gate self-chat; `sender` do evento GO). */
  ownerJid?: string;
}
