import { sql, eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations, products, stockLedger } from "@/db/schema";

export default async function Home() {
  const [org] = await db.select().from(organizations).limit(1);

  const stock = await db
    .select({
      id: products.id,
      sku: products.sku,
      name: products.name,
      reorderPoint: products.reorderPoint,
      onHand: sql<number>`coalesce(sum(${stockLedger.delta}), 0)`.mapWith(Number),
    })
    .from(products)
    .leftJoin(stockLedger, eq(stockLedger.productId, products.id))
    .where(eq(products.orgId, org.id))
    .groupBy(products.id)
    .orderBy(products.sku);

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="mb-6 text-2xl font-medium">Stock on hand</h1>
      <ul className="divide-y">
        {stock.map((p) => (
          <li key={p.id} className="flex items-center justify-between py-3">
            <div>
              <div>{p.name}</div>
              <div className="text-sm text-gray-500">{p.sku}</div>
            </div>
            <span
              className={
                p.onHand <= p.reorderPoint
                  ? "tabular-nums text-red-600"
                  : "tabular-nums"
              }
            >
              {p.onHand}
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}
