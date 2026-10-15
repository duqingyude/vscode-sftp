import * as vscode from 'vscode';
import * as l10n from '@vscode/l10n';
import { Uri } from 'vscode';
import RemoteClient from '../../core/remote-client/remoteClient';
import { PythonInterpreterDiscovery, RemotePython } from './pythonInterpreter';
import {
  PythonEntry,
  savePythonToSftpJson,
  readPythonFromSftpJson,
  findWorkspaceForHost,
} from './pythonConfig';
import { getAllFileService } from '../serviceManager';

export interface PythonConfigForFile {
  remoteClient: RemoteClient;
  interpreter: PythonEntry;
  remoteDir: string;
  fileName: string;
  config: any;     // original SFTP config (with .python field)
}

const discovery = new PythonInterpreterDiscovery();

/**
 * When multiple SFTP profiles are open, let the user pick which node
 * to run against. Returns { fileService, config } or undefined.
 */
function pickConnection(): { fileService: any; config: any } | undefined {
  const services = getAllFileService().filter(fs => {
    const cfg = fs.getConfig();
    return cfg.protocol === 'sftp';
  });
  if (services.length === 0) {
    vscode.window.showWarningMessage(l10n.t('No active SFTP connections.'));
    return undefined;
  }
  if (services.length === 1) {
    return { fileService: services[0], config: services[0].getConfig() };
  }

  const items = services.map(fs => {
    const cfg = fs.getConfig();
    return {
      label: cfg.name || cfg.host,
      description: `${cfg.host}:${cfg.port}${cfg.username ? ' as ' + cfg.username : ''}`,
      config: cfg,
      fileService: fs,
    };
  });

  const pick = vscode.window.showQuickPick(items, {
    placeHolder: l10n.t('Select remote node'),
  });
  if (!pick) return undefined;
  return { fileService: (pick as any).fileService, config: (pick as any).config };
}

/**
 * From a remote:// URI, find the matching fileService + config.
 * If no unique match (multiple), prompt user to pick.
 */
function resolveFromRemoteUri(uri: Uri): { fileService: any; config: any } | undefined {
  if (!uri || uri.scheme !== 'remote') return undefined;
  const [host, portStr] = uri.authority.split(':');
  const port = parseInt(portStr || '22', 10);

  const matched = getAllFileService().filter(fs => {
    const cfg = fs.getConfig();
    return cfg.host === host && cfg.port === port;
  });
  if (matched.length === 0) return undefined;
  if (matched.length === 1) return { fileService: matched[0], config: matched[0].getConfig() };

  // Multiple — user must pick
  return pickConnection();
}

export class PythonService {
  /**
   * Show QuickPick with discovered interpreters + manual option.
   * Saves choice to sftp.json.
   */
  async selectInterpreter(
    client: RemoteClient,
    config: any,
    workspaceUri?: Uri
  ): Promise<PythonEntry | undefined> {
    vscode.window.showInformationMessage(l10n.t('Discovering Python interpreters on remote...'));

    let discovered: RemotePython[] = [];
    try {
      discovered = await discovery.discover(client);
    } catch (e) {
      vscode.window.showErrorMessage(l10n.t('Failed to discover Python: {0}', (e as Error).message));
    }

    const items: vscode.QuickPickItem[] = discovered.map(p => ({
      label: p.path,
      description: `${p.version}${p.isVirtualEnv ? ' (venv)' : ''}${p.hasDebugpy ? ' • debugpy' : ''}`,
      detail: l10n.t('Python {0}', p.version),
    }));
    items.push({
      label: l10n.t('Enter path manually...'),
      description: l10n.t('Type a remote Python path such as /usr/bin/python3'),
    });

    const choice = await vscode.window.showQuickPick(items, {
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
    if (workspaceUri) {
      await savePythonToSftpJson(workspaceUri, config.host, config.port, entry);
      vscode.window.showInformationMessage(l10n.t('Saved interpreter to .vscode/sftp.json'));
    }
    return entry;
  }

  /**
   * Resolve interpreter for a file:
   *   1. Read from sftp.json (via config.python)
   *   2. If missing → prompt to select (and persist)
   */
  async resolveForFile(
    client: RemoteClient,
    config: any,
    remoteUri: Uri
  ): Promise<PythonConfigForFile | undefined> {
    let entry: PythonEntry | undefined;

    // Try sftp.json (embedded in config, or re-read from file)
    if (config.python?.interpreter) {
      entry = { path: config.python.interpreter, args: config.python.args };
    }

    if (!entry) {
      // Prompt + persist
      const wsUri = findWorkspaceForHost(config.host, config.port);
      entry = await this.selectInterpreter(client, config, wsUri);
      if (!entry) return undefined;
    }

    const fullPath = remoteUri.path;
    const lastSlash = fullPath.lastIndexOf('/');
    const remoteDir = lastSlash >= 0 ? fullPath.slice(0, lastSlash) : fullPath;
    const fileName = lastSlash >= 0 ? fullPath.slice(lastSlash + 1) : fullPath;

    return { remoteClient: client, interpreter: entry, remoteDir, fileName, config };
  }

  async checkDebugpy(client: RemoteClient, pythonPath: string): Promise<boolean> {
    return discovery.checkDebugpy(client, pythonPath);
  }
}

/**
 * Public: resolve a remote URI → { fileService, config, remoteFs, client }
 * Handles multi-connection pick when needed.
 */
export async function resolveRemoteContext(
  itemOrUri: any
): Promise<{ fileService: any; config: any; remoteFs: any; client: any; remoteUri: Uri } | undefined> {
  // Case 1: Explorer item with resource.uri
  let uri: Uri | undefined;
  if (itemOrUri?.resource?.uri) uri = itemOrUri.resource.uri;
  else if (itemOrUri instanceof Uri) uri = itemOrUri;

  if (!uri) {
    // No URI — let user pick connection
    const picked = pickConnection();
    if (!picked) return undefined;
    const remoteFs = await picked.fileService.getRemoteFileSystem(picked.config);
    return { fileService: picked.fileService, config: picked.config, remoteFs, client: remoteFs.getRemoteClient(), remoteUri: Uri.parse(`remote://${picked.config.host}:${picked.config.port}${picked.config.remotePath || ''}`) };
  }

  const resolved = resolveFromRemoteUri(uri);
  if (!resolved) {
    // Fallback: let user pick
    const picked = pickConnection();
    if (!picked) return undefined;
    const remoteFs = await picked.fileService.getRemoteFileSystem(picked.config);
    return { fileService: picked.fileService, config: picked.config, remoteFs, client: remoteFs.getRemoteClient(), remoteUri: uri };
  }

  const remoteFs = await resolved.fileService.getRemoteFileSystem(resolved.config);
  return {
    fileService: resolved.fileService,
    config: resolved.config,
    remoteFs,
    client: remoteFs.getRemoteClient(),
    remoteUri: uri,
  };
}
