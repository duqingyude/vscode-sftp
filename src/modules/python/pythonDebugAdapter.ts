import * as vscode from 'vscode';
import * as l10n from '@vscode/l10n';
import RemoteClient from '../../core/remote-client/remoteClient';

const DEFAULT_PORT = 5678;

export class PythonDebugAdapter {
  private debugpyStream: any;  // ssh2 forwardOut stream
  private killed = false;

  constructor(private client: RemoteClient) {}

  /**
   * Check if debugpy is importable on the remote python.
   */
  async checkDebugpy(pythonPath: string): Promise<boolean> {
    const { exitCode } = await this.client.exec(
      `${pythonPath} -c "import debugpy" 2>/dev/null`
    );
    return exitCode === 0;
  }

  /**
   * Start debugpy on the remote host and tunnel localhost.
   * Returns port the local VS Code debug adapter should connect to.
   */
  async start(
    pythonPath: string,
    remoteDir: string,
    fileName: string,
    remotePort: number = DEFAULT_PORT
  ): Promise<number> {
    // 1. Kill any leftover debugpy on that port
    try {
      await this.client.exec(`kill $(pgrep -f "debugpy.*${fileName.replace(/'/g, "\\'")}") 2>/dev/null || true`);
    } catch (e) {}

    // 2. Start debugpy in background on remote host
    const startCmd = `cd "${remoteDir}" && nohup "${pythonPath}" -m debugpy --listen 0.0.0.0:${remotePort} --wait-for-client "${fileName}" >/dev/null 2>&1 &`;
    await this.client.exec(startCmd);

    // 3. Establish SSH port forward (remotePort → localPort on loopback)
    const localPort = remotePort;  // use same port for simplicity
    this.debugpyStream = await this.client.forwardOut(
      '127.0.0.1', localPort,
      '127.0.0.1', remotePort
    );

    return localPort;
  }

  /**
   * Launch VS Code debug session.
   * Returns the started debug session, or undefined on failure.
   */
  async launchVsCodeDebug(
    pythonPath: string,
    remoteDir: string,
    fileName: string,
    localPort: number,
    localCacheDir: string
  ): Promise<vscode.DebugSession | undefined> {
    const launchConfig: vscode.DebugConfiguration = {
      name: `SFTP: Debug ${fileName}`,
      type: 'debugpy',
      request: 'attach',
      connect: { host: 'localhost', port: localPort },
      pathMappings: [
        { localRoot: localCacheDir, remoteRoot: remoteDir },
      ],
      justMyCode: false,
      subProcess: true,
    };

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    return await vscode.debug.startDebugging(workspaceFolder, launchConfig);
  }

  /**
   * Stop debugpy on remote + close tunnel.
   */
  async cleanup(pythonPath: string, fileName: string): Promise<void> {
    if (this.killed) return;
    this.killed = true;

    try {
      await this.client.exec(`kill $(pgrep -f "debugpy.*${fileName.replace(/'/g, "\\'")}") 2>/dev/null || true`);
    } catch (e) {}

    if (this.debugpyStream) {
      try { this.debugpyStream.end(); } catch (e) {}
      this.debugpyStream = null;
    }
  }
}
