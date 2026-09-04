"use client";

import { useActionState } from "react";
import { scanLineSerials } from "../actions";

export default function SerialScanButton({
  lineId,
  quantity,
  scannedCount,
}: {
  lineId: string;
  quantity: number;
  scannedCount: number;
}) {
  const [state, formAction] = useActionState(scanLineSerials, null);

  return (
    <div className="mt-1">
      <form action={formAction} className="inline">
        <input type="hidden" name="lineId" value={lineId} />
        <button
          type="submit"
          className="rounded-md border px-2 py-0.5 text-xs text-gray-600"
        >
          {scannedCount > 0
            ? `Re-scan serials (${scannedCount}/${quantity})`
            : "Scan serials"}
        </button>
      </form>

      {state?.error && (
        <p className="mt-1 text-xs text-amber-700">{state.error}</p>
      )}
      {state?.success && (
        <p className="mt-1 text-xs text-emerald-700">
          All {state.found} serials captured.
        </p>
      )}
    </div>
  );
}