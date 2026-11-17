import { spawn } from "child_process";

/* The token comes from the same credential store Git uses, so nothing is stored in VS Code settings. */
export function getToken(): Promise<string | null> {
  return new Promise((resolve) => {
    const child = spawn("git", ["credential", "fill"]);
    let out = "";
    child.stdout.on("data", (d) => (out += d.toString()));
    child.on("error", () => resolve(null));
    child.on("close", () => {
      const line = out.split("\n").find((l) => l.startsWith("password="));
      resolve(line ? line.slice("password=".length).trim() : null);
    });
    child.stdin.end("protocol=https\nhost=github.com\n\n");
  });
}

async function api<T>(token: string, method: string, path: string, body?: unknown): Promise<T | null> {
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub ${method} ${path} failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

export async function currentLogin(token: string): Promise<string> {
  const user = await api<{ login: string }>(token, "GET", "/user");
  if (!user) throw new Error("Could not read the GitHub account for this login.");
  return user.login;
}

/* creates the repository if it does not exist yet. Returns true when it was created. */
export async function ensureRepo(token: string, owner: string, repo: string, isPrivate: boolean): Promise<boolean> {
  if (await api(token, "GET", `/repos/${owner}/${repo}`)) return false;
  const login = await currentLogin(token);
  const body = { name: repo, private: isPrivate, auto_init: false };
  const path = owner.toLowerCase() === login.toLowerCase() ? "/user/repos" : `/orgs/${owner}/repos`;
  await api(token, "POST", path, body);
  return true;
}

export class GitHub {
  constructor(private token: string, private owner: string, private repo: string) {}

  private call<T>(method: string, path: string, body?: unknown): Promise<T> {
    return api<T>(this.token, method, `/repos/${this.owner}/${this.repo}${path}`, body).then((r) => {
      if (r === null) throw new Error(`GitHub ${method} ${path}: not found`);
      return r;
    });
  }

  async defaultBranch(): Promise<string> {
    return (await this.call<{ default_branch: string }>("GET", "")).default_branch;
  }

  async createIssue(title: string, body: string): Promise<number> {
    return (await this.call<{ number: number }>("POST", "/issues", { title, body })).number;
  }

  async findOpenIssue(title: string): Promise<number | null> {
    const issues = await this.call<{ number: number; title: string; pull_request?: unknown }[]>(
      "GET",
      "/issues?state=open&per_page=100"
    );
    const hit = issues.find((i) => !i.pull_request && i.title === title);
    return hit ? hit.number : null;
  }

  async createPullRequest(title: string, body: string, head: string, base: string): Promise<{ number: number; url: string }> {
    const pr = await this.call<{ number: number; html_url: string }>("POST", "/pulls", { title, body, head, base });
    return { number: pr.number, url: pr.html_url };
  }

  /* GitHub does not allow approving your own pull request, so the review is a comment */
  async postReview(pr: number, body: string): Promise<void> {
    await this.call("POST", `/pulls/${pr}/reviews`, { event: "COMMENT", body });
  }

  async mergePullRequest(pr: number, title: string): Promise<void> {
    await this.call("PUT", `/pulls/${pr}/merge`, { merge_method: "merge", commit_title: title });
  }
}
