import * as vscode from 'vscode';
import * as l10n from '@vscode/l10n';
import { COMMAND_PYTHON_DEBUG_FILE } from '../constants';
import { getAllFileService } from '../modules/serviceManager';
import RemoteFileSystem from '../core/fs/remoteFileSystem';
import { PythonService } from '../modules/python/pythonService';
import { PythonDebugAdapter } from '../modules/python/pythonDebugAdapter';
import { checkCommand } from './abstract/createCommand';

const service = new PythonService();

function resolveFromExplorerChild(item: any): { fileService: any; config: any; remoteUri: vscode.Uri } | undefined {
  if (!item || !item.resource) return undefined;
  const uri: vscode.Uri = item.resource.uri;
  if (!uri || uri.scheme !== 'remote') return undefined;

  const [host, portStr] = uri.authority.split(':');
  const port = parseInt(portStr || '22', 10);

  const fileService = getAllFileService().find(fs => {
    const cfg = fs.getConfig();
    return cfg.host === host && cfg.port === port;
  });
  if (!fileService) return undefined;

  return { fileService, config: fileService.getConfig(), remoteUri: uri };
}

export default checkCommand({
  id: COMMAND_PYTHON_DEBUG_FILE,

  async handleCommand(exploreItem?: any) {
    const resolved = resolveFromExplorerChild(exploreItem);
    if (!resolved) {
      vscode.window.showWarningMessage(l10n.t('Please select a remote .py file in Remote Explorer first.'));
      return;
    }
    const { fileService, config, remoteUri } = resolved;

    if (config.protocol !== 'sftp') {
      vscode.window.showWarningMessage(l10n.t('Debug Python requires SFTP protocol.'));
      return;
    }

    const remoteFs = (await fileService.getRemoteFileSystem(config)) as RemoteFileSystem;
    const client = remoteFs.getRemoteClient();

    const pyResolved = await service.resolveForFile(client, config, remoteUri);
    if (!pyResolved) return;

    // 1. Check debugpy — NOT auto-install
    const hasDebugpy = await service.checkDebugpy(client, pyResolved.interpreter.path);
    if (!hasDebugpy) {
      const msg = l10n.t(
        'debugpy is not installed. Install it manually: {0}',
        `${pyResolved.interpreter.path} -m pip install debugpy`
      );
      const choice = await vscode.window.showWarningMessage(msg, l10n.t('Copy command'), l10n.t('Cancel'));
      if (choice === l10n.t('Copy command')) {
        await vscode.env.clipboard.writeText(
          `${pyResolved.interpreter.path} -m pip install debugpy`
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
        pyResolved.interpreter.path,
        pyResolved.remoteDir,
        pyResolved.fileName,
        5678
      );
    } catch (e) {
      vscode.window.showErrorMessage(l10n.t('Failed to start debugpy: {0}', (e as Error).message));
      return;
    }

    // 3. Find local cache dir — use fileService local cache mapping
    const localCacheDir = pyResolved.remoteDir;  // simplified; fileService caches via workspace mapping

    // 4. Launch debug
    try {
      const session = await adapter.launchVsCodeDebug(
        pyResolved.interpreter.path,
        pyResolved.remoteDir,
        pyResolved.fileName,
        localPort,
        localCacheDir
      );

      if (session) {
        vscode.debug.onDidTerminateDebugSession(terminated => {
          if (terminated === session) {
            adapter.cleanup(pyResolved.interpreter.path, pyResolved.fileName);
          }
        });
      }
    } catch (e) {
      await adapter.cleanup(pyResolved.interpreter.path, pyResolved.fileName);
      vscode.window.showErrorMessage(l10n.t('Failed to launch debug: {0}', (e as Error).message));
    }
  },
});
