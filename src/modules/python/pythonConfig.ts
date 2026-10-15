import * as fs from 'fs-extra';
import * as path from 'path';
import { Uri } from 'vscode';
import { CONFIG_PATH } from '../../constants';

export interface PythonEntry {
  path: string;
  args?: string;
}

/** python.fileArgs: { "/remote/path/main.py": "-v", ... } */
export interface PythonConfigField {
  interpreter?: string;
  args?: string;
  fileArgs?: Record<string, string>;
}

/**
 * Resolve the sftp.json config path for a given workspace folder URI.
 */
function resolveSftpJsonPath(workspaceUri: Uri): string {
  return path.join(workspaceUri.fsPath, CONFIG_PATH);
}

/**
 * Load all configs from the workspace's sftp.json.
 * Supports both single-object and array formats.
 */
async function loadConfigs(sftpJsonPath: string): Promise<any[]> {
  if (!(await fs.pathExists(sftpJsonPath))) {
    return [];
  }
  const raw = await fs.readJson(sftpJsonPath);
  return Array.isArray(raw) ? raw : [raw];
}

async function writeConfigs(sftpJsonPath: string, configs: any[]): Promise<void> {
  const original = await fs.readJson(sftpJsonPath);
  const out = Array.isArray(original) ? configs : configs[0];
  await fs.writeJson(sftpJsonPath, out, { spaces: 4 });
}

function configMatchesHost(cfg: any, host: string, port: number): boolean {
  return cfg.host === host && Number(cfg.port || 22) === port;
}

/**
 * Persist python interpreter + global args into sftp.json for host:port.
 * This replaces the whole python object — use updatePythonField() for partial updates.
 */
export async function savePythonToSftpJson(
  workspaceUri: Uri,
  host: string,
  port: number,
  entry: PythonEntry
): Promise<void> {
  const sftpJsonPath = resolveSftpJsonPath(workspaceUri);
  const configs = await loadConfigs(sftpJsonPath);
  for (const cfg of configs) {
    if (configMatchesHost(cfg, host, port)) {
      if (!cfg.python) cfg.python = {};
      cfg.python.interpreter = entry.path;
      if (entry.args !== undefined) cfg.python.args = entry.args;
    }
  }
  await writeConfigs(sftpJsonPath, configs);
}

/**
 * Update (or insert) a single key inside cfg.python.
 * Pass-through for non-matching configs. Saves disk.
 */
export async function updatePythonField(
  workspaceUri: Uri,
  host: string,
  port: number,
  updater: (python: PythonConfigField) => void
): Promise<void> {
  const sftpJsonPath = resolveSftpJsonPath(workspaceUri);
  const configs = await loadConfigs(sftpJsonPath);
  let matched = false;
  for (const cfg of configs) {
    if (configMatchesHost(cfg, host, port)) {
      if (!cfg.python) cfg.python = {};
      updater(cfg.python);
      matched = true;
    }
  }
  if (matched) {
    await writeConfigs(sftpJsonPath, configs);
  }
}

/**
 * Read python field from sftp.json for the given host:port.
 * Returns { path, args, fileArgs } — shape compatible with PythonEntry
 * plus the optional per-file args map.
 */
export async function readPythonFromSftpJson(
  workspaceUri: Uri,
  host: string,
  port: number
): Promise<any | undefined> {
  const configs = await loadConfigs(resolveSftpJsonPath(workspaceUri));
  for (const cfg of configs) {
    if (configMatchesHost(cfg, host, port) && cfg.python?.interpreter) {
      const field = cfg.python;
      const out: any = { path: field.interpreter };
      if (field.args !== undefined) out.args = field.args;
      if (field.fileArgs !== undefined) out.fileArgs = field.fileArgs;
      return out;
    }
  }
  return undefined;
}

/**
 * Look up args for a specific remote file path from cfg.python.fileArgs.
 * Falls back to cfg.python.args (global).
 */
export function lookupFileArgs(pythonField: PythonConfigField | undefined, remoteFilePath: string): string {
  if (!pythonField) return '';
  if (pythonField.fileArgs && pythonField.fileArgs[remoteFilePath] !== undefined) {
    return pythonField.fileArgs[remoteFilePath];
  }
  return pythonField.args || '';
}

/**
 * Find the workspace folder that contains the given remote URI's
 * cached file (or any workspace with sftp.json that matches host:port).
 */
export function findWorkspaceForHost(host: string, port: number): Uri | undefined {
  const vscode = require('vscode');
  for (const folder of vscode.workspace.workspaceFolders || []) {
    const sftpPath = path.join(folder.uri.fsPath, CONFIG_PATH);
    if (fs.existsSync(sftpPath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(sftpPath, 'utf8'));
        const configs = Array.isArray(raw) ? raw : [raw];
        if (configs.some((c: any) => configMatchesHost(c, host, port))) {
          return folder.uri;
        }
      } catch (e) {
        // skip unreadable
      }
    }
  }
  return undefined;
}
