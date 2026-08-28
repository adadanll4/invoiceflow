"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  invoiceLines,
  invoices,
  organizations,
  products,
  stockLedger,
  suppliers,
} from "@/db/schema";
import { ALLOWED_TYPES, MAX_BYTES, saveUpload } from "@/lib/storage";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { extractInvoice } from "@/lib/extract";
import { mimeFromKey, readUpload } from "@/lib/storage";
import { backupToDrive } from "@/lib/drive";
import { embed } from "@/lib/embed";

export async function receiveStock(formData: FormData) {
  const productId = String(formData.get("productId") ?? "");
  const quantity = Number(formData.get("quantity"));

  if (!productId) return;
  if (!Number.isInteger(quantity) || quantity === 0) return;

  const [org] = await db.select().from(organizations).limit(1);

  await db.insert(stockLedger).values({
    orgId: org.id,
    productId,
    delta: quantity,
    reason: quantity > 0 ? "purchase" : "sale",
    note: "manual entry",
  });

  revalidatePath("/");
  
}

export async function createProduct(formData: FormData) {
  const sku = String(formData.get("sku") ?? "").trim().toUpperCase();
  const name = String(formData.get("name") ?? "").trim();
  const unit = String(formData.get("unit") ?? "each").trim();
  const costPesos = Number(formData.get("costPesos"));
  const reorderPoint = Number(formData.get("reorderPoint"));

  if (!sku || !name) return;

  const [org] = await db.select().from(organizations).limit(1);

  try {
    await db.insert(products).values({
      orgId: org.id,
      sku,
      name,
      unit: unit || "each",
      unitCostCents: Math.round((costPesos || 0) * 100),
      reorderPoint: Number.isInteger(reorderPoint) ? reorderPoint : 0,
    });
  } catch (e) {
    console.error("Could not create product:", e);
    return;
  }

  revalidatePath("/products");
  revalidatePath("/");
}

export async function createInvoice(formData: FormData) {
  const supplierName = String(formData.get("supplierName") ?? "").trim();
  const invoiceNumber = String(formData.get("invoiceNumber") ?? "").trim();
  const invoiceDate = String(formData.get("invoiceDate") ?? "").trim();

  const productIds = formData.getAll("productId").map(String);
  const quantities = formData.getAll("quantity").map(Number);
  const prices = formData.getAll("pricePesos").map(Number);

  const lines = productIds
    .map((productId, i) => ({
      productId,
      quantity: quantities[i],
      unitPriceCents: Math.round((prices[i] || 0) * 100),
    }))
    .filter((l) => l.productId && Number.isInteger(l.quantity) && l.quantity > 0);

  if (lines.length === 0) return;

  const [org] = await db.select().from(organizations).limit(1);

  let supplierId: string | null = null;
  if (supplierName) {
    const [supplier] = await db
      .insert(suppliers)
      .values({ orgId: org.id, name: supplierName })
      .returning();
    supplierId = supplier.id;
  }

  const totalCents = lines.reduce(
    (sum, l) => sum + l.quantity * l.unitPriceCents,
    0
  );

  await db.transaction(async (tx) => {
    const [invoice] = await tx
      .insert(invoices)
      .values({
        orgId: org.id,
        supplierId,
        invoiceNumber: invoiceNumber || null,
        invoiceDate: invoiceDate || null,
        totalCents,
        status: "posted",
      })
      .returning();

    for (const [i, line] of lines.entries()) {
      const [savedLine] = await tx
        .insert(invoiceLines)
        .values({
          invoiceId: invoice.id,
          lineNumber: i + 1,
          rawDescription: "manual entry",
          quantity: line.quantity,
          unitPriceCents: line.unitPriceCents,
          productId: line.productId,
          matchStatus: "confirmed",
          matchConfidence: 1,
        })
        .returning();

      await tx.insert(stockLedger).values({
        orgId: org.id,
        productId: line.productId,
        delta: line.quantity,
        reason: "purchase",
        invoiceLineId: savedLine.id,
        note: invoiceNumber || "invoice",
      });
    }
  });

  revalidatePath("/invoices");
  revalidatePath("/");
}

