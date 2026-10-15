import * as vscode from 'vscode';
import * as l10n from '@vscode/l10n';
import * as path from 'path';
import { Uri } from 'vscode';
import RemoteClient from '../../core/remote-client/remoteClient';
import { PythonInterpreterDiscovery, RemotePython } from './pythonInterpreter';
import {
  PythonEntry,
  savePythonToSftpJson,
  readPythonFromSftpJson,
  findWorkspaceForHost,
} from './pythonConfig';
import { getAllFileService, getFileService } from '../serviceManager';

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
    // Also mutate in-memory config so subsequent runs see it immediately
    if (!config.python) config.python = {};
    config.python.interpreter = path;
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
 * Compute remote path for a local file.
 *
 * "同级参考" 规则：本地根 和 远程根 成对出现：
 *   - 首选 config.localPath（sftp.json 显式配置的本地根）
 *   - 其次 FileService.baseDir（workspace folder，默认本地根）
 *   - 兜底 文件所在目录（临时本地根，仅 filename 级映射）
 *
 * 相对路径统一转 POSIX 分隔符后拼到 config.remotePath 上。
 * 若相对路径以 ".." 开头（本地文件不在当前本地根之下），
 * 退化为「仅 basename」模式：远程路径 = remotePath + "/" + basename。
 */
export function localFileToRemotePath(
  localFsPath: string,
  config: any,
  fileService?: any,
): { remotePath: string; localRoot: string; strategy: 'aligned' | 'basename' } {
  const remoteBase = (config.remotePath || '/').replace(/\/+$/, '') || '/';

  // ---- 选本地根 ----
  let localRoot = config.localPath;       // sftp.json 显式配置（推荐）
  if (!localRoot && fileService?.baseDir) localRoot = fileService.baseDir;  // workspace folder
  if (!localRoot) localRoot = path.dirname(localFsPath);  // 兜底：文件所在目录

  // ---- 计算相对路径 ----
  let rel = path.relative(localRoot, localFsPath).replace(/\\/g, '/');

  let strategy: 'aligned' | 'basename' = 'aligned';
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    // 不在本地根之下 → 退化为 basename
    rel = path.basename(localFsPath);
    strategy = 'basename';
  }

  if (!rel) rel = path.basename(localFsPath);
  const sep = remoteBase === '/' ? '/' : remoteBase + '/';
  const remotePath = sep + rel;
  return { remotePath, localRoot, strategy };
}

/**
 * Public: resolve a remote URI → { fileService, config, remoteFs, client, remoteUri, localUri? }
 * Handles multi-connection pick when needed. Also handles local file:// URIs
 * (editor right-click on local files) by mapping them to their remote path.
 */
export async function resolveRemoteContext(
  itemOrUri: any
): Promise<{ fileService: any; config: any; remoteFs: any; client: any; remoteUri: Uri; localUri?: Uri } | undefined> {
  // Case 1: Explorer item with resource.uri
  let uri: Uri | undefined;
  if (itemOrUri?.resource?.uri) uri = itemOrUri.resource.uri;
  else if (itemOrUri instanceof Uri) uri = itemOrUri;

  if (!uri) {
    // No URI at all — let user pick connection, use remotePath as base
    const picked = pickConnection();
    if (!picked) return undefined;
    const remoteFs = await picked.fileService.getRemoteFileSystem(picked.config);
    const remotePath = picked.config.remotePath || '/';
    return {
      fileService: picked.fileService, config: picked.config, remoteFs,
      client: remoteFs.getRemoteClient(),
      remoteUri: Uri.parse(`remote://${picked.config.host}:${picked.config.port}${remotePath}`),
    };
  }

  // ---- Case 2: local file:// URI (editor right-click) ----
  if (uri.scheme === 'file') {
    // 1) 优先找 config.localPath 显式匹配
    // 2) 其次 FileService.baseDir（workspace folder）匹配
    let fs = getAllFileService().find(f => {
      const cfg = f.getConfig();
      if (cfg.protocol !== 'sftp') return false;
      // 优先 config.localPath（sftp.json 显式配置）
      if (cfg.localPath && uri.fsPath.startsWith(cfg.localPath)) return true;
      // 兜底 FileService.baseDir
      return uri.fsPath.startsWith(f.baseDir);
    });

    let pickedConfig: any;
    if (!fs) {
      // 没有 SFTP 配置能直接覆盖此本地文件 —— 让用户选远程节点
      const picked = pickConnection();
      if (!picked) return undefined;
      fs = picked.fileService;
      pickedConfig = picked.config;
    }

    const config = pickedConfig || fs.getConfig();
    const remoteFs = await fs.getRemoteFileSystem(config);
    const { remotePath, localRoot, strategy } = localFileToRemotePath(uri.fsPath, config, fs);

    // 当退化为 basename 模式时，提示用户当前映射关系
    if (strategy === 'basename') {
      vscode.window.showInformationMessage(
        l10n.t(
          'Local file not under any SFTP project root. Mapping "{0}" only by filename to "{1}". Set "localPath" in .vscode/sftp.json for a precise mapping.',
          uri.fsPath, remotePath,
        ),
      );
    } else {
      vscode.window.showInformationMessage(
        l10n.t(
          'Resolved: local "{0}"  ←→  remote "{1}"  (root {2} ↔ {3})',
          uri.fsPath, remotePath, localRoot, config.remotePath || '/',
        ),
      );
    }

    return {
      fileService: fs, config, remoteFs, client: remoteFs.getRemoteClient(),
      remoteUri: Uri.parse(`remote://${config.host}:${config.port}${remotePath}`),
      localUri: uri,
    };
  }

  // ---- Case 3: remote:// URI (explorer item) ----
  const resolved = resolveFromRemoteUri(uri);
  if (!resolved) {
    // Fallback: let user pick
    const picked = pickConnection();
    if (!picked) return undefined;
    const remoteFs = await picked.fileService.getRemoteFileSystem(picked.config);
    return {
      fileService: picked.fileService, config: picked.config, remoteFs,
      client: remoteFs.getRemoteClient(), remoteUri: uri,
    };
  }

  const remoteFs = await resolved.fileService.getRemoteFileSystem(resolved.config);
  return {
    fileService: resolved.fileService, config: resolved.config, remoteFs,
    client: remoteFs.getRemoteClient(), remoteUri: uri,
  };
}

/** Find a FileService that has any baseDir under the same workspace — used when local file
 *  is not directly under any SFTP baseDir. Falls back to pickConnection result. */
function getLocalFsByWorkspace(fileService: any): any {
  // Already a FileService — just return it
  return fileService;
}
