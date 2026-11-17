# Auto Ship

[![npm version](https://img.shields.io/npm/v/@st-eve-code/auto-ship)](https://www.npmjs.com/package/@st-eve-code/auto-ship)
[![npm downloads](https://img.shields.io/npm/dm/@st-eve-code/auto-ship)](https://www.npmjs.com/package/@st-eve-code/auto-ship)
[![VS Code Marketplace](https://img.shields.io/badge/VS%20Code-Marketplace-blue)](https://marketplace.visualstudio.com/items?itemName=st-eve-code.auto-ship)

Ship your changes to GitHub in one step. Auto Ship:

1. Checks that no secret files (such as `.env`) are being committed.
2. Shows the list of files and asks you to confirm (you can turn this off).
3. Creates a branch if you are on the default branch.
4. Commits the changes. The title and file list are generated from the changed files.
5. Pushes the branch.
6. Opens an issue and a pull request that closes it.
7. Runs your checks (default: `npm run lint` and `npm run typecheck`) and posts the results as a review comment on the pull request.
8. Merges the pull request if every check passed, then switches to the default branch and pulls.

If a check fails, the pull request stays open and the failing output is in the review comment.

Auto Ship runs one cycle per run. It doesn't pick up existing issues or write fixes for them.

## Links

- **npm package:** [@st-eve-code/auto-ship](https://www.npmjs.com/package/@st-eve-code/auto-ship) — `npx @st-eve-code/auto-ship -a`
- **GitHub package:** [@st-eve-code/auto-ship](https://github.com/st-eve-code/auto-ship/pkgs/npm/auto-ship)
- **VS Code extension:** [Auto Ship on the Marketplace](https://marketplace.visualstudio.com/items?itemName=st-eve-code.auto-ship)

## Requirements

- Git on your `PATH`.
- A GitHub login saved in Git's credential store (the one you use to push). Auto Ship reads it with `git credential fill`, so no token is stored in settings.
- Node.js 20 or newer, if you use the command-line tool.
- VS Code 1.90 or newer, if you use the extension.

## Use it in VS Code

Open the command palette and run **Auto Ship: Commit, Push, Review and Merge**.

## Use it from a terminal

Install the command-line tool from npm:

```bash
npx @st-eve-code/auto-ship -a
```

Or install it globally:

```bash
npm install -g @st-eve-code/auto-ship
```

For a local checkout, run `npm install && npm run compile && npm link` instead.

Then, in any project folder:

```bash
auto-ship            # ship your changes: commit, push, issue, pull request, review, merge
auto-ship -a         # full run: ship your changes, then run the built-in fixers
auto-ship --yes      # no confirmation prompt
auto-ship --help     # all options
```

`-a` (`--all`) is the one command that does everything. It ships your changes first, then runs the fixers from the next section.

## Find and fix problems (no AI)

`auto-ship --fix` runs a fixed list of tools. It needs no AI and no API key:

| Fixer | Fix command | Check command |
| --- | --- | --- |
| `eslint` | `npm run lint -- --fix` | `npm run lint` |
| `typescript` | none (reports only) | `npm run typecheck` |

For each fixer, it runs from the default branch:

- If the fix changes files, it opens an issue, commits on its own branch, opens a pull request that closes the issue, runs your checks, and merges if they pass.
- If the check fails and nothing can be fixed automatically, it opens one issue with the tool output. It won't open another while that issue is still open.
- If the working tree has uncommitted changes, it stops without running anything.

The fixer list is in `DEFAULT_FIXERS` in `src/fix.ts`. Add entries there to cover more tools, such as a formatter or a markdown linter.

## Ship a new project

For a folder that has no GitHub repository yet, set the repository and Auto Ship will:

1. Run `git init` if needed.
2. Create the repository on GitHub if it doesn't exist.
3. Add `origin`, then push the first commit to the default branch.

The first run only pushes the first commit, because a pull request needs a base branch. Run Auto Ship again after that to start the issue and pull request cycle.

```bash
auto-ship --repo your-name/new-project            # public repository
auto-ship --repo your-name/new-project --private  # private repository
```

In VS Code, set **Auto Ship: Repository** to `your-name/new-project` in settings.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `autoShip.checks` | `["lint", "typecheck"]` | npm scripts to run for the review. Missing scripts are skipped. |
| `autoShip.autoMerge` | `true` | Merge automatically when every check passes. |
| `autoShip.syncAfterMerge` | `true` | After merging, switch to the default branch and pull. |
| `autoShip.confirm` | `true` | Show the file list and ask before committing. |
| `autoShip.repository` | `""` | `owner/name` to use when the folder has no origin remote. |
| `autoShip.private` | `false` | Create the repository as private when it is created from `autoShip.repository`. |

The command-line tool uses the same defaults, and `--checks`, `--no-merge`, `--no-sync`, `--repo`, `--private`, and `--yes` change them.

## Notes

- Titles come from the changed files, for example "Update mail.ts and site.ts". No AI model writes them.
- GitHub doesn't let you approve your own pull request, so the review is posted as a comment.
- Auto Ship stages everything with `git add -A`. Check the list it shows before confirming.
- The secret check covers common names (`.env`, `*.pem`, `*.key`, `id_rsa`, `credentials.json`). It is not a complete safety net.

## Publish to the VS Code Marketplace

Publishing needs three things: a publisher, a way to authenticate, and a publish command.

### 1. Create a publisher

1. Open the [Visual Studio Marketplace publisher management page](https://marketplace.visualstudio.com/manage) and sign in with a Microsoft account.
2. Select **Create publisher**.
3. Enter an **ID** and a **Name**. The ID appears in extension URLs and cannot be changed later. It must match `"publisher"` in `package.json` (currently `st-eve-code`).

### 2. Authenticate

Microsoft is retiring global Personal Access Tokens (PATs) in Azure DevOps on **December 1, 2026**. Use Trusted Publishing from GitHub Actions. It needs no stored secret.

**Trusted Publishing (recommended):**

1. On the publisher management page, open your publisher and select **Trusted Publishing**.
2. Select **Create** and fill in:
   - **Policy name:** `Release workflow`
   - **Repository owner:** `st-eve-code`
   - **Repository:** `auto-ship`
   - **Workflow:** `publish.yml`
   - **Environment:** leave empty
3. Select **Create**.
4. The workflow in `.github/workflows/publish.yml` already requests the token. Push a version tag to publish:

```bash
git tag v0.1.0
git push origin v0.1.0
```

For a private repository, the first successful run must happen within 48 hours of creating the policy.

**PAT (only until December 1, 2026):** Create a token at Azure DevOps (User settings → Personal access tokens) with organization **All accessible organizations** and the scope **Marketplace → Manage**. Then run `npx @vscode/vsce login st-eve-code` and paste the token.

### 3. Publish from your machine

```bash
npm install
npm run compile
npx @vscode/vsce publish
```

To publish a new version, bump `version` in `package.json` first, or run `npx @vscode/vsce publish minor` (or `patch`, `major`).

### Before you publish

- The icon is `images/icon.png`, 256×256 PNG. The Marketplace rejects SVG icons.
- `repository` in `package.json` must point to a real repository. Create `st-eve-code/auto-ship` on GitHub and push this folder to it before publishing.
- Keep the extension name unique. Once an extension is removed, its name can't be reused.

### How users install it

After publishing, users open the Extensions view in VS Code, search for **Auto Ship**, and select **Install**. Terminal users can also install the command-line tool from the repository with the steps under "Use it from a terminal".