export async function uploadInvoice(formData: FormData) {
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) return;
  if (!ALLOWED_TYPES[file.type]) return;
  if (file.size > MAX_BYTES) return;

  const [org] = await db.select().from(organizations).limit(1);

  let key: string;
  try {
    key = await saveUpload(file);
  } catch (e) {
    console.error("Upload failed:", e);
    return;
  }

  const [invoice] = await db
    .insert(invoices)
    .values({ orgId: org.id, status: "pending_review", sourceFileKey: key })
    .returning();

  try {
    const bytes = await readUpload(key);
    const driveName = `${new Date().toISOString().slice(0, 10)}_${file.name}`;
    const viewUrl = await backupToDrive(bytes, driveName, mimeFromKey(key));

    if (viewUrl) {
      await db
        .update(invoices)
        .set({ driveViewUrl: viewUrl })
        .where(eq(invoices.id, invoice.id));
    }
  } catch (e) {
    console.error("Drive backup skipped:", e);
  }

  revalidatePath("/invoices");
}

export async function confirmLine(formData: FormData) {
  const lineId = String(formData.get("lineId") ?? "");
  const productId = String(formData.get("productId") ?? "");
  if (!lineId || !productId) return;

  const [line] = await db
    .select({ invoiceId: invoiceLines.invoiceId })
    .from(invoiceLines)
    .where(eq(invoiceLines.id, lineId))
    .limit(1);

  if (!line) return;

  const [invoice] = await db
    .select({ status: invoices.status })
    .from(invoices)
    .where(eq(invoices.id, line.invoiceId))
    .limit(1);

  if (invoice?.status === "posted") return;

  await db
    .update(invoiceLines)
    .set({ productId, matchStatus: "confirmed", matchConfidence: 1 })
    .where(eq(invoiceLines.id, lineId));

  revalidatePath("/invoices");
}

export async function rejectLine(formData: FormData) {
  const lineId = String(formData.get("lineId") ?? "");
  if (!lineId) return;

  const [line] = await db
    .select({ invoiceId: invoiceLines.invoiceId })
    .from(invoiceLines)
    .where(eq(invoiceLines.id, lineId))
    .limit(1);

  if (!line) return;

  const [invoice] = await db
    .select({ status: invoices.status })
    .from(invoices)
    .where(eq(invoices.id, line.invoiceId))
    .limit(1);

  if (invoice?.status === "posted") return;

  await db
    .update(invoiceLines)
    .set({ productId: null, matchStatus: "rejected" })
    .where(eq(invoiceLines.id, lineId));

  revalidatePath("/invoices");
}

export async function postInvoice(formData: FormData) {
  const invoiceId = String(formData.get("invoiceId") ?? "");
  if (!invoiceId) return;

  const [invoice] = await db
    .select()
    .from(invoices)
    .where(eq(invoices.id, invoiceId))
    .limit(1);

  if (!invoice) return;

  if (invoice.status === "posted") {
    console.warn("Invoice already posted:", invoiceId);
    return;
  }

  const lines = await db
    .select()
    .from(invoiceLines)
    .where(eq(invoiceLines.invoiceId, invoiceId));

  const unresolved = lines.filter(
    (l) => l.matchStatus === "needs_review" || l.matchStatus === "unmatched"
  );

  if (unresolved.length > 0) {
    console.warn(`${unresolved.length} line(s) still unresolved`);
    return;
  }

  const postable = lines.filter(
    (l) =>
      l.productId &&
      (l.matchStatus === "auto_matched" || l.matchStatus === "confirmed")
  );

  if (postable.length === 0) {
    console.warn("Nothing to post on invoice", invoiceId);
    return;
  }

  await db.transaction(async (tx) => {
    for (const line of postable) {
      await tx.insert(stockLedger).values({
        orgId: invoice.orgId,
        productId: line.productId!,
        delta: line.quantity,
        reason: "purchase",
        invoiceLineId: line.id,
        note: invoice.invoiceNumber ?? "receipt",
      });
    }

    await tx
      .update(invoices)
      .set({ status: "posted" })
      .where(eq(invoices.id, invoiceId));
  });

  revalidatePath("/invoices");
  revalidatePath("/");
}

