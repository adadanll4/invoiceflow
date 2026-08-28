import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  invoiceLines,
  invoices,
  organizations,
  products,
  suppliers,
  
} from "@/db/schema";
import { runExtraction, uploadInvoice } from "../actions";
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

  const allLines = await db
    .select({
      invoiceId: invoiceLines.invoiceId,
      lineNumber: invoiceLines.lineNumber,
      rawDescription: invoiceLines.rawDescription,
      quantity: invoiceLines.quantity,
      unitPriceCents: invoiceLines.unitPriceCents,
      matchStatus: invoiceLines.matchStatus,
    })
    .from(invoiceLines)
    .innerJoin(invoices, eq(invoiceLines.invoiceId, invoices.id))
    .where(eq(invoices.orgId, org.id))
    .orderBy(invoiceLines.lineNumber);

  const linesByInvoice = new Map<string, typeof allLines>();
  for (const line of allLines) {
    const existing = linesByInvoice.get(line.invoiceId) ?? [];
    existing.push(line);
    linesByInvoice.set(line.invoiceId, existing);
  }

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
          {list.map((inv) => {
            const lines = linesByInvoice.get(inv.id) ?? [];
            return (
              <li key={inv.id} className="py-4">
                <div className="flex items-center justify-between">
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
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="tabular-nums text-sm">
                      ₱{(inv.totalCents / 100).toFixed(2)}
                    </span>
                    {inv.sourceFileKey && (
                      <form action={runExtraction}>
                        <input type="hidden" name="invoiceId" value={inv.id} />
                        <button
                          type="submit"
                          className="rounded-md border px-3 py-1.5 text-sm"
                        >
                          {lines.length > 0 ? "Re-read" : "Read receipt"}
                        </button>
                      </form>
                    )}
                  </div>
                </div>

                {lines.length > 0 && (
                  <ul className="mt-3 space-y-1 border-l pl-4">
                    {lines.map((l) => (
                      <li
                        key={`${l.invoiceId}-${l.lineNumber}`}
                        className="flex justify-between text-sm text-gray-600"
                      >
                        <span>{l.rawDescription}</span>
                        <span className="tabular-nums">
                          {l.quantity} × ₱{(l.unitPriceCents / 100).toFixed(2)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <h2 className="mt-10 mb-3 text-lg font-medium">New invoice</h2>
      <InvoiceForm products={productList} />
    </main>
  );
}