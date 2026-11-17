/* Pure helpers with no VS Code or network access, so they can be tested directly. */

export type Change = { status: string; path: string };

/* files that must never be committed. .env.example is allowed. */
const SECRET_PATTERNS = [
  /(^|\/)\.env(\..+)?$/,
  /\.pem$/,
  /\.key$/,
  /(^|\/)id_(rsa|ed25519)(\.pub)?$/,
  /(^|\/)credentials\.json$/i,
];

/* "owner/name" or "owner/name.git" */
export function parseRepoSpec(spec: string): { owner: string; repo: string } | null {
  const m = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(\.git)?$/.exec(spec.trim());
  return m ? { owner: m[1], repo: m[2] } : null;
}

export function findSecretFiles(paths: string[]): string[] {
  return paths.filter((p) => !p.endsWith(".example") && SECRET_PATTERNS.some((re) => re.test(p)));
}

/* parses `git status --porcelain` output into changed paths */
export function parseStatus(output: string): Change[] {
  return output
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => {
      const status = line.slice(0, 2).trim();
      const raw = line.slice(3);
      const path = raw.includes(" -> ") ? raw.split(" -> ").pop() ?? raw : raw;
      return { status, path: path.replace(/^"|"$/g, "") };
    });
}

const base = (p: string) => p.split("/").pop() ?? p;

/* builds a title from the changed files: the verb comes from what happened to them */
export function makeTitle(changes: Change[]): string {
  if (changes.length === 0) return "Update project";
  const isAdd = (c: Change) => c.status === "??" || c.status === "A";
  const isDelete = (c: Change) => c.status === "D";
  const verb = changes.every(isAdd) ? "Add" : changes.every(isDelete) ? "Remove" : "Update";
  const names = changes.slice(0, 2).map((c) => base(c.path));
  const rest = changes.length - names.length;
  const list = names.join(" and ") + (rest > 0 ? ` and ${rest} more` : "");
  const title = `${verb} ${list}`;
  return title.length > 72 ? `${title.slice(0, 69)}...` : title;
}

const describe = (c: Change) => {
  if (c.status === "??" || c.status === "A") return "added";
  if (c.status === "D") return "deleted";
  if (c.status.startsWith("R")) return "renamed";
  return "modified";
};

export function makeBody(changes: Change[]): string {
  const lines = changes.map((c) => `- \`${c.path}\` (${describe(c)})`);
  return ["Changed files:", "", ...lines].join("\n");
}

export type CheckResult = { name: string; ok: boolean; output: string };

export function makeReview(results: CheckResult[], branch: string): string {
  const rows = results.map((r) => `| \`npm run ${r.name}\` | ${r.ok ? "passed" : "failed"} |`);
  const failed = results.filter((r) => !r.ok);
  const details = failed.map((r) => ["", `<details><summary>${r.name} output</summary>`, "", "```", r.output.slice(-3000), "```", "", "</details>"].join("\n"));
  const summary = results.length === 0
    ? "No checks were configured or found in package.json."
    : failed.length === 0 ? "All checks passed." : `${failed.length} check(s) failed.`;
  return [
    `Automated review for \`${branch}\`.`,
    "",
    summary,
    "",
    "| Check | Result |",
    "| --- | --- |",
    ...rows,
    ...details,
  ].join("\n");
}
