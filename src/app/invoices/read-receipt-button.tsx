"use client";

import { useActionState } from "react";
import { runExtraction } from "../actions";

export default function ReadReceiptButton({
  invoiceId,
  hasLines,
}: {
  invoiceId: string;
  hasLines: boolean;
}) {
  const [state, formAction] = useActionState(runExtraction, null);

  return (
    <div className="flex flex-col items-end gap-2">
      <form action={formAction}>
        <input type="hidden" name="invoiceId" value={invoiceId} />
        <button type="submit" className="rounded-md border px-3 py-1.5 text-sm">
          {hasLines ? "Re-read" : "Read receipt"}
        </button>
      </form>

      {state?.error && (
        <div className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <p>{state.error}</p>
          {state.duplicate && (
            <form action={formAction} className="mt-1">
              <input type="hidden" name="invoiceId" value={invoiceId} />
              <input type="hidden" name="force" value="1" />
              <button type="submit" className="underline">
                Read it anyway
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}