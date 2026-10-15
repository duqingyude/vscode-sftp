import * as vscode from 'vscode';
import * as l10n from '@vscode/l10n';
import { COMMAND_OPEN_CONNECTION_IN_TERMINAL } from '../constants';
import { getAllFileService } from '../modules/serviceManager';
import { ExplorerRoot } from '../modules/remoteExplorer';
import RemoteFileSystem from '../core/fs/remoteFileSystem';
import { SshPseudoTerminal } from '../core/remote-client/sshPseudoTerminal';
import { checkCommand } from './abstract/createCommand';

export default checkCommand({
  id: COMMAND_OPEN_CONNECTION_IN_TERMINAL,

  async handleCommand(exploreItem?: ExplorerRoot) {
    let remoteConfig;
    if (exploreItem && exploreItem.explorerContext) {
      remoteConfig = exploreItem.explorerContext.config;
      if (remoteConfig.protocol !== 'sftp') {
        vscode.window.showWarningMessage(
          l10n.t('SSH shell is only available for SFTP protocol.')
        );
        return;
      }
    } else {
      const remoteItems = getAllFileService().reduce<
        { label: string; description: string; config: any }[]
      >((result, fileService) => {
        const config = fileService.getConfig();
        if (config.protocol === 'sftp') {
          result.push({
            label: config.name || config.remotePath,
            description: config.host,
            config,
          });
        }
        return result;
      }, []);
      if (remoteItems.length <= 0) {
        return;
      }

      const item = await vscode.window.showQuickPick(remoteItems, {
        placeHolder: l10n.t('Select a folder...'),
      });
      if (item === undefined) {
        return;
      }

      remoteConfig = item.config;
    }

    // 复用 fileService 已建立的 SSH 连接
    const fileService = getAllFileService().find(fs => {
      const cfg = fs.getConfig();
      return cfg.host === remoteConfig.host && cfg.port === remoteConfig.port;
    });
    if (!fileService) {
      return;
    }

    const remoteFs = (await fileService.getRemoteFileSystem(remoteConfig)) as RemoteFileSystem;
    const sshClient = remoteFs.getRemoteClient();

    const pty = new SshPseudoTerminal(sshClient);
    const terminal = vscode.window.createTerminal({
      name: `SSH: ${remoteConfig.host}`,
      pty,
    });
    terminal.show();
  },
});
