import {
  pgTable, pgEnum, uuid, text, integer, bigint, real, date,
  timestamp, unique, index, vector
} from "drizzle-orm/pg-core";


export const ledgerReason = pgEnum("ledger_reason", [
  "purchase", "sale", "adjustment", "stock_count", "reversal",
]);

export const invoiceStatus = pgEnum("invoice_status", [
  "draft", "pending_review", "posted", "void",
]);

export const matchStatus = pgEnum("match_status", [
  "unmatched", "auto_matched", "needs_review", "confirmed", "rejected",
]);

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const suppliers = pgTable("suppliers", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const products = pgTable("products", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  sku: text("sku").notNull(),
  name: text("name").notNull(),
  unit: text("unit").notNull().default("each"),
  unitCostCents: integer("unit_cost_cents").notNull().default(0),
  reorderPoint: integer("reorder_point").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  embedding: vector("embedding", { dimensions: 768 }),
}, (t) => [
  unique("products_org_sku_unique").on(t.orgId, t.sku),
  index("products_embedding_idx").using("hnsw", t.embedding.op("vector_cosine_ops")),
]);

export const invoices = pgTable("invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  supplierId: uuid("supplier_id").references(() => suppliers.id),
  invoiceNumber: text("invoice_number"),
  invoiceDate: date("invoice_date"),
  totalCents: bigint("total_cents", { mode: "number" }).notNull().default(0),
  status: invoiceStatus("status").notNull().default("draft"),
  sourceFileKey: text("source_file_key"), 
  driveViewUrl: text("drive_view_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("invoices_org_status_idx").on(t.orgId, t.status),
]);

export const invoiceLines = pgTable("invoice_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  invoiceId: uuid("invoice_id").notNull()
    .references(() => invoices.id, { onDelete: "cascade" }),
  lineNumber: integer("line_number").notNull(),
  rawDescription: text("raw_description").notNull(),
  quantity: integer("quantity").notNull(),
  unitPriceCents: integer("unit_price_cents").notNull().default(0),
  productId: uuid("product_id").references(() => products.id),
  matchConfidence: real("match_confidence"),
  matchStatus: matchStatus("match_status").notNull().default("unmatched"),
});

export const stockLedger = pgTable("stock_ledger", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  productId: uuid("product_id").notNull()
    .references(() => products.id, { onDelete: "restrict" }),
  delta: integer("delta").notNull(),
  reason: ledgerReason("reason").notNull(),
  invoiceLineId: uuid("invoice_line_id").references(() => invoiceLines.id),
  note: text("note"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("stock_ledger_product_idx").on(t.productId, t.occurredAt),
]);
