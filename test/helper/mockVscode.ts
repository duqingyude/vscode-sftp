/**
 * Minimal vscode module mock for Jest tests.
 * Exports members as named exports so `import * as vscode from 'vscode'`
 * produces the same shape as real vscode.
 */

export interface Uri {
  scheme: string;
  authority: string;
  path: string;
  fsPath: string;
}

export class EventEmitter<T> {
  listeners: Array<(e: T) => void> = [];
  fire = jest.fn((e: T) => {
    this.listeners.forEach(l => l(e));
  });
  dispose = jest.fn();
  event = (handler: (e: T) => void) => {
    this.listeners.push(handler);
    return () => { this.listeners = this.listeners.filter(l => l !== handler); };
  };
}

export const Uri = {
  parse: (s: string): Uri => {
    const m = s.match(/^([a-z]+):\/\/([^\/]+)(.*)$/i);
    if (m) {
      return { scheme: m[1], authority: m[2], path: m[3], fsPath: m[3] };
    }
    return { scheme: '', authority: '', path: s, fsPath: s };
  },
};

export const workspace: any = {
  workspaceFolders: undefined,
};

export const window: any = {
  showQuickPick: jest.fn(),
  showInputBox: jest.fn(),
  showInformationMessage: jest.fn(),
  showWarningMessage: jest.fn(),
  showErrorMessage: jest.fn(),
  createTerminal: jest.fn().mockReturnValue({
    show: jest.fn(),
  }),
  createStatusBarItem: jest.fn().mockReturnValue({
    command: '', tooltip: '', text: '',
    show: jest.fn(), hide: jest.fn(), dispose: jest.fn(),
  }),
};

export const StatusBarAlignment = { Left: 0, Right: 1 };

export const debug: any = {
  startDebugging: jest.fn(),
  onDidTerminateDebugSession: jest.fn(),
};

export const env: any = {
  clipboard: {
    writeText: jest.fn(),
  },
};

// Pseudoterminal interface (used as type only at runtime)
export interface Pseudoterminal {
  onDidWrite: EventEmitter<string>['event'];
  onDidClose: EventEmitter<void | number>['event'];
  open(initialDimensions: any): void;
  close(): void;
  handleInput?(data: string): void;
  setDimensions?(dimensions: any): void;
}
