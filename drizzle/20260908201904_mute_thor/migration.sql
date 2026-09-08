CREATE TABLE "managed_bucket" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"upstream_account_id" text NOT NULL,
	"name" text NOT NULL,
	"upstream_bucket" text NOT NULL,
	"bucket_type" text DEFAULT 'physical' NOT NULL,
	"virtual_prefix" text,
	"storage_quota_bytes" bigint NOT NULL,
	"used_bytes" bigint DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "managed_objects" (
	"id" text PRIMARY KEY,
	"managed_bucket_id" text NOT NULL,
	"key" text NOT NULL,
	"size_bytes" bigint DEFAULT 0 NOT NULL,
	"etag" text,
	"last_modified" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "managed_bucket_user_name_unique" ON "managed_bucket" ("user_id","name");--> statement-breakpoint
CREATE INDEX "managed_bucket_userId_idx" ON "managed_bucket" ("user_id");--> statement-breakpoint
CREATE INDEX "managed_bucket_upstreamAccountId_idx" ON "managed_bucket" ("upstream_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "managed_objects_bucket_key_unique" ON "managed_objects" ("managed_bucket_id","key");--> statement-breakpoint
CREATE INDEX "managed_objects_bucketId_idx" ON "managed_objects" ("managed_bucket_id");--> statement-breakpoint
ALTER TABLE "managed_bucket" ADD CONSTRAINT "managed_bucket_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "managed_bucket" ADD CONSTRAINT "managed_bucket_upstream_account_id_upstream_account_id_fkey" FOREIGN KEY ("upstream_account_id") REFERENCES "upstream_account"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "managed_objects" ADD CONSTRAINT "managed_objects_managed_bucket_id_managed_bucket_id_fkey" FOREIGN KEY ("managed_bucket_id") REFERENCES "managed_bucket"("id") ON DELETE CASCADE;