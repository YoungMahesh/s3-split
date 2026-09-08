import { relations } from "drizzle-orm/_relations";
import {
  pgTable,
  text,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { managedBucket } from "./managed-bucket";

export const clientKey = pgTable(
  "client_key",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    managedBucketId: text("managed_bucket_id")
      .notNull()
      .references(() => managedBucket.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    accessKeyId: text("access_key_id").notNull(),
    encryptedSecretAccessKey: text("encrypted_secret_access_key").notNull(),
    permission: text("permission").notNull().default("read_write"),
    status: text("status").notNull().default("active"),
    lastUsedAt: timestamp("last_used_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("client_key_access_key_id_unique").on(table.accessKeyId),
    index("client_key_userId_idx").on(table.userId),
    index("client_key_managedBucketId_idx").on(table.managedBucketId),
  ],
);

export const clientKeyRelations = relations(clientKey, ({ one }) => ({
  user: one(user, {
    fields: [clientKey.userId],
    references: [user.id],
  }),
  managedBucket: one(managedBucket, {
    fields: [clientKey.managedBucketId],
    references: [managedBucket.id],
  }),
}));
