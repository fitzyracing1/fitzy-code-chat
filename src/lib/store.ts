import fs from "fs";
import path from "path";
import { config, type ChunkRecord, type Citation } from "./config";

type Stored = Omit<ChunkRecord, "vector"> & { vector: number[] };

function dbPath(): string {
  fs.mkdirSync(config.vectorsDir, { recursive: true });
  return path.join(config.vectorsDir, "chunks.jsonl");
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

let cache: Stored[] | null = null;

export function loadStore(): Stored[] {
  if (cache) return cache;
  const p = dbPath();
  if (!fs.existsSync(p)) { cache = []; return cache; }
  const lines = fs.readFileSync(p, "utf8").split("\n").filter(Boolean);
  cache = lines.map((l) => JSON.parse(l) as Stored);
  return cache;
}

export function invalidateStoreCache(): void { cache = null; }

export function upsertChunks(records: ChunkRecord[]): void {
  const existing = new Map(loadStore().map((r) => [r.id, r]));
  for (const r of records) existing.set(r.id, r);
  const all = Array.from(existing.values());
  const p = dbPath();
  const tmp = p + ".tmp";
  fs.writeFileSync(tmp, all.map((r) => JSON.stringify(r)).join("\n") + (all.length ? "\n" : ""));
  fs.renameSync(tmp, p);
  cache = all;
}

export function deleteRepoChunks(repo: string): void {
  const kept = loadStore().filter((r) => r.repo !== repo);
  const p = dbPath();
  const tmp = p + ".tmp";
  fs.writeFileSync(tmp, kept.map((r) => JSON.stringify(r)).join("\n") + (kept.length ? "\n" : ""));
  fs.renameSync(tmp, p);
  cache = kept;
}

export function search(queryVector: number[], topK = config.topK): Citation[] {
  const rows = loadStore();
  const scored = rows.map((r) => ({ r, score: cosine(queryVector, r.vector) }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK).map(({ r, score }) => ({
    repo: r.repo,
    path: r.path,
    startLine: r.startLine,
    endLine: r.endLine,
    score,
    preview: r.text.slice(0, 500),
  }));
}

export function storeStats(): { chunks: number; repos: number } {
  const rows = loadStore();
  return { chunks: rows.length, repos: new Set(rows.map((r) => r.repo)).size };
}
