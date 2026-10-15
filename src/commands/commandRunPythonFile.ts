import * as vscode from 'vscode';
import * as l10n from '@vscode/l10n';
import { COMMAND_PYTHON_RUN_FILE } from '../constants';
import { getAllFileService } from '../modules/serviceManager';
import RemoteFileSystem from '../core/fs/remoteFileSystem';
import { PythonService } from '../modules/python/pythonService';
import { SshPseudoTerminal } from '../core/remote-client/sshPseudoTerminal';
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
  id: COMMAND_PYTHON_RUN_FILE,

  async handleCommand(exploreItem?: any) {
    const config = exploreItem?.explorerContext?.config;
    const resourcePath: string = exploreItem?.resourcePath;
    if (!config || !isSftpProtocol(config)) {
      vscode.window.showWarningMessage(l10n.t('Run Python requires SFTP protocol.'));
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

    // Ask for args (remembered)
    let args = resolved.interpreter.args || '';
    const input = await vscode.window.showInputBox({
      prompt: l10n.t('Run arguments (space-separated)'),
      value: args,
      placeHolder: l10n.t('Leave empty for none'),
      ignoreFocusOut: true,
    });
    if (input === undefined) return;  // user cancelled
    args = input.trim();

    if (args !== (resolved.interpreter.args || '')) {
      resolved.interpreter.args = args;
      const { setInterpreter, buildProfileKey } = await import('../modules/python/pythonConfig');
      setInterpreter(resolved.profileKey, resolved.interpreter);
    }

    // Build command + open PTY terminal
    const { buildPythonCommand } = await import('../modules/python/pythonRunner');
    const cmd = buildPythonCommand(resolved.interpreter.path, resolved.remoteDir, resolved.fileName, args);
    const pty = new SshPseudoTerminal((client as any)._client, cmd);
    const terminal = vscode.window.createTerminal({
      name: `Python: ${resolved.fileName} @ ${config.host}`,
      pty,
    });
    terminal.show();
  },
});
