import * as vscode from 'vscode';
import * as l10n from '@vscode/l10n';
import { COMMAND_PYTHON_DEBUG_FILE } from '../constants';
import { PythonDebugAdapter } from '../modules/python/pythonDebugAdapter';
import { checkCommand } from './abstract/createCommand';
import { uploadFile } from '../fileHandlers';
import { PythonService, resolveRemoteContext } from '../modules/python/pythonService';

const service = new PythonService();

export default checkCommand({
  id: COMMAND_PYTHON_DEBUG_FILE,

  async handleCommand(itemOrUri?: any) {
    const ctx = await resolveRemoteContext(itemOrUri);
    if (!ctx) return;
    const { config, client, remoteUri, remoteFs, localUri } = ctx;

    if (config.protocol !== 'sftp') {
      vscode.window.showWarningMessage(l10n.t('Debug Python requires SFTP protocol.'));
      return;
    }

    // ---- Check remote file exists; upload if missing ----
    const remotePath = remoteUri.path;
    try {
      await remoteFs.lstat(remotePath);
    } catch {
      if (localUri) {
        const remoteName = remotePath.split('/').pop() || remotePath;
        const choice = await vscode.window.showInformationMessage(
          l10n.t('Remote file not found: {0}. Upload and debug?', remoteName),
          { modal: true },
          l10n.t('Upload and Debug'),
          l10n.t('Cancel'),
        );
        if (choice !== l10n.t('Upload and Debug')) return;
        try {
          await uploadFile(localUri);
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

    // debugpy 检查 — 不自动安装
    const hasDebugpy = await service.checkDebugpy(client, py.interpreter.path);
    if (!hasDebugpy) {
      const msg = l10n.t(
        'debugpy is not installed on the remote interpreter. Install it manually: {0}',
        `${py.interpreter.path} -m pip install debugpy`
      );
      const choice = await vscode.window.showWarningMessage(msg, l10n.t('Copy command'), l10n.t('Cancel'));
      if (choice === l10n.t('Copy command')) {
        await vscode.env.clipboard.writeText(`${py.interpreter.path} -m pip install debugpy`);
        vscode.window.showInformationMessage(l10n.t('Copied to clipboard.'));
      }
      return;
    }

    const adapter = new PythonDebugAdapter(client);
    let localPort: number;
    try {
      localPort = await adapter.start(py.interpreter.path, py.remoteDir, py.fileName, 5678);
    } catch (e) {
      vscode.window.showErrorMessage(l10n.t('Failed to start debugpy: {0}', (e as Error).message));
      return;
    }

    const localCacheDir = py.remoteDir;  // 简化；完整实现需查 fileService workspace 映射

    try {
      const session = await adapter.launchVsCodeDebug(
        py.interpreter.path, py.remoteDir, py.fileName, localPort, localCacheDir
      );
      if (session) {
        vscode.debug.onDidTerminateDebugSession(terminated => {
          if (terminated === session) adapter.cleanup(py.interpreter.path, py.fileName);
        });
      }
    } catch (e) {
      await adapter.cleanup(py.interpreter.path, py.fileName);
      vscode.window.showErrorMessage(l10n.t('Failed to launch debug: {0}', (e as Error).message));
    }
  },
});
