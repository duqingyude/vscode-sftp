import * as vscode from 'vscode';
import * as l10n from '@vscode/l10n';
import { COMMAND_PYTHON_RUN_FILE } from '../constants';
import { SshPseudoTerminal } from '../core/remote-client/sshPseudoTerminal';
import { checkCommand } from './abstract/createCommand';
import { uploadFile } from '../fileHandlers';
import {
  PythonService, resolveRemoteContext,
} from '../modules/python/pythonService';
import {
  updatePythonField, findWorkspaceForHost, lookupFileArgs,
  PythonConfigField,
} from '../modules/python/pythonConfig';
import { buildPythonCommand } from '../modules/python/pythonRunner';

const service = new PythonService();

export default checkCommand({
  id: COMMAND_PYTHON_RUN_FILE,

  async handleCommand(itemOrUri?: any) {
    const ctx = await resolveRemoteContext(itemOrUri);
    if (!ctx) return;
    const { fileService, config, client, remoteUri, remoteFs, localUri } = ctx;

    if (config.protocol !== 'sftp') {
      vscode.window.showWarningMessage(l10n.t('Run Python requires SFTP protocol.'));
      return;
    }

    // ---- Check if remote file exists; if not and we have a local copy → prompt upload ----
    const remotePath = remoteUri.path;
    try {
      await remoteFs.lstat(remotePath);
    } catch {
      // File missing on remote
      if (localUri) {
        const remoteName = remotePath.split('/').pop() || remotePath;
        const choice = await vscode.window.showInformationMessage(
          l10n.t('Remote file not found: {0}. Upload and run?', remoteName),
          { modal: true },
          l10n.t('Upload and Run'),
          l10n.t('Cancel'),
        );
        if (choice !== l10n.t('Upload and Run')) return;
        try {
          await uploadFile(localUri);
          vscode.window.showInformationMessage(
            l10n.t('Uploaded {0} to {1}', remoteName, remotePath),
          );
        } catch (e) {
          vscode.window.showErrorMessage(
            l10n.t('Upload failed: {0}', (e as Error).message),
          );
          return;
        }
      } else {
        vscode.window.showWarningMessage(
          l10n.t('Remote file not found: {0}', remotePath),
        );
        return;
      }
    }

    const py = await service.resolveForFile(client, config, remoteUri);
    if (!py) return;

    // Per-file args lookup → fallback to global args
    const field: PythonConfigField | undefined = config.python;
    const defaultArgs = lookupFileArgs(field, remotePath);

    const input = await vscode.window.showInputBox({
      prompt: l10n.t('Run arguments (space-separated)'),
      value: defaultArgs,
      placeHolder: l10n.t('Leave empty for none'),
      ignoreFocusOut: true,
    });
    if (input === undefined) return;
    const args = input.trim();

    // Persist per-file args into sftp.json
    const ws = findWorkspaceForHost(config.host, config.port);
    if (ws) {
      await updatePythonField(ws, config.host, config.port, (python) => {
        if (!python.fileArgs) python.fileArgs = {};
        python.fileArgs[remotePath] = args;
      });
      // Keep in-memory config consistent so subsequent calls see it immediately
      if (!config.python) config.python = {};
      if (!config.python.fileArgs) config.python.fileArgs = {};
      config.python.fileArgs[remotePath] = args;
    }

    const cmd = buildPythonCommand(py.interpreter.path, py.remoteDir, py.fileName, args);
    const pty = new SshPseudoTerminal((client as any)._client, cmd);
    const terminal = vscode.window.createTerminal({
      name: `▶ ${py.fileName} @ ${config.name || config.host}`,
      pty,
    });
    terminal.show();
  },
});
