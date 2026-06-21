CREATE TABLE "conversations" (
	"instancia" text NOT NULL,
	"jid" text NOT NULL,
	"phone" text NOT NULL,
	"contact_name" text,
	"stage" text DEFAULT 'S0' NOT NULL,
	"payment_status" text,
	"is_hot" boolean DEFAULT false NOT NULL,
	"optout" boolean DEFAULT false NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"human_control_until" timestamp with time zone,
	"last_message_preview" text,
	"last_activity" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversations_instancia_jid_pk" PRIMARY KEY("instancia","jid")
);
--> statement-breakpoint
CREATE TABLE "quick_replies" (
	"id" text PRIMARY KEY NOT NULL,
	"instancia" text NOT NULL,
	"name" text NOT NULL,
	"content" text NOT NULL,
	"shortcut" text
);
--> statement-breakpoint
CREATE TABLE "reminders" (
	"id" text PRIMARY KEY NOT NULL,
	"instancia" text NOT NULL,
	"jid" text NOT NULL,
	"text" text NOT NULL,
	"trigger_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_users" (
	"id" text PRIMARY KEY NOT NULL,
	"instancia" text NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"instancia" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"connection_state" text,
	"sync_status" text,
	"connected_at" timestamp with time zone,
	"n8n_webhook_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenant_users" ADD CONSTRAINT "tenant_users_instancia_tenants_instancia_fk" FOREIGN KEY ("instancia") REFERENCES "public"."tenants"("instancia") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_conv_tenant_activity" ON "conversations" USING btree ("instancia","last_activity");--> statement-breakpoint
CREATE INDEX "ix_conv_tenant_stage" ON "conversations" USING btree ("instancia","stage");--> statement-breakpoint
CREATE INDEX "ix_conv_tenant_hot" ON "conversations" USING btree ("instancia","is_hot");--> statement-breakpoint
CREATE INDEX "ix_quickreply_tenant" ON "quick_replies" USING btree ("instancia");--> statement-breakpoint
CREATE INDEX "ix_reminder_due" ON "reminders" USING btree ("status","trigger_at");--> statement-breakpoint
CREATE INDEX "ix_reminder_tenant" ON "reminders" USING btree ("instancia");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_user_email_tenant" ON "tenant_users" USING btree ("instancia","email");--> statement-breakpoint
CREATE INDEX "ix_user_email" ON "tenant_users" USING btree ("email");