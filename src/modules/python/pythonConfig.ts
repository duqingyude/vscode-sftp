import * as fs from 'fs-extra';
import * as path from 'path';
import { Uri } from 'vscode';
import { CONFIG_PATH } from '../../constants';

export interface PythonEntry {
  path: string;
  args?: string;
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
 * Find and update the python field in sftp.json for the given host:port.
 * Persists to disk.
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
 * Read python field from sftp.json for the given host:port.
 */
export async function readPythonFromSftpJson(
  workspaceUri: Uri,
  host: string,
  port: number
): Promise<PythonEntry | undefined> {
  const configs = await loadConfigs(resolveSftpJsonPath(workspaceUri));
  for (const cfg of configs) {
    if (configMatchesHost(cfg, host, port) && cfg.python?.interpreter) {
      return { path: cfg.python.interpreter, args: cfg.python.args };
    }
  }
  return undefined;
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
