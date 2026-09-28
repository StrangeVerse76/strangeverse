ALTER TABLE "records" ADD COLUMN "audio_bytes" integer;--> statement-breakpoint
ALTER TABLE "records" ADD COLUMN "seq" bigserial NOT NULL;--> statement-breakpoint
CREATE INDEX "records_owner_seq" ON "records" USING btree ("owner_id","seq");