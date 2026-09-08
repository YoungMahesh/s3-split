import { relations } from "drizzle-orm/_relations";
import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";
import { user } from "./auth";

export const upstreamAccount = pgTable(
  "upstream_account",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    endpointUrl: text("endpoint_url").notNull(),
    region: text("region").notNull(),
    accessKeyId: text("access_key_id").notNull(),
    encryptedSecretAccessKey: text("encrypted_secret_access_key").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("upstream_account_userId_idx").on(table.userId)],
);

export const upstreamAccountRelations = relations(
  upstreamAccount,
  ({ one }) => ({
    user: one(user, {
      fields: [upstreamAccount.userId],
      references: [user.id],
    }),
  }),
);
