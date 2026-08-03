CREATE TABLE "tenant_engine_config" (
	"instancia" text PRIMARY KEY NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"cfg_version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "gateway" text DEFAULT 'node' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "transport" text DEFAULT 'webhook' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_engine_config" ADD CONSTRAINT "tenant_engine_config_instancia_tenants_instancia_fk" FOREIGN KEY ("instancia") REFERENCES "public"."tenants"("instancia") ON DELETE cascade ON UPDATE no action;