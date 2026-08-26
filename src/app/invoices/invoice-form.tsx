"use client";

import { useState } from "react";
import { createInvoice } from "../actions";

type Product = { id: string; sku: string; name: string };

export default function InvoiceForm({ products }: { products: Product[] }) {
  const [rows, setRows] = useState([0]);

  return (
    <form action={createInvoice} className="space-y-3">
      <div className="flex gap-2">
        <input
          name="supplierName"
          placeholder="Supplier"
          className="flex-1 rounded-md border px-3 py-2 text-sm"
        />
        <input
          name="invoiceNumber"
          placeholder="Invoice no."
          className="w-36 rounded-md border px-3 py-2 text-sm"
        />
        <input
          name="invoiceDate"
          type="date"
          className="w-40 rounded-md border px-3 py-2 text-sm"
        />
      </div>

      {rows.map((rowId) => (
        <div key={rowId} className="flex gap-2">
          <select
            name="productId"
            className="flex-1 rounded-md border px-3 py-2 text-sm"
          >
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.sku}
              </option>
            ))}
          </select>
          <input
            name="quantity"
            type="number"
            min="1"
            placeholder="Qty"
            className="w-24 rounded-md border px-3 py-2 text-sm"
          />
          <input
            name="pricePesos"
            type="number"
            step="0.01"
            placeholder="Unit ₱"
            className="w-28 rounded-md border px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => setRows((r) => r.filter((x) => x !== rowId))}
            disabled={rows.length === 1}
            className="rounded-md border px-3 py-2 text-sm disabled:opacity-30"
          >
            ×
          </button>
        </div>
      ))}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setRows((r) => [...r, Date.now()])}
          className="rounded-md border px-4 py-2 text-sm"
        >
          Add line
        </button>
        <button
          type="submit"
          className="rounded-md bg-black px-4 py-2 text-sm text-white"
        >
          Post invoice
        </button>
      </div>
    </form>
  );
}