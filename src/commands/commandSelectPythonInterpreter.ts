import * as vscode from 'vscode';
import * as l10n from '@vscode/l10n';
import { COMMAND_PYTHON_SELECT_INTERPRETER } from '../constants';
import { getAllFileService } from '../modules/serviceManager';
import RemoteFileSystem from '../core/fs/remoteFileSystem';
import { PythonService } from '../modules/python/pythonService';
import { checkCommand } from './abstract/createCommand';

const service = new PythonService();

function resolveConfigFromItem(item: any): { fileService: any; config: any } | undefined {
  // Case 1: ExplorerRoot — has explorerContext
  if (item?.explorerContext?.config) {
    return { fileService: item.explorerContext.fileService, config: item.explorerContext.config };
  }
  // Case 2: ExplorerChild — has resource.uri
  if (item?.resource?.uri) {
    const uri: vscode.Uri = item.resource.uri;
    const [host, portStr] = uri.authority.split(':');
    const port = parseInt(portStr || '22', 10);
    const fileService = getAllFileService().find(fs => {
      const cfg = fs.getConfig();
      return cfg.host === host && cfg.port === port;
    });
    if (fileService) return { fileService, config: fileService.getConfig() };
  }
  return undefined;
}

export default checkCommand({
  id: COMMAND_PYTHON_SELECT_INTERPRETER,

  async handleCommand(exploreItem?: any) {
    let resolved = resolveConfigFromItem(exploreItem);

    // Fallback: pick from QuickPick
    if (!resolved) {
      const remoteItems = getAllFileService().reduce<
        { label: string; description: string; config: any; fileService: any }[]
      >((result, fileService) => {
        const config = fileService.getConfig();
        if (config.protocol === 'sftp') {
          result.push({
            label: config.name || config.remotePath,
            description: `${config.host}:${config.port}`,
            config,
            fileService,
          });
        }
        return result;
      }, []);

      if (remoteItems.length === 0) {
        vscode.window.showWarningMessage(l10n.t('No active SFTP connections.'));
        return;
      }
      if (remoteItems.length === 1) {
        resolved = remoteItems[0];
      } else {
        const pick = await vscode.window.showQuickPick(remoteItems, {
          placeHolder: l10n.t('Select a remote connection'),
        });
        if (!pick) return;
        resolved = pick;
      }
    }

    const { fileService, config } = resolved;
    if (config.protocol !== 'sftp') {
      vscode.window.showWarningMessage(l10n.t('Python interpreter selection requires SFTP protocol.'));
      return;
    }

    const remoteFs = (await fileService.getRemoteFileSystem(config)) as RemoteFileSystem;
    const client = remoteFs.getRemoteClient();

    await service.selectInterpreter(client, config);
  },
});
