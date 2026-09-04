const MODEL = "gemini-3.6-flash";
const ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/" +
  MODEL +
  ":generateContent";

export type ExtractedLine = {
  description: string;
  quantity: number;
  unitPrice: number;
  serialNumber: string | null;
};

export type ExtractedInvoice = {
  supplierName: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  lines: ExtractedLine[];
};

export const ENDPOINT_URL = ENDPOINT;

export type ImagePart = { bytes: Buffer; mimeType: string };

const PROMPT = [
  "You are reading a supplier invoice or sales receipt.",
  "",
  "If multiple images are provided, they are consecutive sections of the SAME",
  "receipt, photographed in parts. Read them as one continuous document.",
  "Where two images overlap, list each item only ONCE.",
  "",
  "Extract every purchased line item you can see. For each line:",
  "- description: the item text exactly as printed, including brand, size and pack count",
  "- quantity: how many units were purchased, as a number",
  "- unitPrice: the price for ONE unit, as a decimal number without currency symbols",
  "- serialNumber: if the line shows a serial number, IMEI, or unique device",
  "  identifier, put it here. Leave it OUT of the description. Use an empty",
  "  string if there is none.",
  "",
  "Also extract the supplier or store name, the invoice or receipt number, and",
  "the date in YYYY-MM-DD format.",
  "",
  "Rules:",
  "- If a field is unreadable or absent, use an empty string for text and omit the line if quantity or price is unreadable.",
  "- Do not invent values. Do not guess at blurry digits.",
  "- Ignore subtotals, tax lines, discounts, totals and change due. Only actual purchased items.",
  "- If the line shows a total price rather than a unit price, divide by the quantity.",
  "- A serial number is a code identifying ONE physical unit, usually 10-20",
  "  characters mixing letters and digits. Do not confuse it with a model",
  "  number, SKU, or barcode, which describe the product type, not the unit.",
].join("\n");

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
          serialNumber: { type: "STRING" },
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

export async function extractInvoicePages(
  pages: ImagePart[]
): Promise<ExtractedInvoice> {
  const key = process.env.GOOGLE_API_KEY;
  if (!key) throw new Error("GOOGLE_API_KEY is not set");
  if (pages.length === 0) throw new Error("No pages to extract");

  const parts = [
    ...pages.map((p) => ({
      inline_data: {
        mime_type: p.mimeType,
        data: p.bytes.toString("base64"),
      },
    })),
    { text: PROMPT },
  ];

  const res = await fetch(ENDPOINT + "?key=" + key, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
        temperature: 0,
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error("Gemini returned " + res.status + ": " + body);
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
          serialNumber: cleanText(l.serialNumber),
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

export async function extractInvoice(
  bytes: Buffer,
  mimeType: string
): Promise<ExtractedInvoice> {
  return extractInvoicePages([{ bytes, mimeType }]);
}

export async function extractPagesWithRetry(
  pages: ImagePart[],
  attempts = 3
): Promise<ExtractedInvoice> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await extractInvoicePages(pages);
    } catch (e) {
      lastError = e;
      const msg = (e as Error).message;
      if (!msg.includes("503") || i === attempts - 1) throw e;
      const wait = 3000 * (i + 1);
      console.log("Gemini busy, retrying in " + wait / 1000 + "s...");
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastError;
}

export async function extractInvoiceWithRetry(
  bytes: Buffer,
  mimeType: string,
  attempts = 3
): Promise<ExtractedInvoice> {
  return extractPagesWithRetry([{ bytes, mimeType }], attempts);
}