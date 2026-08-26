const MODEL = "gemini-3.6-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

export type ExtractedLine = {
  description: string;
  quantity: number;
  unitPrice: number;
};

export type ExtractedInvoice = {
  supplierName: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  lines: ExtractedLine[];
};

const PROMPT = `You are reading a supplier invoice or sales receipt.

Extract every purchased line item you can see. For each line:
- description: the item text exactly as printed, including brand, size and pack count
- quantity: how many units were purchased, as a number
- unitPrice: the price for ONE unit, as a decimal number without currency symbols

Also extract the supplier or store name, the invoice or receipt number, and the
date in YYYY-MM-DD format.

Rules:
- If a field is unreadable or absent, use an empty string for text and omit the line if quantity or price is unreadable.
- Do not invent values. Do not guess at blurry digits.
- Ignore subtotals, tax lines, discounts, totals and change due. Only actual purchased items.
- If the line shows a total price rather than a unit price, divide by the quantity.`;

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    supplierName: { type: "STRING" },
    invoiceNumber: { type: "STRING" },
    invoiceDate: { type: "STRING" },
    lines: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          description: { type: "STRING" },
          quantity: { type: "NUMBER" },
          unitPrice: { type: "NUMBER" },
        },
        required: ["description", "quantity", "unitPrice"],
      },
    },
  },
  required: ["lines"],
};

function cleanText(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length > 0 ? s : null;
}

function cleanDate(v: unknown): string | null {
  const s = cleanText(v);
  return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

export async function extractInvoice(
  bytes: Buffer,
  mimeType: string
): Promise<ExtractedInvoice> {
  const key = process.env.GOOGLE_API_KEY;
  if (!key) throw new Error("GOOGLE_API_KEY is not set");

  const res = await fetch(`${ENDPOINT}?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              inline_data: {
                mime_type: mimeType,
                data: bytes.toString("base64"),
              },
            },
            { text: PROMPT },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
        temperature: 0,
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`Gemini returned ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Model returned no content");

  const parsed = JSON.parse(text);

  const lines: ExtractedLine[] = Array.isArray(parsed.lines)
    ? parsed.lines
        .map((l: Record<string, unknown>) => ({
          description: String(l.description ?? "").trim(),
          quantity: Number(l.quantity),
          unitPrice: Number(l.unitPrice),
        }))
        .filter(
          (l: ExtractedLine) =>
            l.description.length > 0 &&
            Number.isFinite(l.quantity) &&
            l.quantity > 0 &&
            Number.isFinite(l.unitPrice) &&
            l.unitPrice >= 0
        )
    : [];

  return {
    supplierName: cleanText(parsed.supplierName),
    invoiceNumber: cleanText(parsed.invoiceNumber),
    invoiceDate: cleanDate(parsed.invoiceDate),
    lines,
  };
}

