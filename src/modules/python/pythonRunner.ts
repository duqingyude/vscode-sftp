import { SshPseudoTerminal } from '../../core/remote-client/sshPseudoTerminal';

/**
 * Builds the "cd dir && python file.py args" command string for SSH PTY execution.
 */
export function buildPythonCommand(
  pythonPath: string,
  remoteDir: string,
  fileName: string,
  args: string = ''
): string {
  // Escape spaces/quotes in paths for shell safety
  const safePython = pythonPath.replace(/"/g, '\\"');
  const safeDir = remoteDir.replace(/"/g, '\\"');
  const safeFile = fileName.replace(/"/g, '\\"');
  const safeArgs = args.trim();

  let cmd = `cd "${safeDir}" && "${safePython}" "${safeFile}"`;
  if (safeArgs) {
    cmd += ` ${safeArgs}`;
  }
  return cmd;
}

/**
 * Create a VS Code Terminal that opens an SSH PTY shell (no initial command).
 */
export function createSshShellTerminal(sshClient: any, terminalName: string): any {
  const pty = new SshPseudoTerminal(sshClient);
  return require('vscode').window.createTerminal({ name: terminalName, pty });
}

/**
 * Create a VS Code Terminal that runs a Python file inside an SSH PTY shell.
 */
export function createPythonTerminal(
  sshClient: any,
  pythonPath: string,
  remoteDir: string,
  fileName: string,
  args: string = ''
): any {
  const cmd = buildPythonCommand(pythonPath, remoteDir, fileName, args);
  const pty = new SshPseudoTerminal(sshClient, cmd);
  const terminalName = `Python: ${fileName}`;
  return require('vscode').window.createTerminal({ name: terminalName, pty });
}
