"use client";

import { useActionState } from "react";
import { deleteInvoice, reverseInvoice } from "../actions";

export default function InvoiceActions({
  invoiceId,
  status,
}: {
  invoiceId: string;
  status: string;
}) {
  const [delState, delAction] = useActionState(deleteInvoice, null);
  const [revState, revAction] = useActionState(reverseInvoice, null);

  const isPosted = status === "posted";
  const error = delState?.error ?? revState?.error;

  return (
    <div className="flex flex-col items-end gap-1">
      {isPosted ? (
        <form action={revAction}>
          <input type="hidden" name="invoiceId" value={invoiceId} />
          <button
            type="submit"
            className="rounded-md border border-amber-300 px-3 py-1.5 text-sm text-amber-700"
          >
            Reverse
          </button>
        </form>
      ) : (
        <form action={delAction}>
          <input type="hidden" name="invoiceId" value={invoiceId} />
          <button
            type="submit"
            className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-700"
          >
            Delete
          </button>
        </form>
      )}

      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}
    </div>
  );
}