import * as vscode from 'vscode';
import * as l10n from '@vscode/l10n';
import { COMMAND_PYTHON_RUN_FILE } from '../constants';
import { SshPseudoTerminal } from '../core/remote-client/sshPseudoTerminal';
import { checkCommand } from './abstract/createCommand';
import { PythonService, resolveRemoteContext } from '../modules/python/pythonService';

const service = new PythonService();

export default checkCommand({
  id: COMMAND_PYTHON_RUN_FILE,

  async handleCommand(itemOrUri?: any) {
    const ctx = await resolveRemoteContext(itemOrUri);
    if (!ctx) return;
    const { fileService, config, client, remoteUri } = ctx;

    if (config.protocol !== 'sftp') {
      vscode.window.showWarningMessage(l10n.t('Run Python requires SFTP protocol.'));
      return;
    }

    const py = await service.resolveForFile(client, config, remoteUri);
    if (!py) return;

    // Args — remember per-profile
    let args = py.interpreter.args || '';
    const input = await vscode.window.showInputBox({
      prompt: l10n.t('Run arguments (space-separated)'),
      value: args,
      placeHolder: l10n.t('Leave empty for none'),
      ignoreFocusOut: true,
    });
    if (input === undefined) return;
    args = input.trim();

    if (args !== (py.interpreter.args || '')) {
      py.interpreter.args = args;
      const { savePythonToSftpJson, findWorkspaceForHost } = await import('../modules/python/pythonConfig');
      const ws = findWorkspaceForHost(config.host, config.port);
      if (ws) {
        await savePythonToSftpJson(ws, config.host, config.port, py.interpreter);
      }
    }

    const cmd = `cd "${py.remoteDir}" && "${py.interpreter.path}" "${py.fileName}" ${args}`.trim();
    const pty = new SshPseudoTerminal((client as any)._client, cmd);
    const terminal = vscode.window.createTerminal({
      name: `▶ ${py.fileName} @ ${config.name || config.host}`,
      pty,
    });
    terminal.show();
  },
});
