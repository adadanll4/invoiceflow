import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { invoices, organizations, products, suppliers } from "@/db/schema";
import { uploadInvoice } from "../actions";
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
      sourceFileKey: invoices.sourceFileKey,
      supplierName: suppliers.name,
    })
    .from(invoices)
    .leftJoin(suppliers, eq(invoices.supplierId, suppliers.id))
    .where(eq(invoices.orgId, org.id))
    .orderBy(desc(invoices.createdAt));

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="mb-6 text-2xl font-medium">Invoices</h1>

      <form action={uploadInvoice} className="mb-8 flex gap-2">
        <input
          name="file"
          type="file"
          required
          accept="image/jpeg,image/png,image/webp,application/pdf"
          className="flex-1 rounded-md border px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="rounded-md bg-black px-4 py-2 text-sm text-white"
        >
          Upload receipt
        </button>
      </form>

      {list.length === 0 ? (
        <p className="text-sm text-gray-500">No invoices yet.</p>
      ) : (
        <ul className="divide-y">
          {list.map((inv) => (
            <li key={inv.id} className="flex items-center justify-between py-3">
              <div>
                <div className="flex items-center gap-2">
                  <span>{inv.invoiceNumber ?? "(no number)"}</span>
                  {inv.status === "pending_review" && (
                    <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                      pending
                    </span>
                  )}
                </div>
                <div className="text-sm text-gray-500">
                  {inv.supplierName ?? "Unknown supplier"}
                  {inv.invoiceDate ? ` · ${inv.invoiceDate}` : ""}
                  {inv.sourceFileKey ? " · uploaded" : ""}
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