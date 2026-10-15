import * as vscode from 'vscode';
import * as l10n from '@vscode/l10n';
import { COMMAND_PYTHON_RUN_FILE } from '../constants';
import { getAllFileService } from '../modules/serviceManager';
import RemoteFileSystem from '../core/fs/remoteFileSystem';
import { PythonService } from '../modules/python/pythonService';
import { SshPseudoTerminal } from '../core/remote-client/sshPseudoTerminal';
import { checkCommand } from './abstract/createCommand';

const service = new PythonService();

/**
 * From an ExplorerChild item (which has .resource.uri),
 * find the matching fileService + config.
 */
function resolveFromExplorerChild(item: any): { fileService: any; config: any; remoteUri: vscode.Uri; fileName: string } | undefined {
  if (!item || !item.resource) return undefined;
  const uri: vscode.Uri = item.resource.uri;  // e.g. remote://192.168.50.243:22/usr/local/fine1fs/main.py
  if (!uri || uri.scheme !== 'remote') return undefined;

  const authority = uri.authority;   // "192.168.50.243:22"
  const [host, portStr] = authority.split(':');
  const port = parseInt(portStr || '22', 10);

  const fileService = getAllFileService().find(fs => {
    const cfg = fs.getConfig();
    return cfg.host === host && cfg.port === port;
  });
  if (!fileService) return undefined;

  const config = fileService.getConfig();
  const fileName = uri.path.split('/').pop() || uri.path;
  return { fileService, config, remoteUri: uri, fileName };
}

export default checkCommand({
  id: COMMAND_PYTHON_RUN_FILE,

  async handleCommand(exploreItem?: any) {
    const resolved = resolveFromExplorerChild(exploreItem);
    if (!resolved) {
      vscode.window.showWarningMessage(l10n.t('Please select a remote .py file in Remote Explorer first.'));
      return;
    }
    const { fileService, config, remoteUri } = resolved;

    if (config.protocol !== 'sftp') {
      vscode.window.showWarningMessage(l10n.t('Run Python requires SFTP protocol.'));
      return;
    }

    const remoteFs = (await fileService.getRemoteFileSystem(config)) as RemoteFileSystem;
    const client = remoteFs.getRemoteClient();

    const pyResolved = await service.resolveForFile(client, config, remoteUri);
    if (!pyResolved) return;

    // Ask for args (remembered)
    let args = pyResolved.interpreter.args || '';
    const input = await vscode.window.showInputBox({
      prompt: l10n.t('Run arguments (space-separated)'),
      value: args,
      placeHolder: l10n.t('Leave empty for none'),
      ignoreFocusOut: true,
    });
    if (input === undefined) return;  // user cancelled
    args = input.trim();

    if (args !== (pyResolved.interpreter.args || '')) {
      pyResolved.interpreter.args = args;
      const { setInterpreter } = await import('../modules/python/pythonConfig');
      setInterpreter(pyResolved.profileKey, pyResolved.interpreter);
    }

    const { buildPythonCommand } = await import('../modules/python/pythonRunner');
    const cmd = buildPythonCommand(pyResolved.interpreter.path, pyResolved.remoteDir, pyResolved.fileName, args);
    const pty = new SshPseudoTerminal((client as any)._client, cmd);
    const terminal = vscode.window.createTerminal({
      name: `Python: ${pyResolved.fileName} @ ${config.host}`,
      pty,
    });
    terminal.show();
  },
});
