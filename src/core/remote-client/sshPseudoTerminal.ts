import * as vscode from 'vscode';
import { Client } from 'ssh2';

/**
 * Bridges an ssh2 PTY shell (via .shell()) into a VS Code Terminal.
 *
 * When the user types in the VS Code Terminal, keystrokes flow into the
 * ssh2 channel via handleInput(). When the remote process produces output,
 * channel data flows back into the VS Code Terminal via writeEmitter.fire().
 *
 * Usage:
 *   const pty = new SshPseudoTerminal(sshClient, 'python file.py');
 *   vscode.window.createTerminal({ name: 'Python', pty });
 */
export class SshPseudoTerminal implements vscode.Pseudoterminal {
  private writeEmitter = new vscode.EventEmitter<string>();
  private closeEmitter = new vscode.EventEmitter<void | number>();
  private channel: any;
  private closed = false;

  readonly onDidWrite = this.writeEmitter.event;
  readonly onDidClose = this.closeEmitter.event;

  constructor(
    private client: Client,
    private initialCommand?: string
  ) {}

  open(initialDimensions: vscode.TerminalDimensions | undefined): void {
    const pty = initialDimensions
      ? { cols: initialDimensions.columns, rows: initialDimensions.rows }
      : { cols: 80, rows: 24 };

    this.client.shell(pty, (err, channel) => {
      if (err) {
        this.writeEmitter.fire(`\r\n[SSH Error] ${err.message}\r\n`);
        this.closeEmitter.fire(1);
        return;
      }
      this.channel = channel;

      // Remote output → VS Code Terminal
      channel.on('data', (d: Buffer) => this.writeEmitter.fire(d.toString('utf8')));
      channel.stderr.on('data', (d: Buffer) => this.writeEmitter.fire(d.toString('utf8')));

      // Remote process exited
      channel.on('close', (code: number | null) => {
        if (!this.closed) {
          this.closed = true;
          this.closeEmitter.fire(code ?? 0);
        }
      });

      // Initial command (e.g., "python file.py") — optional
      if (this.initialCommand) {
        channel.write(this.initialCommand + '\n');
      }
    });
  }

  /**
   * User typed something in the VS Code Terminal. VT sequences included.
   */
  handleInput(data: string): void {
    if (this.channel && !this.closed) {
      this.channel.write(data);
    }
  }

  /**
   * VS Code Terminal window resized → notify remote PTY.
   */
  setDimensions(dimensions: vscode.TerminalDimensions): void {
    if (this.channel) {
      try {
        this.channel.setWindow(
          dimensions.columns,
          dimensions.rows,
          480,
          640
        );
      } catch (e) {
        // channel may have closed
      }
    }
  }

  /**
   * Terminal closed by user (clicked ×) or programmatically.
   */
  close(): void {
    this.closed = true;
    if (this.channel) {
      try { this.channel.end(); } catch (e) {}
      this.channel = null;
    }
    this.writeEmitter.dispose();
    this.closeEmitter.dispose();
  }
}
