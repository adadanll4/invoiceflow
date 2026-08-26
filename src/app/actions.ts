"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { organizations, stockLedger } from "@/db/schema";

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