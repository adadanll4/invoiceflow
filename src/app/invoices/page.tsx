import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { invoices, organizations, products, suppliers } from "@/db/schema";
import InvoiceForm from "./invoice-form";

export default async function InvoicesPage() {
  const [org] = await db.select().from(organizations).limit(1);

  const productList = await db
    .select({ id: products.id, sku: products.sku, name: products.name })
    .from(products)
    .where(eq(products.orgId, org.id))
    .orderBy(products.sku);

  const list = await db
    .select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      invoiceDate: invoices.invoiceDate,
      totalCents: invoices.totalCents,
      status: invoices.status,
      supplierName: suppliers.name,
    })
    .from(invoices)
    .leftJoin(suppliers, eq(invoices.supplierId, suppliers.id))
    .where(eq(invoices.orgId, org.id))
    .orderBy(desc(invoices.createdAt));

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="mb-6 text-2xl font-medium">Invoices</h1>

      {list.length === 0 ? (
        <p className="text-sm text-gray-500">No invoices yet.</p>
      ) : (
        <ul className="divide-y">
          {list.map((inv) => (
            <li key={inv.id} className="flex items-center justify-between py-3">
              <div>
                <div>{inv.invoiceNumber ?? "(no number)"}</div>
                <div className="text-sm text-gray-500">
                  {inv.supplierName ?? "Unknown supplier"}
                  {inv.invoiceDate ? ` · ${inv.invoiceDate}` : ""}
                </div>
              </div>
              <span className="tabular-nums text-sm">
                ₱{(inv.totalCents / 100).toFixed(2)}
              </span>
            </li>
          ))}
        </ul>
      )}

      <h2 className="mt-10 mb-3 text-lg font-medium">New invoice</h2>
      <InvoiceForm products={productList} />
    </main>
  );
}