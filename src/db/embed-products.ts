import { eq, isNull } from "drizzle-orm";
import { db } from "./index";
import { products } from "./schema";
import { embed, productText } from "../lib/embed";

async function main() {
  const rows = await db.select().from(products).where(isNull(products.embedding));

  if (rows.length === 0) {
    console.log("Every product already has an embedding.");
    process.exit(0);
  }

  console.log(`Embedding ${rows.length} products...`);

  for (const p of rows) {
    try {
      const vector = await embed(productText(p));
      await db.update(products).set({ embedding: vector }).where(eq(products.id, p.id));
      console.log("  ok", p.sku);
    } catch (e) {
      console.error("  failed", p.sku, e);
    }
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});