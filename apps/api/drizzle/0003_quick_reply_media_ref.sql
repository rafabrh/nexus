ALTER TABLE "quick_replies" DROP COLUMN "image";--> statement-breakpoint
ALTER TABLE "quick_replies" DROP COLUMN "image_mimetype";--> statement-breakpoint
ALTER TABLE "quick_replies" ADD COLUMN "media_id" text;--> statement-breakpoint
ALTER TABLE "quick_replies" ADD COLUMN "media_type" text;--> statement-breakpoint
ALTER TABLE "quick_replies" ADD COLUMN "media_mimetype" text;--> statement-breakpoint
ALTER TABLE "quick_replies" ADD COLUMN "media_filename" text;--> statement-breakpoint
ALTER TABLE "quick_replies" ADD COLUMN "media_size" integer;
