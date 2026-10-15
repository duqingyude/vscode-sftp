import * as vscode from 'vscode';
import * as l10n from '@vscode/l10n';
import { COMMAND_PYTHON_DEBUG_FILE } from '../constants';
import { getAllFileService } from '../modules/serviceManager';
import RemoteFileSystem from '../core/fs/remoteFileSystem';
import { PythonService } from '../modules/python/pythonService';
import { PythonDebugAdapter } from '../modules/python/pythonDebugAdapter';
import { checkCommand } from './abstract/createCommand';

const service = new PythonService();

function isSftpProtocol(config: any): boolean {
  return config.protocol === 'sftp';
}

async function getClientForConfig(config: any): Promise<any> {
  const fileService = getAllFileService().find(fs => {
    const cfg = fs.getConfig();
    return cfg.host === config.host && cfg.port === config.port;
  });
  if (!fileService) return undefined;
  const remoteFs = (await fileService.getRemoteFileSystem(config)) as RemoteFileSystem;
  return remoteFs.getRemoteClient();
}

export default checkCommand({
  id: COMMAND_PYTHON_DEBUG_FILE,

  async handleCommand(exploreItem?: any) {
    const config = exploreItem?.explorerContext?.config;
    const resourcePath: string = exploreItem?.resourcePath;
    if (!config || !isSftpProtocol(config)) {
      vscode.window.showWarningMessage(l10n.t('Debug Python requires SFTP protocol.'));
      return;
    }
    if (!resourcePath) return;

    const client = await getClientForConfig(config);
    if (!client) {
      vscode.window.showErrorMessage(l10n.t('No active SSH connection.'));
      return;
    }

    const remoteUri = vscode.Uri.parse(`remote://${config.host}:${config.port}${resourcePath}`);
    const resolved = await service.resolveForFile(client, config, remoteUri);
    if (!resolved) return;

    // 1. Check debugpy — NOT auto-install
    const hasDebugpy = await service.checkDebugpy(client, resolved.interpreter.path);
    if (!hasDebugpy) {
      const choice = await vscode.window.showWarningMessage(
        l10n.t(
          'debugpy is not installed on the remote interpreter. Install it with: {0}',
          `${resolved.interpreter.path} -m pip install debugpy`
        ),
        l10n.t('Copy command'),
        l10n.t('Cancel')
      );
      if (choice === l10n.t('Copy command')) {
        await vscode.env.clipboard.writeText(
          `${resolved.interpreter.path} -m pip install debugpy`
        );
        vscode.window.showInformationMessage(l10n.t('Copied to clipboard.'));
      }
      return;
    }

    // 2. Start debugpy + tunnel
    const adapter = new PythonDebugAdapter(client);
    let localPort: number;
    try {
      localPort = await adapter.start(
        resolved.interpreter.path,
        resolved.remoteDir,
        resolved.fileName,
        5678
      );
    } catch (e) {
      vscode.window.showErrorMessage(l10n.t('Failed to start debugpy: {0}', (e as Error).message));
      return;
    }

    // 3. Find local cache path (simplified — use remote path as hint)
    const localCacheDir = resolved.remoteDir;  // SFTP caches near workspace

    // 4. Launch debug
    try {
      const session = await adapter.launchVsCodeDebug(
        resolved.interpreter.path,
        resolved.remoteDir,
        resolved.fileName,
        localPort,
        localCacheDir
      );

      if (session) {
        vscode.debug.onDidTerminateDebugSession(terminated => {
          if (terminated === session) {
            adapter.cleanup(resolved.interpreter.path, resolved.fileName);
          }
        });
      }
    } catch (e) {
      await adapter.cleanup(resolved.interpreter.path, resolved.fileName);
      vscode.window.showErrorMessage(l10n.t('Failed to launch debug: {0}', (e as Error).message));
    }
  },
});
