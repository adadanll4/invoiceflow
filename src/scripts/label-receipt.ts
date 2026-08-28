import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { extractInvoice } from "../lib/extract";

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
};

async function main() {
  const filename = process.argv[2];
  if (!filename) {
    console.error("Usage: pnpm evals:label <filename-in-evals/receipts>");
    process.exit(1);
  }

  const imagePath = path.join("evals/receipts", filename);
  const ext = path.extname(filename).toLowerCase();
  const mimeType = MIME[ext];

  if (!mimeType) {
    console.error(`Unsupported extension: ${ext}`);
    process.exit(1);
  }

  const bytes = await readFile(imagePath);
  console.log(`Extracting ${filename}...`);
  const result = await extractInvoice(bytes, mimeType);

  const labelPath = path.join(
    "evals/labels",
    filename.replace(/\.[^.]+$/, ".json")
  );

  await mkdir("evals/labels", { recursive: true });
  await writeFile(labelPath, JSON.stringify(result, null, 2));

  console.log(`\nWrote ${labelPath} with ${result.lines.length} lines.`);
  console.log("NOW OPEN IT AND CORRECT IT AGAINST THE ACTUAL RECEIPT.\n");
  process.exit(0);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});