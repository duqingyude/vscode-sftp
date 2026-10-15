import * as vscode from 'vscode';
import * as l10n from '@vscode/l10n';
import RemoteClient from '../../core/remote-client/remoteClient';
import { PythonInterpreterDiscovery, RemotePython } from './pythonInterpreter';
import { getInterpreter, setInterpreter, buildProfileKey, PythonEntry } from './pythonConfig';

export interface PythonConfigForFile {
  remoteClient: RemoteClient;
  interpreter: PythonEntry;      // 持久化选择
  remoteDir: string;             // 远程目录
  fileName: string;              // 文件名
  profileKey: string;
}

const discovery = new PythonInterpreterDiscovery();

/**
 * Unified entry point for Python features.
 * Resolves interpreter selection, discover fallback, protocol check.
 */
export class PythonService {
  /**
   * Show QuickPick with discovered interpreters + manual input option.
   * Saves the choice. Returns the chosen RemotePython path or undefined.
   */
  async selectInterpreter(client: RemoteClient, config: { host: string; port: number; username?: string; remotePath: string }): Promise<PythonEntry | undefined> {
    const key = buildProfileKey(config);

    vscode.window.showInformationMessage(l10n.t('Discovering Python interpreters on remote...'));

    let discovered: RemotePython[] = [];
    try {
      discovered = await discovery.discover(client);
    } catch (e) {
      vscode.window.showErrorMessage(l10n.t('Failed to discover Python: {0}', (e as Error).message));
    }

    const quickPickItems: vscode.QuickPickItem[] = discovered.map(p => ({
      label: `${p.path}`,
      description: `${p.version}${p.isVirtualEnv ? ' (venv)' : ''}${p.hasDebugpy ? ' • debugpy' : ''}`,
      detail: l10n.t('Python {0}', p.version),
      picked: key && discovered.findIndex(d => d.path === getInterpreter(key)?.path) !== -1,
    }));

    // Manual entry option
    quickPickItems.push({
      label: l10n.t('Enter path manually...'),
      description: l10n.t('Type a remote Python path such as /usr/bin/python3'),
    });

    const choice = await vscode.window.showQuickPick(quickPickItems, {
      placeHolder: l10n.t('Select remote Python interpreter'),
    });
    if (!choice) return undefined;

    let path: string;
    if (choice.label === l10n.t('Enter path manually...')) {
      const manual = await vscode.window.showInputBox({
        prompt: l10n.t('Enter remote Python path'),
        value: '/usr/bin/python3',
      });
      if (!manual) return undefined;
      path = manual;
    } else {
      path = choice.label;
    }

    const entry: PythonEntry = { path };
    setInterpreter(key, entry);
    return entry;
  }

  /**
   * Builds command-line args from file URI + saved config.
   * Handles "first run" — prompts to choose interpreter.
   */
  async resolveForFile(
    client: RemoteClient,
    config: { host: string; port: number; username?: string; remotePath: string },
    remoteUri: vscode.Uri
  ): Promise<PythonConfigForFile | undefined> {
    const key = buildProfileKey(config);
    let entry = getInterpreter(key);

    if (!entry) {
      entry = await this.selectInterpreter(client, config);
      if (!entry) return undefined;
    }

    // remoteUri.path: "/home/user/project/main.py" → dir + filename
    const fullPath = remoteUri.path;
    const lastSlash = fullPath.lastIndexOf('/');
    const remoteDir = lastSlash >= 0 ? fullPath.slice(0, lastSlash) : fullPath;
    const fileName = lastSlash >= 0 ? fullPath.slice(lastSlash + 1) : fullPath;

    return { remoteClient: client, interpreter: entry, remoteDir, fileName, profileKey: key };
  }

  async checkDebugpy(client: RemoteClient, pythonPath: string): Promise<boolean> {
    return discovery.checkDebugpy(client, pythonPath);
  }
}
