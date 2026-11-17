import { execFile } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { git, hasCommits, isRepo, originUrl, parseRemote } from "./git";
import { GitHub, ensureRepo } from "./github";
import { Change, CheckResult, findSecretFiles, makeBody, makeReview, makeTitle, parseRepoSpec, parseStatus } from "./pure";

export type ShipOptions = {
  cwd: string;
  token: string;
  checks: string[];
  autoMerge: boolean;
  syncAfterMerge: boolean;
  repository?: string;
  isPrivate: boolean;
  confirm: (changes: Change[]) => Promise<boolean>;
  log: (message: string) => void;
};

export type ShipResult =
  | { status: "nothing" }
  | { status: "cancelled" }
  | { status: "initial"; branch: string }
  | { status: "shipped"; issue: number; pr: number; prUrl: string; merged: boolean };

/* runs the npm scripts in `names`. Scripts missing from package.json are skipped. */
export function runChecks(cwd: string, names: string[]): Promise<CheckResult[]> {
  const pkgPath = path.join(cwd, "package.json");
  const scripts: Record<string, string> = fs.existsSync(pkgPath)
    ? JSON.parse(fs.readFileSync(pkgPath, "utf8")).scripts ?? {}
    : {};
  const toRun = names.filter((n) => scripts[n]);
  return Promise.all(
    toRun.map(
      (name) =>
        new Promise<CheckResult>((resolve) => {
          execFile("npm", ["run", name], { cwd, shell: true, maxBuffer: 20 * 1024 * 1024 }, (err, stdout, stderr) => {
            resolve({ name, ok: !err, output: `${stdout}${stderr}` });
          });
        })
    )
  );
}

export const stamp = () => new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);

export async function ship(opts: ShipOptions): Promise<ShipResult> {
  const { cwd, token, log } = opts;

  if (!(await isRepo(cwd))) {
    await git(cwd, ["init", "-b", "main"]);
    log("Initialized a Git repository.");
  }

  const changes = parseStatus(await git(cwd, ["status", "--porcelain", "-uall"]));
  if (changes.length === 0) {
    log("Nothing to ship. There are no changes.");
    return { status: "nothing" };
  }

  const secrets = findSecretFiles(changes.map((c) => c.path));
  if (secrets.length > 0) {
    throw new Error(`Refusing to ship secret files: ${secrets.join(", ")}. Add them to .gitignore first.`);
  }

  if (!(await opts.confirm(changes))) {
    log("Cancelled.");
    return { status: "cancelled" };
  }

  let remote = parseRemote((await originUrl(cwd)) ?? "");
  if (!remote) {
    if (!opts.repository) {
      throw new Error("No GitHub origin remote. Set the repository (owner/name) in Auto Ship settings or add an origin remote.");
    }
    const spec = parseRepoSpec(opts.repository);
    if (!spec) throw new Error(`Repository "${opts.repository}" must look like owner/name.`);
    const created = await ensureRepo(token, spec.owner, spec.repo, opts.isPrivate);
    log(created ? `Created GitHub repository ${spec.owner}/${spec.repo}.` : `Using existing repository ${spec.owner}/${spec.repo}.`);
    await git(cwd, ["remote", "add", "origin", `https://github.com/${spec.owner}/${spec.repo}.git`]);
    remote = spec;
  }

  const gh = new GitHub(token, remote.owner, remote.repo);
  const defaultBranch = await gh.defaultBranch();
  const title = makeTitle(changes);
  const body = makeBody(changes);

  await git(cwd, ["add", "-A"]);

  if (!(await hasCommits(cwd))) {
    /* the first commit goes straight to the default branch, because a pull request needs a base branch */
    await git(cwd, ["checkout", "-B", defaultBranch]);
    await git(cwd, ["commit", "-m", title, "-m", body]);
    await git(cwd, ["push", "-u", "origin", defaultBranch]);
    log(`Pushed the first commit to ${defaultBranch}. Run Auto Ship again to start the issue and pull request cycle.`);
    return { status: "initial", branch: defaultBranch };
  }

  const current = (await git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"])).trim();
  const branch = current === defaultBranch ? `auto-ship/${stamp()}` : current;
  if (branch !== current) await git(cwd, ["checkout", "-b", branch]);

  await git(cwd, ["commit", "-m", title, "-m", body]);
  log(`Committed: ${title}`);
  await git(cwd, ["push", "-u", "origin", branch]);
  log(`Pushed ${branch}`);

  const issue = await gh.createIssue(title, body);
  log(`Opened issue #${issue}`);
  const pr = await gh.createPullRequest(title, `${body}\n\nCloses #${issue}`, branch, defaultBranch);
  log(`Opened pull request #${pr.number}: ${pr.url}`);

  const results = await runChecks(cwd, opts.checks);
  results.forEach((r) => log(`${r.name}: ${r.ok ? "passed" : "failed"}`));
  await gh.postReview(pr.number, makeReview(results, branch));

  const allPassed = results.every((r) => r.ok);
  if (!allPassed || !opts.autoMerge) {
    return { status: "shipped", issue, pr: pr.number, prUrl: pr.url, merged: false };
  }

  await gh.mergePullRequest(pr.number, title);
  log(`Merged PR #${pr.number}`);

  if (opts.syncAfterMerge) {
    await git(cwd, ["checkout", defaultBranch]);
    await git(cwd, ["pull", "--ff-only", "origin", defaultBranch]);
    log(`Updated ${defaultBranch}`);
  }
  return { status: "shipped", issue, pr: pr.number, prUrl: pr.url, merged: true };
}
