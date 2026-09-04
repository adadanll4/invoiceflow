"use client";

import { useActionState } from "react";
import { deleteProduct } from "../actions";

export default function ProductActions({ productId }: { productId: string }) {
  const [state, formAction] = useActionState(deleteProduct, null);

  return (
    <div className="flex flex-col items-end">
      <form action={formAction}>
        <input type="hidden" name="productId" value={productId} />
        <button
          type="submit"
          className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-700"
        >
          Delete
        </button>
      </form>
      {state?.error && (
        <p className="mt-1 max-w-48 text-right text-xs text-red-600">
          {state.error}
        </p>
      )}
    </div>
  );
}