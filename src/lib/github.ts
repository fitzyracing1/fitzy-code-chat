import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { config } from "./config";

export type RepoInfo = { name: string; fullName: string; cloneUrl: string; defaultBranch: string; };

function token(): string {
  if (config.githubToken) return config.githubToken;
  try {
    return execFileSync("gh", ["auth", "token"], { encoding: "utf8" }).trim();
  } catch {
    throw new Error("Set GITHUB_TOKEN/GH_TOKEN or run gh auth login");
  }
}

async function ghJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: "Bearer " + token(),
      "User-Agent": "fitzy-code-chat",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error("GitHub API " + res.status + ": " + body);
  }
  return res.json() as Promise<T>;
}

export async function listOwnerRepos(): Promise<RepoInfo[]> {
  const owner = config.githubOwner;
  const repos: RepoInfo[] = [];
  let page = 1;
  while (true) {
    const batch = await ghJson<Array<{ name: string; full_name: string; clone_url: string; default_branch: string; fork: boolean; }>>(
      "https://api.github.com/users/" + owner + "/repos?per_page=100&type=owner&page=" + page
    );
    if (batch.length === 0) break;
    for (const r of batch) {
      if (!config.includeMegaSnapshot && r.name === config.megaSnapshotRepo) continue;
      repos.push({ name: r.name, fullName: r.full_name, cloneUrl: r.clone_url, defaultBranch: r.default_branch || "main" });
    }
    if (batch.length < 100) break;
    page++;
  }
  return repos.sort((a, b) => a.name.localeCompare(b.name));
}

export function ensureCacheDir(): string {
  fs.mkdirSync(config.cacheDir, { recursive: true });
  return config.cacheDir;
}

export function shallowClone(repo: RepoInfo): string {
  const dest = path.join(ensureCacheDir(), repo.name);
  if (fs.existsSync(path.join(dest, ".git"))) {
    try {
      execFileSync("git", ["-C", dest, "fetch", "--depth", "1", "origin", repo.defaultBranch], { stdio: "ignore" });
      execFileSync("git", ["-C", dest, "reset", "--hard", "FETCH_HEAD"], { stdio: "ignore" });
      return dest;
    } catch {
      fs.rmSync(dest, { recursive: true, force: true });
    }
  }
  if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
  const url = repo.cloneUrl.replace("https://github.com/", "https://x-access-token:" + token() + "@github.com/");
  execFileSync("git", ["clone", "--depth", "1", "--single-branch", url, dest], { stdio: "ignore" });
  return dest;
}
