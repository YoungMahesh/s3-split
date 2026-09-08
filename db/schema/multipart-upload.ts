import { relations } from "drizzle-orm/_relations";
import {
  pgTable,
  text,
  integer,
  timestamp,
  bigint,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { managedBucket } from "./managed-bucket";

export const multipartUploads = pgTable(
  "multipart_uploads",
  {
    id: text("id").primaryKey(),
    managedBucketId: text("managed_bucket_id")
      .notNull()
      .references(() => managedBucket.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    uploadId: text("upload_id").notNull(),
    upstreamKey: text("upstream_key").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("multipart_uploads_upload_id_unique").on(table.uploadId),
    index("multipart_uploads_managedBucketId_idx").on(table.managedBucketId),
    index("multipart_uploads_createdAt_idx").on(table.createdAt),
  ],
);

export const partReservations = pgTable(
  "part_reservations",
  {
    id: text("id").primaryKey(),
    managedBucketId: text("managed_bucket_id")
      .notNull()
      .references(() => managedBucket.id, { onDelete: "cascade" }),
    uploadId: text("upload_id")
      .notNull()
      .references(() => multipartUploads.uploadId, { onDelete: "cascade" }),
    partNumber: integer("part_number").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull().default(0),
    etag: text("etag"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("part_reservations_upload_part_unique").on(
      table.uploadId,
      table.partNumber,
    ),
    index("part_reservations_managedBucketId_idx").on(table.managedBucketId),
    index("part_reservations_createdAt_idx").on(table.createdAt),
  ],
);

export const multipartUploadsRelations = relations(
  multipartUploads,
  ({ one, many }) => ({
    bucket: one(managedBucket, {
      fields: [multipartUploads.managedBucketId],
      references: [managedBucket.id],
    }),
    parts: many(partReservations),
  }),
);

export const partReservationsRelations = relations(
  partReservations,
  ({ one }) => ({
    upload: one(multipartUploads, {
      fields: [partReservations.uploadId],
      references: [multipartUploads.uploadId],
    }),
    bucket: one(managedBucket, {
      fields: [partReservations.managedBucketId],
      references: [managedBucket.id],
    }),
  }),
);
