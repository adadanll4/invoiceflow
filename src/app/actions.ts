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

