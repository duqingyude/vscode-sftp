/**
 * vscode mock (CommonJS) — used by Jest auto-mocking.
 * Jest looks here first because node_modules/vscode doesn't exist.
 *
 * Explicit members below cover what the extension actually uses.
 * A Proxy fallback catches anything we missed and returns safe no-op defaults,
 * so deep import chains (sshClient → logger → output → ...) don't crash.
 */

function EventEmitter() {
  this.listeners = [];
  var self = this;
  this.fire = function(e) { self.listeners.forEach(function(l) { l(e); }); };
  this.dispose = function() {};
  this.event = function(handler) {
    self.listeners.push(handler);
    return function() { self.listeners = self.listeners.filter(function(l) { return l !== handler; }); };
  };
}

var Uri = {
  parse: function(s) {
    var m = s.match(/^([a-z]+):\/\/([^\/]+)(.*)$/i);
    if (m) { return { scheme: m[1], authority: m[2], path: m[3], fsPath: m[3] }; }
    return { scheme: '', authority: '', path: s, fsPath: s };
  },
  file: function(p) { return { scheme: 'file', authority: '', path: p, fsPath: p }; },
};

var workspace = {
  workspaceFolders: undefined,
  textDocuments: [],
  getConfiguration: function() { return { get: function() {}, update: function() {} }; },
  onWillSaveTextDocument: function() { return { dispose: function() {} }; },
  onDidSaveTextDocument: function() { return { dispose: function() {} }; },
  onDidOpenTextDocument: function() { return { dispose: function() {} }; },
  asRelativePath: function(p) { return p; },
  getWorkspaceFolder: function() { return undefined; },
  createFileSystemWatcher: function() {
    return { onDidCreate: function() { return { dispose: function() {} }; },
             onDidChange: function() { return { dispose: function() {} }; },
             onDidDelete: function() { return { dispose: function() {} }; },
             dispose: function() {} };
  },
  updateWorkspaceFolders: function() {},
};

function makeOutputChannel() {
  var lines = [];
  return {
    append: function(s) { lines.push(s); },
    appendLine: function(s) { lines.push(s + '\n'); },
    clear: function() {},
    show: function() {},
    hide: function() {},
    dispose: function() {},
  };
}

function makeStatusBarItem() {
  return {
    command: '', tooltip: '', text: '',
    show: function() {}, hide: function() {}, dispose: function() {},
  };
}

function makeTerminal() {
  return { show: function() {}, hide: function() {}, dispose: function() {}, sendText: function() {} };
}

var window = {
  activeTextEditor: undefined,
  showQuickPick: function() { return Promise.resolve(undefined); },
  showInputBox: function() { return Promise.resolve(undefined); },
  showInformationMessage: function() { return Promise.resolve(undefined); },
  showWarningMessage: function() { return Promise.resolve(undefined); },
  showErrorMessage: function() { return Promise.resolve(undefined); },
  showTextDocument: function() { return Promise.resolve(undefined); },
  showOpenDialog: function() { return Promise.resolve(undefined); },
  createTerminal: function() { return makeTerminal(); },
  createStatusBarItem: function() { return makeStatusBarItem(); },
  createOutputChannel: function() { return makeOutputChannel(); },
};

var debug = {
  startDebugging: function() { return Promise.resolve(undefined); },
  onDidTerminateDebugSession: function() { return { dispose: function() {} }; },
};

var commands = {
  executeCommand: function() { return Promise.resolve(undefined); },
  registerCommand: function() { return { dispose: function() {} }; },
};

var extensions = {
  getExtension: function() { return undefined; },
};

var env = {
  clipboard: { writeText: function() { return Promise.resolve(); } },
};

var StatusBarAlignment = { Left: 0, Right: 1 };
var TreeItemCollapsibleState = { Collapsed: 1, Expanded: 2, None: 0 };
class RelativePattern {
  constructor(base, pattern) { this.base = base; this.pattern = pattern; }
}

/**
 * Wrap in a Proxy so any property we didn't explicitly define returns a safe
 * no-op instead of throwing. Unknown → function that returns undefined.
 */
var base = {
  EventEmitter: EventEmitter,
  Uri: Uri,
  workspace: workspace,
  window: window,
  debug: debug,
  commands: commands,
  extensions: extensions,
  env: env,
  StatusBarAlignment: StatusBarAlignment,
  TreeItemCollapsibleState: TreeItemCollapsibleState,
  RelativePattern: RelativePattern,
};

module.exports = new Proxy(base, {
  get: function(target, prop) {
    if (prop in target) return target[prop];
    if (prop === Symbol.toPrimitive || prop === 'toString' || prop === 'valueOf') {
      return function() { return ''; };
    }
    if (prop === 'then' || prop === 'catch' || prop === 'finally') {
      return undefined; // not a Promise
    }
    // Unknown prop → no-op function
    return function() {};
  },
});