export async function runExtraction(formData: FormData) {
  const invoiceId = String(formData.get("invoiceId") ?? "");
  if (!invoiceId) return;

  const [invoice] = await db
    .select()
    .from(invoices)
    .where(eq(invoices.id, invoiceId))
    .limit(1);

  if (!invoice?.sourceFileKey) return;

  let result;
  try {
    const bytes = await readUpload(invoice.sourceFileKey);
    result = await extractInvoice(bytes, mimeFromKey(invoice.sourceFileKey));
  } catch (e) {
    console.error("Extraction failed:", e);
    return;
  }

  if (result.lines.length === 0) {
    console.warn("No line items found in", invoice.sourceFileKey);
    return;
  }

  let supplierId = invoice.supplierId;
  if (!supplierId && result.supplierName) {
    const [supplier] = await db
      .insert(suppliers)
      .values({ orgId: invoice.orgId, name: result.supplierName })
      .returning();
    supplierId = supplier.id;
  }

  const totalCents = result.lines.reduce(
    (sum, l) => sum + Math.round(l.quantity) * Math.round(l.unitPrice * 100),
    0
  );

  await db.transaction(async (tx) => {
    await tx.delete(invoiceLines).where(eq(invoiceLines.invoiceId, invoiceId));

    for (const [i, line] of result.lines.entries()) {
      await tx.insert(invoiceLines).values({
        invoiceId,
        lineNumber: i + 1,
        rawDescription: line.description,
        quantity: Math.round(line.quantity),
        unitPriceCents: Math.round(line.unitPrice * 100),
        matchStatus: "unmatched",
      });
    }

    await tx
      .update(invoices)
      .set({
        supplierId,
        invoiceNumber: result.invoiceNumber ?? invoice.invoiceNumber,
        invoiceDate: result.invoiceDate ?? invoice.invoiceDate,
        totalCents,
        status: "pending_review",
      })
      .where(eq(invoices.id, invoiceId));
  });

  revalidatePath("/invoices");
}

const AUTO_MATCH_THRESHOLD = 0.78;
const MIN_CANDIDATE = 0.55;

export async function runMatching(formData: FormData) {
  const invoiceId = String(formData.get("invoiceId") ?? "");
  if (!invoiceId) return;

  const [invoice] = await db
    .select()
    .from(invoices)
    .where(eq(invoices.id, invoiceId))
    .limit(1);

  if (!invoice) return;

  const lines = await db
    .select()
    .from(invoiceLines)
    .where(eq(invoiceLines.invoiceId, invoiceId))
    .orderBy(invoiceLines.lineNumber);

  for (const line of lines) {
    if (line.matchStatus === "confirmed" || line.matchStatus === "rejected") {
      continue;
    }

    let vector: number[];
    try {
      vector = await embed(line.rawDescription);
    } catch (e) {
      console.error("Could not embed line", line.lineNumber, e);
      continue;
    }

    const literal = JSON.stringify(vector);

    const [best] = await db
      .select({
        id: products.id,
        sku: products.sku,
        similarity: sql<number>`1 - (${products.embedding} <=> ${literal}::vector)`
          .mapWith(Number),
      })
      .from(products)
      .where(
        and(eq(products.orgId, invoice.orgId), isNotNull(products.embedding))
      )
      .orderBy(sql`${products.embedding} <=> ${literal}::vector`)
      .limit(1);

    if (!best || best.similarity < MIN_CANDIDATE) {
      await db
        .update(invoiceLines)
        .set({
          productId: null,
          matchConfidence: best?.similarity ?? null,
          matchStatus: "unmatched",
        })
        .where(eq(invoiceLines.id, line.id));
      continue;
    }

    await db
      .update(invoiceLines)
      .set({
        productId: best.id,
        matchConfidence: best.similarity,
        matchStatus:
          best.similarity >= AUTO_MATCH_THRESHOLD ? "auto_matched" : "needs_review",
      })
      .where(eq(invoiceLines.id, line.id));
  }

  revalidatePath("/invoices");
}