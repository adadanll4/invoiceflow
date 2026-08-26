import { db } from "./index";
import { organizations, suppliers, products, stockLedger } from "./schema";

async function main() {
  const [org] = await db
    .insert(organizations)
    .values({ name: "Escanilla Trading" })
    .returning();

  await db
    .insert(suppliers)
    .values({ orgId: org.id, name: "Nestle Philippines" });

  const [coke, bear, lucky] = await db
    .insert(products)
    .values([
      { orgId: org.id, sku: "COKE-15-12PK", name: "Coca-Cola 1.5L PET, 12-pack",
        unit: "case", unitCostCents: 54000, reorderPoint: 10 },
      { orgId: org.id, sku: "BEAR-330-24", name: "Bear Brand 330ml, 24-pack",
        unit: "case", unitCostCents: 78000, reorderPoint: 8 },
      { orgId: org.id, sku: "LUCKY-55G", name: "Lucky Me Pancit Canton 55g",
        unit: "each", unitCostCents: 1350, reorderPoint: 100 },
    ])
    .returning();

  await db.insert(stockLedger).values([
    { orgId: org.id, productId: coke.id, delta: 120, reason: "purchase", note: "INV-001" },
    { orgId: org.id, productId: coke.id, delta: -40, reason: "sale", note: "SO-118" },
    { orgId: org.id, productId: coke.id, delta: -12, reason: "sale", note: "SO-121" },
    { orgId: org.id, productId: coke.id, delta: -3, reason: "adjustment", note: "damaged in transit" },
    { orgId: org.id, productId: bear.id, delta: 60, reason: "purchase", note: "INV-002" },
    { orgId: org.id, productId: bear.id, delta: -55, reason: "sale", note: "SO-119" },
    { orgId: org.id, productId: lucky.id, delta: 500, reason: "purchase", note: "INV-003" },
    { orgId: org.id, productId: lucky.id, delta: -420, reason: "sale", note: "various" },
  ]);

  console.log("Seeded org", org.id);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
