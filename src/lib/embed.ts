const EMBEDDING_MODEL = "gemini-embedding-001";
const DIMENSIONS = 768;
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent`;

export async function embed(text: string): Promise<number[]> {
  const key = process.env.GOOGLE_API_KEY;
  if (!key) throw new Error("GOOGLE_API_KEY is not set");

  const clean = text.trim();
  if (!clean) throw new Error("Cannot embed empty text");

  const res = await fetch(`${ENDPOINT}?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: `models/${EMBEDDING_MODEL}`,
      content: { parts: [{ text: clean }] },
      outputDimensionality: DIMENSIONS,
    }),
  });

  if (!res.ok) {
    throw new Error(`Embedding failed ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  const values = data?.embedding?.values;

  if (!Array.isArray(values) || values.length !== DIMENSIONS) {
    throw new Error(`Expected ${DIMENSIONS} numbers, got ${values?.length}`);
  }

  const magnitude = Math.sqrt(values.reduce((s: number, v: number) => s + v * v, 0));
  return magnitude > 0 ? values.map((v: number) => v / magnitude) : values;
}

export function productText(p: {
  sku: string;
  name: string;
  unit: string;
}): string {
  return `${p.name} (SKU ${p.sku}, sold by ${p.unit})`;
}