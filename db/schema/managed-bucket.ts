import { relations } from "drizzle-orm/_relations";
import {
  pgTable,
  text,
  timestamp,
  bigint,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { upstreamAccount } from "./upstream-account";
import { clientKey } from "./client-key";
import { multipartUploads, partReservations } from "./multipart-upload";

export const managedBucket = pgTable(
  "managed_bucket",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    upstreamAccountId: text("upstream_account_id")
      .notNull()
      .references(() => upstreamAccount.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    upstreamBucket: text("upstream_bucket").notNull(),
    bucketType: text("bucket_type").notNull().default("physical"),
    virtualPrefix: text("virtual_prefix"),
    storageQuotaBytes: bigint("storage_quota_bytes", { mode: "number" }).notNull(),
    usedBytes: bigint("used_bytes", { mode: "number" }).notNull().default(0),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("managed_bucket_user_name_unique").on(table.userId, table.name),
    index("managed_bucket_userId_idx").on(table.userId),
    index("managed_bucket_upstreamAccountId_idx").on(table.upstreamAccountId),
  ],
);

export const managedObjects = pgTable(
  "managed_objects",
  {
    id: text("id").primaryKey(),
    managedBucketId: text("managed_bucket_id")
      .notNull()
      .references(() => managedBucket.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull().default(0),
    etag: text("etag"),
    lastModified: timestamp("last_modified"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("managed_objects_bucket_key_unique").on(
      table.managedBucketId,
      table.key,
    ),
    index("managed_objects_bucketId_idx").on(table.managedBucketId),
  ],
);

export const managedBucketRelations = relations(
  managedBucket,
  ({ one, many }) => ({
    user: one(user, {
      fields: [managedBucket.userId],
      references: [user.id],
    }),
    upstreamAccount: one(upstreamAccount, {
      fields: [managedBucket.upstreamAccountId],
      references: [upstreamAccount.id],
    }),
    objects: many(managedObjects),
    clientKeys: many(clientKey),
    multipartUploads: many(multipartUploads),
    partReservations: many(partReservations),
  }),
);

export const managedObjectsRelations = relations(
  managedObjects,
  ({ one }) => ({
    bucket: one(managedBucket, {
      fields: [managedObjects.managedBucketId],
      references: [managedBucket.id],
    }),
  }),
);
