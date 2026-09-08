CREATE TABLE "upstream_account" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"endpoint_url" text NOT NULL,
	"region" text NOT NULL,
	"access_key_id" text NOT NULL,
	"encrypted_secret_access_key" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "upstream_account_userId_idx" ON "upstream_account" ("user_id");--> statement-breakpoint
ALTER TABLE "upstream_account" ADD CONSTRAINT "upstream_account_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;