import * as vscode from 'vscode';
import * as l10n from '@vscode/l10n';
import { COMMAND_CONFIG } from '../constants';
import { newConfig } from '../modules/config';
import {
  getWorkspaceFolders,
  showConfirmMessage,
  showOpenDialog,
  openFolder,
  addWorkspaceFolder,
} from '../host';
import { checkCommand } from './abstract/createCommand';

export default checkCommand({
  id: COMMAND_CONFIG,

  async handleCommand() {
    const workspaceFolders = getWorkspaceFolders();
    if (!workspaceFolders) {
      const result = await showConfirmMessage(
        l10n.t('SFTP expects to work at a folder.'),
        l10n.t('Open Folder'),
        'Ok'
      );

      if (!result) {
        return;
      }

      return openFolder();
    }

    if (workspaceFolders.length <= 0) {
      const result = await showConfirmMessage(
        l10n.t('There are no available folders in current workspace.'),
        l10n.t('Add Folder to Workspace'),
        'Ok'
      );

      if (!result) {
        return;
      }

      const resources = await showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: true,
      });

      if (!resources) {
        return;
      }

      addWorkspaceFolder(...resources.map(uri => ({ uri })));
      return;
    }

    if (workspaceFolders.length === 1) {
      newConfig(workspaceFolders[0].uri.fsPath);
      return;
    }

    const initDirs = workspaceFolders.map(folder => ({
      value: folder.uri.fsPath,
      label: folder.name,
      description: folder.uri.fsPath,
    }));

    vscode.window
      .showQuickPick(initDirs, {
        placeHolder: l10n.t('Select a folder...'),
      })
      .then(item => {
        if (item === undefined) {
          return;
        }

        newConfig(item.value);
      });
  },
});
