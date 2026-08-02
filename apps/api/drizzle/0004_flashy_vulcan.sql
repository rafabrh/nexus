CREATE TABLE "messages" (
	"seq" bigserial NOT NULL,
	"instancia" text NOT NULL,
	"jid" text NOT NULL,
	"msg_id" text NOT NULL,
	"from_me" boolean DEFAULT false NOT NULL,
	"type" text,
	"content" text,
	"media_kind" text,
	"media_id" text,
	"media_mimetype" text,
	"quoted" jsonb,
	"ts" timestamp with time zone,
	"raw" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messages_instancia_jid_msg_id_pk" PRIMARY KEY("instancia","jid","msg_id")
);
--> statement-breakpoint
CREATE INDEX "ix_msg_conv_seq" ON "messages" USING btree ("instancia","jid","seq");