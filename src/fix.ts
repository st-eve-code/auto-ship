import { execFile } from "child_process";
import { ShipOptions, runChecks, stamp } from "./core";
import { git, originUrl, parseRemote } from "./git";
import { GitHub } from "./github";
import { makeBody, makeReview, parseStatus } from "./pure";

/* A fixer is a command that repairs one kind of problem, plus a command that reports whether the problem is still there. */
export type Fixer = {
  name: string;
  fix?: string; // runs first; any file changes become a pull request
  check?: string; // runs after the fix; a failure with no file changes becomes an issue
};

export const DEFAULT_FIXERS: Fixer[] = [
  { name: "eslint", fix: "npm run lint -- --fix", check: "npm run lint" },
  { name: "typescript", check: "npm run typecheck" },
];

function shell(cmd: string, cwd: string): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolve) => {
    execFile(cmd, { cwd, shell: true, maxBuffer: 20 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({ ok: !err, output: `${stdout}${stderr}` });
    });
  });
}

export type FixOutcome = { name: string; result: "clean" | "pull-request" | "issue" | "skipped"; detail: string };

/* Runs each fixer from the default branch. Nothing is run while the working tree has uncommitted changes. */
export async function runFixers(opts: ShipOptions & { fixers: Fixer[] }): Promise<FixOutcome[]> {
  const { cwd, token, log } = opts;
  if ((await git(cwd, ["status", "--porcelain"])).trim() !== "") {
    throw new Error("Commit or stash your changes before running the fixers.");
  }
  const remote = parseRemote((await originUrl(cwd)) ?? "");
  if (!remote) throw new Error("Fixers need a GitHub origin remote.");

  const gh = new GitHub(token, remote.owner, remote.repo);
  const defaultBranch = await gh.defaultBranch();
  const outcomes: FixOutcome[] = [];

  for (const fixer of opts.fixers) {
    await git(cwd, ["checkout", defaultBranch]);
    await git(cwd, ["pull", "--ff-only", "origin", defaultBranch]);

    if (fixer.fix) {
      const run = await shell(fixer.fix, cwd);
      log(`${fixer.name}: fix ${run.ok ? "finished" : "exited with an error"}`);
    }

    const changes = parseStatus(await git(cwd, ["status", "--porcelain", "-uall"]));
    if (changes.length > 0) {
      const title = `Fix ${changes.length} problem(s) found by ${fixer.name}`;
      const body = makeBody(changes);
      const branch = `auto-ship/fix-${fixer.name}-${stamp()}`;
      await git(cwd, ["checkout", "-b", branch]);
      await git(cwd, ["add", "-A"]);
      await git(cwd, ["commit", "-m", title, "-m", body]);
      await git(cwd, ["push", "-u", "origin", branch]);

      const issue = await gh.createIssue(title, body);
      const pr = await gh.createPullRequest(title, `${body}\n\nCloses #${issue}`, branch, defaultBranch);
      log(`${fixer.name}: opened issue #${issue} and pull request #${pr.number}`);

      const results = await runChecks(cwd, opts.checks);
      await gh.postReview(pr.number, makeReview(results, branch));
      const allPassed = results.every((r) => r.ok);
      if (allPassed && opts.autoMerge) {
        await gh.mergePullRequest(pr.number, title);
        await git(cwd, ["checkout", defaultBranch]);
        await git(cwd, ["pull", "--ff-only", "origin", defaultBranch]);
        log(`${fixer.name}: merged PR #${pr.number}`);
        outcomes.push({ name: fixer.name, result: "pull-request", detail: `merged PR #${pr.number}` });
      } else {
        outcomes.push({ name: fixer.name, result: "pull-request", detail: `PR #${pr.number} left open` });
      }
      continue;
    }

    if (!fixer.check) {
      outcomes.push({ name: fixer.name, result: "clean", detail: "nothing to fix" });
      continue;
    }
    const report = await shell(fixer.check, cwd);
    if (report.ok) {
      log(`${fixer.name}: no problems found`);
      outcomes.push({ name: fixer.name, result: "clean", detail: "no problems found" });
      continue;
    }

    const title = `Fix problems reported by ${fixer.name}`;
    if (await gh.findOpenIssue(title)) {
      log(`${fixer.name}: an open issue already exists`);
      outcomes.push({ name: fixer.name, result: "skipped", detail: "open issue already exists" });
      continue;
    }
    const tail = report.output.slice(-4000);
    const body = [
      `\`${fixer.check}\` failed, and no automatic fix is available for it.`,
      "",
      "```",
      tail,
      "```",
    ].join("\n");
    const issue = await gh.createIssue(title, body);
    log(`${fixer.name}: opened issue #${issue}`);
    outcomes.push({ name: fixer.name, result: "issue", detail: `issue #${issue}` });
  }

  await git(cwd, ["checkout", defaultBranch]);
  return outcomes;
}
