"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { organizations, products, stockLedger } from "@/db/schema";

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

