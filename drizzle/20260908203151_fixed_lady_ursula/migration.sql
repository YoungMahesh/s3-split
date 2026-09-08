CREATE TABLE "client_key" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"managed_bucket_id" text NOT NULL,
	"name" text NOT NULL,
	"access_key_id" text NOT NULL,
	"encrypted_secret_access_key" text NOT NULL,
	"permission" text DEFAULT 'read_write' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"last_used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "client_key_access_key_id_unique" ON "client_key" ("access_key_id");--> statement-breakpoint
CREATE INDEX "client_key_userId_idx" ON "client_key" ("user_id");--> statement-breakpoint
CREATE INDEX "client_key_managedBucketId_idx" ON "client_key" ("managed_bucket_id");--> statement-breakpoint
ALTER TABLE "client_key" ADD CONSTRAINT "client_key_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "client_key" ADD CONSTRAINT "client_key_managed_bucket_id_managed_bucket_id_fkey" FOREIGN KEY ("managed_bucket_id") REFERENCES "managed_bucket"("id") ON DELETE CASCADE;