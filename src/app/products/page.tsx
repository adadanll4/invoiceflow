import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations, products } from "@/db/schema";
import { createProduct } from "../actions";
import ProductActions from "./product-actions";

export default async function ProductsPage() {
  const [org] = await db.select().from(organizations).limit(1);

  const list = await db
    .select()
    .from(products)
    .where(eq(products.orgId, org.id))
    .orderBy(products.sku);

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="mb-6 text-2xl font-medium">Products</h1>

      <ul className="divide-y">
        {list.map((p) => (
          <li key={p.id} className="flex items-center justify-between py-3">
            <div>
              <div>{p.name}</div>
              <div className="text-sm text-gray-500">
                {p.sku} · {p.unit} · reorder at {p.reorderPoint}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="tabular-nums text-sm text-gray-500">
                ₱{(p.unitCostCents / 100).toFixed(2)}
              </span>
              <ProductActions productId={p.id} />
            </div>
          </li>
        ))}
      </ul>

      <form action={createProduct} className="mt-8 space-y-2">
        <div className="flex gap-2">
          <input
            name="sku"
            required
            placeholder="SKU"
            className="w-40 rounded-md border px-3 py-2 text-sm"
          />
          <input
            name="name"
            required
            placeholder="Product name"
            className="flex-1 rounded-md border px-3 py-2 text-sm"
          />
        </div>
        <div className="flex gap-2">
          <input
            name="unit"
            placeholder="Unit (each, case)"
            className="flex-1 rounded-md border px-3 py-2 text-sm"
          />
          <input
            name="costPesos"
            type="number"
            step="0.01"
            placeholder="Cost ₱"
            className="w-32 rounded-md border px-3 py-2 text-sm"
          />
          <input
            name="reorderPoint"
            type="number"
            placeholder="Reorder at"
            className="w-32 rounded-md border px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded-md bg-black px-4 py-2 text-sm text-white"
          >
            Add
          </button>
        </div>
      </form>
    </main>
  );
}
