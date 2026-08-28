import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  invoiceLines,
  invoices,
  organizations,
  products,
  suppliers,
} from "@/db/schema";
import {
  confirmLine,
  postInvoice,
  rejectLine,
  runExtraction,
  runMatching,
  uploadInvoice,
} from "../actions";
import InvoiceForm from "./invoice-form";

const BADGE: Record<string, string> = {
  auto_matched: "bg-emerald-100 text-emerald-800",
  confirmed: "bg-emerald-100 text-emerald-800",
  needs_review: "bg-amber-100 text-amber-800",
  unmatched: "bg-red-100 text-red-800",
  rejected: "bg-gray-200 text-gray-700",
};

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
      driveViewUrl: invoices.driveViewUrl,
      supplierName: suppliers.name,
    })
    .from(invoices)
    .leftJoin(suppliers, eq(invoices.supplierId, suppliers.id))
    .where(eq(invoices.orgId, org.id))
    .orderBy(desc(invoices.createdAt));

  const allLines = await db
    .select({
      id: invoiceLines.id,
      invoiceId: invoiceLines.invoiceId,
      lineNumber: invoiceLines.lineNumber,
      rawDescription: invoiceLines.rawDescription,
      quantity: invoiceLines.quantity,
      unitPriceCents: invoiceLines.unitPriceCents,
      productId: invoiceLines.productId,
      matchStatus: invoiceLines.matchStatus,
      matchConfidence: invoiceLines.matchConfidence,
      matchedSku: products.sku,
    })
    .from(invoiceLines)
    .innerJoin(invoices, eq(invoiceLines.invoiceId, invoices.id))
    .leftJoin(products, eq(invoiceLines.productId, products.id))
    .where(eq(invoices.orgId, org.id))
    .orderBy(invoiceLines.lineNumber);

  const linesByInvoice = new Map<string, typeof allLines>();
  for (const line of allLines) {
    const existing = linesByInvoice.get(line.invoiceId) ?? [];
    existing.push(line);
    linesByInvoice.set(line.invoiceId, existing);
  }

  return (
    <main className="mx-auto max-w-3xl p-8">
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
            const isPosted = inv.status === "posted";
            const unresolved = lines.filter(
              (l) =>
                l.matchStatus === "needs_review" || l.matchStatus === "unmatched"
            ).length;

            return (
              <li key={inv.id} className="py-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span>{inv.invoiceNumber ?? "(no number)"}</span>
                      <span
                        className={`rounded px-2 py-0.5 text-xs ${
                          isPosted
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {inv.status}
                      </span>
                    </div>
                    <div className="text-sm text-gray-500">
                      {inv.supplierName ?? "Unknown supplier"}
                      {inv.invoiceDate ? ` · ${inv.invoiceDate}` : ""}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <span className="tabular-nums text-sm">
                      ₱{(inv.totalCents / 100).toFixed(2)}
                    </span>

                    {inv.driveViewUrl && (
                      
                        <a
                          href={inv.driveViewUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-md border px-3 py-1.5 text-sm text-gray-600"
                      >
                        Drive
                      </a>
                    )}

                    {inv.sourceFileKey && !isPosted && (
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

                    {lines.length > 0 && !isPosted && (
                      <form action={runMatching}>
                        <input type="hidden" name="invoiceId" value={inv.id} />
                        <button
                          type="submit"
                          className="rounded-md border px-3 py-1.5 text-sm"
                        >
                          Match items
                        </button>
                      </form>
                    )}

                    {lines.length > 0 && !isPosted && (
                      <form action={postInvoice}>
                        <input type="hidden" name="invoiceId" value={inv.id} />
                        <button
                          type="submit"
                          disabled={unresolved > 0}
                          className="rounded-md bg-black px-3 py-1.5 text-sm text-white disabled:opacity-30"
                        >
                          Post to inventory
                        </button>
                      </form>
                    )}
                  </div>
                </div>

                {unresolved > 0 && (
                  <p className="mt-2 text-sm text-amber-700">
                    {unresolved} line(s) need your confirmation before posting.
                  </p>
                )}

                {lines.length > 0 && (
                  <ul className="mt-3 space-y-3 border-l pl-4">
                    {lines.map((l) => {
                      const needsAction =
                        !isPosted &&
                        (l.matchStatus === "needs_review" ||
                          l.matchStatus === "unmatched");

                      return (
                        <li key={l.id} className="text-sm">
                          <div className="flex justify-between gap-4">
                            <span className="text-gray-700">
                              {l.rawDescription}
                            </span>
                            <span className="tabular-nums whitespace-nowrap text-gray-500">
                              {l.quantity} × ₱
                              {(l.unitPriceCents / 100).toFixed(2)}
                            </span>
                          </div>

                          <div className="mt-1 flex items-center gap-2">
                            <span
                              className={`rounded px-2 py-0.5 text-xs ${
                                BADGE[l.matchStatus] ?? "bg-gray-200"
                              }`}
                            >
                              {l.matchStatus}
                            </span>
                            {l.matchedSku && (
                              <span className="text-xs text-gray-600">
                                → {l.matchedSku}
                              </span>
                            )}
                            {l.matchConfidence !== null && (
                              <span className="tabular-nums text-xs text-gray-400">
                                {l.matchConfidence.toFixed(3)}
                              </span>
                            )}
                          </div>

                          {needsAction && (
                            <div className="mt-2 flex flex-wrap gap-2">
                              <form action={confirmLine} className="flex gap-2">
                                <input type="hidden" name="lineId" value={l.id} />
                                <select
                                  name="productId"
                                  defaultValue={l.productId ?? ""}
                                  required
                                  className="rounded-md border px-2 py-1 text-xs"
                                >
                                  <option value="">Pick a product...</option>
                                  {productList.map((p) => (
                                    <option key={p.id} value={p.id}>
                                      {p.sku}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  type="submit"
                                  className="rounded-md border px-3 py-1 text-xs"
                                >
                                  Confirm
                                </button>
                              </form>

                              <form action={rejectLine}>
                                <input type="hidden" name="lineId" value={l.id} />
                                <button
                                  type="submit"
                                  className="rounded-md border px-3 py-1 text-xs text-gray-500"
                                >
                                  Not a product
                                </button>
                              </form>
                            </div>
                          )}
                        </li>
                      );
                    })}
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
