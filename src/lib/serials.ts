import { ENDPOINT_URL, type ImagePart } from "./extract";

const SERIAL_PROMPT = [
  "You are reading serial numbers from an invoice or packing list.",
  "",
  "The images show a purchase of this item:",
  "  {{ITEM}}",
  "",
  "The invoice says the quantity is {{COUNT}} units, so there should be",
  "roughly that many serial numbers listed.",
  "",
  "Extract EVERY serial number, IMEI, or unique device identifier you can",
  "read, in the order they appear.",
  "",
  "Rules:",
  "- Return ONLY serial numbers. Not model numbers, not SKUs, not part",
  "  numbers, not barcodes, not the invoice number.",
  "- A serial identifies ONE physical unit. A model number is the same on",
  "  every unit of that product.",
  "- Do NOT pad the list to reach the expected count. If you can only read",
  "  94 clearly, return exactly those 94.",
  "- Do NOT guess at characters you cannot see. Skip the entry instead.",
  "- Do not list the same serial twice.",
  "- Preserve the exact characters. Do not correct what looks like a typo.",
].join("\n");

const SERIAL_SCHEMA = {
  type: "OBJECT",
  properties: {
    serials: {
      type: "ARRAY",
      items: { type: "STRING" },
    },
  },
  required: ["serials"],
};

export type SerialScanResult = {
  serials: string[];
  duplicatesDropped: number;
  lengthOutliers: string[];
};

export async function extractSerials(
  pages: ImagePart[],
  itemDescription: string,
  expectedCount: number
): Promise<SerialScanResult> {
  const key = process.env.GOOGLE_API_KEY;
  if (!key) throw new Error("GOOGLE_API_KEY is not set");
  if (pages.length === 0) throw new Error("No pages to scan");

  const prompt = SERIAL_PROMPT.replace("{{ITEM}}", itemDescription).replace(
    "{{COUNT}}",
    String(expectedCount)
  );

  const parts = [
    ...pages.map((p) => ({
      inline_data: {
        mime_type: p.mimeType,
        data: p.bytes.toString("base64"),
      },
    })),
    { text: prompt },
  ];

  const res = await fetch(ENDPOINT_URL + "?key=" + key, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: SERIAL_SCHEMA,
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
  const raw: unknown[] = Array.isArray(parsed.serials) ? parsed.serials : [];

  const seen = new Set<string>();
  const clean: string[] = [];
  let duplicatesDropped = 0;

  for (const item of raw) {
    const s = String(item ?? "").trim().toUpperCase();
    if (s.length < 4) continue;
    if (seen.has(s)) {
      duplicatesDropped++;
      continue;
    }
    seen.add(s);
    clean.push(s);
  }

  const counts = new Map<number, number>();
  for (const s of clean) {
    counts.set(s.length, (counts.get(s.length) ?? 0) + 1);
  }

  let modeLength = 0;
  let modeFreq = 0;
  for (const [len, freq] of counts) {
    if (freq > modeFreq) {
      modeFreq = freq;
      modeLength = len;
    }
  }

  const lengthOutliers =
    clean.length >= 5 ? clean.filter((s) => s.length !== modeLength) : [];

  return { serials: clean, duplicatesDropped, lengthOutliers };
}

export async function scanSerialsWithRetry(
  pages: ImagePart[],
  itemDescription: string,
  expectedCount: number,
  attempts = 3
): Promise<SerialScanResult> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await extractSerials(pages, itemDescription, expectedCount);
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