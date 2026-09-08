CREATE TABLE "multipart_uploads" (
	"id" text PRIMARY KEY,
	"managed_bucket_id" text NOT NULL,
	"key" text NOT NULL,
	"upload_id" text NOT NULL,
	"upstream_key" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "part_reservations" (
	"id" text PRIMARY KEY,
	"managed_bucket_id" text NOT NULL,
	"upload_id" text NOT NULL,
	"part_number" integer NOT NULL,
	"size_bytes" bigint DEFAULT 0 NOT NULL,
	"etag" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "multipart_uploads_upload_id_unique" ON "multipart_uploads" ("upload_id");--> statement-breakpoint
CREATE INDEX "multipart_uploads_managedBucketId_idx" ON "multipart_uploads" ("managed_bucket_id");--> statement-breakpoint
CREATE INDEX "multipart_uploads_createdAt_idx" ON "multipart_uploads" ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "part_reservations_upload_part_unique" ON "part_reservations" ("upload_id","part_number");--> statement-breakpoint
CREATE INDEX "part_reservations_managedBucketId_idx" ON "part_reservations" ("managed_bucket_id");--> statement-breakpoint
CREATE INDEX "part_reservations_createdAt_idx" ON "part_reservations" ("created_at");--> statement-breakpoint
ALTER TABLE "multipart_uploads" ADD CONSTRAINT "multipart_uploads_managed_bucket_id_managed_bucket_id_fkey" FOREIGN KEY ("managed_bucket_id") REFERENCES "managed_bucket"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "part_reservations" ADD CONSTRAINT "part_reservations_managed_bucket_id_managed_bucket_id_fkey" FOREIGN KEY ("managed_bucket_id") REFERENCES "managed_bucket"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "part_reservations" ADD CONSTRAINT "part_reservations_upload_id_multipart_uploads_upload_id_fkey" FOREIGN KEY ("upload_id") REFERENCES "multipart_uploads"("upload_id") ON DELETE CASCADE;