import * as vscode from "vscode";
import { Change } from "./pure";
import { ship } from "./core";
import { getToken } from "./github";

const output = vscode.window.createOutputChannel("Auto Ship");

async function confirmInVSCode(changes: Change[]): Promise<boolean> {
  const config = vscode.workspace.getConfiguration("autoShip");
  if (!config.get<boolean>("confirm", true)) return true;
  const shown = changes.slice(0, 15).map((c) => `${c.path} (${c.status})`).join("\n");
  const more = changes.length > 15 ? `\n...and ${changes.length - 15} more` : "";
  const choice = await vscode.window.showWarningMessage(
    `Auto Ship will commit and push ${changes.length} file(s):\n\n${shown}${more}`,
    { modal: true },
    "Ship"
  );
  return choice === "Ship";
}

async function runFromEditor(): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) throw new Error("Open a project folder first.");
  const config = vscode.workspace.getConfiguration("autoShip");

  const token = await getToken();
  if (!token) throw new Error("No GitHub login found. Sign in to GitHub in Git first.");

  const result = await ship({
    cwd: folder.uri.fsPath,
    token,
    checks: config.get<string[]>("checks", ["lint", "typecheck"]),
    autoMerge: config.get<boolean>("autoMerge", true),
    syncAfterMerge: config.get<boolean>("syncAfterMerge", true),
    repository: config.get<string>("repository", "") || undefined,
    isPrivate: config.get<boolean>("private", false),
    confirm: confirmInVSCode,
    log: (m) => output.appendLine(m),
  });

  if (result.status === "nothing") {
    vscode.window.showInformationMessage("Auto Ship: nothing to ship. There are no changes.");
  } else if (result.status === "shipped") {
    const open = "Open PR";
    const text = result.merged
      ? `Auto Ship: merged PR #${result.pr} and closed issue #${result.issue}.`
      : `Auto Ship: PR #${result.pr} is open for issue #${result.issue}.`;
    vscode.window.showInformationMessage(text, open).then((choice) => {
      if (choice) vscode.env.openExternal(vscode.Uri.parse(result.prUrl));
    });
  }
}

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    output,
    vscode.commands.registerCommand("autoShip.run", () =>
      vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: "Auto Ship", cancellable: false },
        async (progress) => {
          progress.report({ message: "Shipping changes..." });
          try {
            await runFromEditor();
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            output.appendLine(`Error: ${message}`);
            output.show(true);
            vscode.window.showErrorMessage(`Auto Ship: ${message}`);
          }
        }
      )
    )
  );
}

export function deactivate(): void {}
