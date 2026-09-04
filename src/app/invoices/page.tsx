import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  invoiceFiles,
  invoiceLines,
  invoices,
  lineSerials,
  organizations,
  products,
  suppliers,
} from "@/db/schema";
import {
  confirmLine,
  postInvoice,
  rejectLine,
  runMatching,
  uploadInvoice,
} from "../actions";

import InvoiceForm from "./invoice-form";
import ReadReceiptButton from "./read-receipt-button";
import InvoiceActions from "./invoice-actions";
import SerialScanButton from "./serial-scan-button";

const BADGE: Record<string, string> = {
  auto_matched: "bg-emerald-100 text-emerald-800",
  confirmed: "bg-emerald-100 text-emerald-800",
  needs_review: "bg-amber-100 text-amber-800",
  unmatched: "bg-red-100 text-red-800",
  rejected: "bg-gray-200 text-gray-700",
};

const LINK_CLASS = "rounded-md border px-3 py-1.5 text-sm text-gray-600";

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

  const allFiles = await db
    .select({
      invoiceId: invoiceFiles.invoiceId,
      pageNumber: invoiceFiles.pageNumber,
      driveViewUrl: invoiceFiles.driveViewUrl,
    })
    .from(invoiceFiles)
    .innerJoin(invoices, eq(invoiceFiles.invoiceId, invoices.id))
    .where(eq(invoices.orgId, org.id))
    .orderBy(invoiceFiles.pageNumber);
  
    const allSerials = await db
    .select({
      invoiceLineId: lineSerials.invoiceLineId,
      serial: lineSerials.serial,
      position: lineSerials.position,
    })
    .from(lineSerials)
    .innerJoin(invoiceLines, eq(lineSerials.invoiceLineId, invoiceLines.id))
    .innerJoin(invoices, eq(invoiceLines.invoiceId, invoices.id))
    .where(eq(invoices.orgId, org.id))
    .orderBy(lineSerials.position);

  const serialsByLine = new Map<string, typeof allSerials>();
  for (const s of allSerials) {
    const existing = serialsByLine.get(s.invoiceLineId) ?? [];
    existing.push(s);
    serialsByLine.set(s.invoiceLineId, existing);
  }

  const linesByInvoice = new Map<string, typeof allLines>();
  for (const line of allLines) {
    const existing = linesByInvoice.get(line.invoiceId) ?? [];
    existing.push(line);
    linesByInvoice.set(line.invoiceId, existing);
  }

  const filesByInvoice = new Map<string, typeof allFiles>();
  for (const f of allFiles) {
    const existing = filesByInvoice.get(f.invoiceId) ?? [];
    existing.push(f);
    filesByInvoice.set(f.invoiceId, existing);
  }

  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="mb-6 text-2xl font-medium">Invoices</h1>

      <form action={uploadInvoice} className="mb-8 space-y-2">
        <div className="flex gap-2">
          <input
            name="file"
            type="file"
            multiple
            required
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="flex-1 rounded-md border px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded-md bg-black px-4 py-2 text-sm text-white"
          >
            Upload
          </button>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" name="singleReceipt" value="1" />
          These files are pages of ONE long receipt
        </label>
      </form>

      {list.length === 0 ? (
        <p className="text-sm text-gray-500">No invoices yet.</p>
      ) : (
        <ul className="divide-y">
          {list.map((inv) => {
            const lines = linesByInvoice.get(inv.id) ?? [];
            const pageFiles = filesByInvoice.get(inv.id) ?? [];
            const driveLinks = pageFiles.filter((f) => f.driveViewUrl);
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
                      {pageFiles.length > 1 && (
                        <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                          {pageFiles.length} pages
                        </span>
                      )}
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

                    {driveLinks.length > 0
                      ? driveLinks.map((f) => (
                          <a key={f.pageNumber} href={f.driveViewUrl!} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
                            {driveLinks.length > 1 ? `Drive p${f.pageNumber}` : "Drive"}
                          </a>
                        ))
                      : inv.driveViewUrl && (
                          <a href={inv.driveViewUrl} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
                            Drive
                          </a>
                        )}

                    {inv.sourceFileKey && !isPosted && (
                      <ReadReceiptButton invoiceId={inv.id} hasLines={lines.length > 0} />
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

                    <InvoiceActions invoiceId={inv.id} status={inv.status} />
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
                                                      {!isPosted && (
                            <SerialScanButton
                              lineId={l.id}
                              quantity={l.quantity}
                              scannedCount={(serialsByLine.get(l.id) ?? []).length}
                            />
                          )}
                          {(serialsByLine.get(l.id) ?? []).length > 0 && (
                            <details className="mt-1">
                              <summary className="cursor-pointer text-xs text-gray-400">
                                {(serialsByLine.get(l.id) ?? []).length} serial(s)
                              </summary>
                              <div className="mt-1 flex flex-wrap gap-1">
                                {(serialsByLine.get(l.id) ?? []).map((s) => (
                                  <span
                                    key={s.serial}
                                    className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-600"
                                  >
                                    {s.serial}
                                  </span>
                                ))}
                              </div>
                            </details>
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
