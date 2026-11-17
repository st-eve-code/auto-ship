#!/usr/bin/env node
import * as readline from "readline";
import { ship } from "./core";
import { DEFAULT_FIXERS, runFixers } from "./fix";
import { getToken } from "./github";
import { Change } from "./pure";

const HELP = `Auto Ship: commit, push, check, open an issue and pull request, and merge.

Usage: auto-ship [options]

Run inside a project folder. Your changes are shipped from the current folder.

Options:
  -a, --all             Full run: ship your changes, then run the built-in fixers.
                        Same as running auto-ship and then auto-ship --fix.
  --fix                 Run only the built-in fixers. Each fixer that changes files
                        becomes a pull request; problems that cannot be fixed
                        automatically become issues.
  --repo <owner/name>   GitHub repository to use when the folder has no origin remote.
                        The repository is created if it does not exist.
  --private             Create the repository as private (only with --repo).
  --checks <a,b>        npm scripts to run as the review (default: lint,typecheck).
  --no-merge            Open the pull request but do not merge it.
  --no-sync             Do not switch to the default branch after merging.
  --yes                 Skip the confirmation prompt.
  -h, --help            Show this help.
`;

type Args = {
  all: boolean;
  fix: boolean;
  repo?: string;
  isPrivate: boolean;
  checks: string[];
  autoMerge: boolean;
  syncAfterMerge: boolean;
  yes: boolean;
  help: boolean;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    all: false,
    fix: false,
    isPrivate: false,
    checks: ["lint", "typecheck"],
    autoMerge: true,
    syncAfterMerge: true,
    yes: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") args.help = true;
    else if (a === "-a" || a === "--all") args.all = true;
    else if (a === "--fix") args.fix = true;
    else if (a === "--repo") args.repo = argv[++i];
    else if (a === "--private") args.isPrivate = true;
    else if (a === "--checks") args.checks = (argv[++i] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--no-merge") args.autoMerge = false;
    else if (a === "--no-sync") args.syncAfterMerge = false;
    else if (a === "--yes") args.yes = true;
    else throw new Error(`Unknown option: ${a}`);
  }
  return args;
}

function ask(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(/^y(es)?$/i.test(answer.trim()));
    });
  });
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(HELP);
    return 0;
  }

  const token = await getToken();
  if (!token) {
    console.error("No GitHub login found. Sign in to GitHub in Git first (for example by pushing once from a terminal).");
    return 1;
  }

  const common = {
    cwd: process.cwd(),
    token,
    checks: args.checks,
    autoMerge: args.autoMerge,
    syncAfterMerge: args.syncAfterMerge,
    log: (m: string) => console.log(m),
  };

  if (!args.fix) {
    const result = await ship({
      ...common,
      repository: args.repo,
      isPrivate: args.isPrivate,
      confirm: async (changes: Change[]) => {
        if (args.yes) return true;
        console.log(`Auto Ship will commit and push ${changes.length} file(s):`);
        changes.slice(0, 15).forEach((c) => console.log(`  ${c.path} (${c.status})`));
        if (changes.length > 15) console.log(`  ...and ${changes.length - 15} more`);
        return ask("Ship these changes? [y/N] ");
      },
    });
    if (result.status === "shipped") {
      console.log(result.merged
        ? `Done: merged PR #${result.pr} and closed issue #${result.issue}. ${result.prUrl}`
        : `Done: PR #${result.pr} is open for issue #${result.issue}. ${result.prUrl}`);
    }
    if (result.status === "cancelled") return 0;
    if (!args.all) return 0;
  }

  if (args.all || args.fix) {
    const outcomes = await runFixers({
      ...common,
      isPrivate: false,
      confirm: async () => true,
      fixers: DEFAULT_FIXERS,
    });
    outcomes.forEach((o) => console.log(`${o.name}: ${o.result} (${o.detail})`));
  }
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(`Auto Ship: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
