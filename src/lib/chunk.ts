import { config } from "./config";

export type RawChunk = {
  repo: string;
  path: string;
  startLine: number;
  endLine: number;
  text: string;
};

const SKIP_DIR = new Set(["node_modules",".git","dist","build",".next","out","coverage",".turbo",".cache","vendor","__pycache__",".venv","venv","target",".idea",".vscode","Pods","DerivedData"]);
const SKIP_FILES = new Set(["package-lock.json","yarn.lock","pnpm-lock.yaml","Cargo.lock","poetry.lock","composer.lock",".DS_Store"]);
const SKIP_EXT = new Set([".png",".jpg",".jpeg",".gif",".webp",".ico",".bmp",".svg",".mp4",".mp3",".wav",".pdf",".zip",".tar",".gz",".tgz",".woff",".woff2",".ttf",".exe",".dll",".so",".dylib",".bin",".pyc",".class",".map",".min.js",".min.css"]);
const TEXT_EXT = new Set([".ts",".tsx",".js",".jsx",".mjs",".cjs",".py",".go",".rs",".java",".kt",".swift",".c",".cc",".cpp",".h",".hpp",".cs",".rb",".php",".sh",".bash",".sql",".md",".mdx",".txt",".json",".yaml",".yml",".toml",".html",".css",".scss",".vue",".svelte",".graphql",".tf",".xml",".csv"]);

export function shouldSkipDir(name: string): boolean {
  return SKIP_DIR.has(name);
}

export function shouldIndexFile(relPath: string): boolean {
  const parts = relPath.split("/");
  const base = parts[parts.length - 1] || "";
  if (SKIP_FILES.has(base)) return false;
  const lower = base.toLowerCase();
  if (lower === "dockerfile" || lower === "makefile" || lower === "gemfile") return true;
  const dot = lower.lastIndexOf(".");
  if (dot < 0) return false;
  const ext = lower.slice(dot);
  if (SKIP_EXT.has(ext)) return false;
  return TEXT_EXT.has(ext);
}

export function chunkText(repo: string, filePath: string, content: string): RawChunk[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const size = config.chunkSize;
  const overlap = config.chunkOverlap;
  const chunks: RawChunk[] = [];
  let i = 0;
  while (i < lines.length) {
    let charCount = 0;
    let j = i;
    while (j < lines.length && charCount + lines[j].length + 1 <= size) {
      charCount += lines[j].length + 1;
      j++;
    }
    if (j === i) j = i + 1;
    const slice = lines.slice(i, j).join("\n").trimEnd();
    if (slice.trim().length > 0) {
      chunks.push({ repo, path: filePath, startLine: i + 1, endLine: j, text: slice });
    }
    if (j >= lines.length) break;
    let back = 0;
    let overlapChars = 0;
    while (j - 1 - back > i && overlapChars < overlap) {
      overlapChars += lines[j - 1 - back].length + 1;
      back++;
    }
    i = Math.max(i + 1, j - back);
  }
  return chunks;
}

export function chunkId(repo: string, filePath: string, startLine: number, endLine: number): string {
  return repo + "::" + filePath + "::" + startLine + "-" + endLine;
}
