CREATE TABLE "funnel_stages" (
	"id" text PRIMARY KEY NOT NULL,
	"instancia" text NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"color" text NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "funnel_stages" ADD CONSTRAINT "funnel_stages_instancia_tenants_instancia_fk" FOREIGN KEY ("instancia") REFERENCES "public"."tenants"("instancia") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_funnel_stage_tenant" ON "funnel_stages" USING btree ("instancia");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_funnel_stage_key" ON "funnel_stages" USING btree ("instancia","key");--> statement-breakpoint
-- Seed idempotente: cada tenant existente ganha os 7 estágios default.
-- Keys S0..S6 PRESERVADOS — o N8N do Shkgroup lê/escreve `followup_step` = S0..S6.
-- CROSS JOIN (tenants × defaults) + ON CONFLICT (instancia,key) DO NOTHING torna
-- a rodada segura de repetir e não duplica se um tenant já tiver o estágio.
INSERT INTO "funnel_stages" ("id", "instancia", "key", "label", "color", "order")
SELECT gen_random_uuid()::text, t."instancia", d."key", d."label", d."color", d."order"
FROM "tenants" AS t
CROSS JOIN (
	VALUES
		('S0', 'Primeiro contato', '#6B7280', 0),
		('S1', 'Interesse',        '#3B82F6', 1),
		('S2', 'Descoberta',       '#8B5CF6', 2),
		('S3', 'Apresentacao',     '#F59E0B', 3),
		('S4', 'Proposta',         '#EF4444', 4),
		('S5', 'Negociacao',       '#10B981', 5),
		('S6', 'Fechamento',       '#F97316', 6)
) AS d("key", "label", "color", "order")
ON CONFLICT ("instancia", "key") DO NOTHING;