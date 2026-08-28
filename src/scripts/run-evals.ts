import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { extractInvoice, type ExtractedLine } from "../lib/extract";

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
};

const MATCH_THRESHOLD = 0.4;
const DELAY_MS = 2000;

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");
}

function tokenSet(s: string): Set<string> {
  return new Set(normalize(s).split(" ").filter(Boolean));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  const intersection = [...a].filter((x) => b.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

type Pairing = {
  truth: ExtractedLine;
  predicted: ExtractedLine;
  score: number;
};

function pairLines(truth: ExtractedLine[], predicted: ExtractedLine[]) {
  const candidates: { t: number; p: number; score: number }[] = [];

  truth.forEach((tLine, t) => {
    const tTokens = tokenSet(tLine.description);
    predicted.forEach((pLine, p) => {
      const score = jaccard(tTokens, tokenSet(pLine.description));
      if (score >= MATCH_THRESHOLD) candidates.push({ t, p, score });
    });
  });

  candidates.sort((a, b) => b.score - a.score);

  const usedTruth = new Set<number>();
  const usedPred = new Set<number>();
  const pairs: Pairing[] = [];

  for (const c of candidates) {
    if (usedTruth.has(c.t) || usedPred.has(c.p)) continue;
    usedTruth.add(c.t);
    usedPred.add(c.p);
    pairs.push({ truth: truth[c.t], predicted: predicted[c.p], score: c.score });
  }

  return {
    pairs,
    missed: truth.filter((_, i) => !usedTruth.has(i)),
    spurious: predicted.filter((_, i) => !usedPred.has(i)),
  };
}

function pricesMatch(a: number, b: number): boolean {
  return Math.abs(Math.round(a * 100) - Math.round(b * 100)) <= 1;
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      const msg = (e as Error).message;
      const retryable = msg.includes("503") || msg.includes("429");
      if (!retryable || i === attempts - 1) throw e;
      const wait = 5000 * Math.pow(2, i);
      console.log(`    retrying in ${wait / 1000}s...`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastError;
}

async function main() {
  const files = (await readdir("evals/receipts")).filter(
    (f) => MIME[path.extname(f).toLowerCase()]
  );

  if (files.length === 0) {
    console.error("No receipts found in evals/receipts/");
    process.exit(1);
  }

  let tp = 0;
  let fp = 0;
  let fn = 0;
  let qtyCorrect = 0;
  let priceCorrect = 0;
  let supplierCorrect = 0;
  let supplierTotal = 0;
  let dateCorrect = 0;
  let dateTotal = 0;

  const perFile: Record<string, unknown>[] = [];
  const errored: string[] = [];

  for (const file of files) {
    const labelPath = path.join(
      "evals/labels",
      file.replace(/\.[^.]+$/, ".json")
    );

    let truth;
    try {
      truth = JSON.parse(await readFile(labelPath, "utf8"));
    } catch {
      console.warn(`  skip ${file} (no label file)`);
      continue;
    }

    let predicted;
    try {
      const bytes = await readFile(path.join("evals/receipts", file));
      predicted = await withRetry(() =>
        extractInvoice(bytes, MIME[path.extname(file).toLowerCase()])
      );
    } catch (e) {
      const msg = (e as Error).message;
      console.error(`  ERROR ${file}: ${msg.slice(0, 120)}`);
      errored.push(file);
      await new Promise((r) => setTimeout(r, DELAY_MS));
      continue;
    }

    const { pairs, missed, spurious } = pairLines(truth.lines, predicted.lines);

    tp += pairs.length;
    fn += missed.length;
    fp += spurious.length;

    let fileQty = 0;
    let filePrice = 0;
    for (const pair of pairs) {
      if (pair.truth.quantity === pair.predicted.quantity) {
        qtyCorrect++;
        fileQty++;
      }
      if (pricesMatch(pair.truth.unitPrice, pair.predicted.unitPrice)) {
        priceCorrect++;
        filePrice++;
      }
    }

    if (truth.supplierName) {
      supplierTotal++;
      if (
        predicted.supplierName &&
        normalize(predicted.supplierName) === normalize(truth.supplierName)
      ) {
        supplierCorrect++;
      }
    }

    if (truth.invoiceDate) {
      dateTotal++;
      if (predicted.invoiceDate === truth.invoiceDate) dateCorrect++;
    }

    console.log(
      `  ${file}: ${pairs.length}/${truth.lines.length} lines, ` +
        `${fileQty} qty ok, ${filePrice} price ok` +
        (spurious.length ? `, ${spurious.length} spurious` : "")
    );

    perFile.push({
      file,
      truthLines: truth.lines.length,
      matched: pairs.length,
      missed: missed.map((m) => m.description),
      spurious: spurious.map((s) => s.description),
      qtyCorrect: fileQty,
      priceCorrect: filePrice,
    });

    await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
  const f1 =
    precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);

  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

  console.log("\n" + "=".repeat(46));
  console.log(`Receipts evaluated     ${perFile.length}`);
  console.log(`Receipts errored       ${errored.length}`);
  console.log(`Lines in ground truth  ${tp + fn}`);
  console.log("-".repeat(46));
  console.log(`Line precision         ${pct(precision)}`);
  console.log(`Line recall            ${pct(recall)}`);
  console.log(`Line F1                ${pct(f1)}`);
  console.log("-".repeat(46));
  console.log(`Quantity accuracy      ${pct(tp === 0 ? 0 : qtyCorrect / tp)}`);
  console.log(`Unit price accuracy    ${pct(tp === 0 ? 0 : priceCorrect / tp)}`);
  console.log(
    `Supplier name          ${pct(supplierTotal === 0 ? 0 : supplierCorrect / supplierTotal)}`
  );
  console.log(
    `Invoice date           ${pct(dateTotal === 0 ? 0 : dateCorrect / dateTotal)}`
  );
  console.log("=".repeat(46) + "\n");

  if (errored.length > 0) {
    console.log(`Errored: ${errored.join(", ")}\n`);
  }

  await mkdir("evals/results", { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = `evals/results/${stamp}.json`;
  await writeFile(
    outPath,
    JSON.stringify(
      {
        runAt: new Date().toISOString(),
        receipts: perFile.length,
        errored,
        precision,
        recall,
        f1,
        qtyAccuracy: tp === 0 ? 0 : qtyCorrect / tp,
        priceAccuracy: tp === 0 ? 0 : priceCorrect / tp,
        perFile,
      },
      null,
      2
    )
  );

  console.log(`Saved ${outPath}\n`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
