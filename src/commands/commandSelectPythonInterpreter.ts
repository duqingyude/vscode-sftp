import * as vscode from 'vscode';
import * as l10n from '@vscode/l10n';
import { COMMAND_PYTHON_SELECT_INTERPRETER } from '../constants';
import { getAllFileService } from '../modules/serviceManager';
import RemoteFileSystem from '../core/fs/remoteFileSystem';
import { PythonService } from '../modules/python/pythonService';
import { checkCommand } from './abstract/createCommand';

const service = new PythonService();

function isSftpProtocol(config: any): boolean {
  return config.protocol === 'sftp';
}

function getClientForConfig(config: any): any {
  const fileService = getAllFileService().find(fs => {
    const cfg = fs.getConfig();
    return cfg.host === config.host && cfg.port === config.port;
  });
  if (!fileService) return undefined;
  return fileService.getRemoteFileSystem(config).then((remoteFs: RemoteFileSystem) => remoteFs.getRemoteClient());
}

export default checkCommand({
  id: COMMAND_PYTHON_SELECT_INTERPRETER,

  async handleCommand(exploreItem?: any) {
    const config = exploreItem?.explorerContext?.config;
    if (!config || !isSftpProtocol(config)) {
      vscode.window.showWarningMessage(l10n.t('Python interpreter selection requires SFTP protocol.'));
      return;
    }

    const client = await getClientForConfig(config);
    if (!client) {
      vscode.window.showErrorMessage(l10n.t('No active SSH connection.'));
      return;
    }

    await service.selectInterpreter(client, config);
  },
});
