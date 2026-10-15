import * as vscode from 'vscode';
import * as l10n from '@vscode/l10n';
import { COMMAND_PYTHON_SELECT_INTERPRETER } from '../constants';
import { checkCommand } from './abstract/createCommand';
import { PythonService, resolveRemoteContext } from '../modules/python/pythonService';
import { findWorkspaceForHost } from '../modules/python/pythonConfig';

const service = new PythonService();

export default checkCommand({
  id: COMMAND_PYTHON_SELECT_INTERPRETER,

  async handleCommand(itemOrUri?: any) {
    const ctx = await resolveRemoteContext(itemOrUri);
    if (!ctx) return;
    const { config, client } = ctx;

    if (config.protocol !== 'sftp') {
      vscode.window.showWarningMessage(l10n.t('Python interpreter selection requires SFTP protocol.'));
      return;
    }

    const wsUri = findWorkspaceForHost(config.host, config.port);
    await service.selectInterpreter(client, config, wsUri);
  },
});
