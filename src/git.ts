import { execFile } from "child_process";

export function git(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("git", args, { cwd, maxBuffer: 20 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr.trim() || err.message));
      else resolve(stdout);
    });
  });
}

export async function isRepo(cwd: string): Promise<boolean> {
  try {
    await git(cwd, ["rev-parse", "--is-inside-work-tree"]);
    return true;
  } catch {
    return false;
  }
}

export async function hasCommits(cwd: string): Promise<boolean> {
  try {
    await git(cwd, ["rev-parse", "--verify", "-q", "HEAD"]);
    return true;
  } catch {
    return false;
  }
}

export async function originUrl(cwd: string): Promise<string | null> {
  try {
    return (await git(cwd, ["remote", "get-url", "origin"])).trim();
  } catch {
    return null;
  }
}

/* returns owner and repo from a GitHub remote URL, for https or ssh */
export function parseRemote(url: string): { owner: string; repo: string } | null {
  const m = /github\.com[:/]([^/]+)\/([^/\s]+?)(\.git)?\/?$/.exec(url.trim());
  return m ? { owner: m[1], repo: m[2] } : null;
}
