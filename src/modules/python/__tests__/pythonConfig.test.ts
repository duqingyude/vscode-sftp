import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import {
  savePythonToSftpJson,
  readPythonFromSftpJson,
  findWorkspaceForHost,
  PythonEntry,
} from '../pythonConfig';

function makeTempWorkspaces(names: string[], configs: Record<string, any>[]) {
  const roots: string[] = [];
  for (let i = 0; i < names.length; i++) {
    const dir = path.join(os.tmpdir(), `sftp-test-${names[i]}-${Date.now()}-${i}`);
    fs.mkdirpSync(dir);
    fs.mkdirpSync(path.join(dir, '.vscode'));
    fs.writeJsonSync(path.join(dir, '.vscode', 'sftp.json'), configs[i]);
    roots.push(dir);
  }
  return roots;
}

function cleanup(roots: string[]) {
  roots.forEach(r => { try { fs.removeSync(r); } catch (_) {} });
}

describe('pythonConfig', () => {
  // --- C1: 单对象 sftp.json 保存 ---
  test('C1 savePythonToSftpJson single-object sftp.json', async () => {
    const dirs = makeTempWorkspaces(['single'], [{ host: 'h', port: 22 }]);
    try {
      await savePythonToSftpJson(
        { fsPath: dirs[0] } as any,
        'h', 22,
        { path: '/usr/bin/python3', args: '-v' }
      );
      const content = fs.readJsonSync(path.join(dirs[0], '.vscode', 'sftp.json'));
      expect(content.python).toEqual({ interpreter: '/usr/bin/python3', args: '-v' });
    } finally { cleanup(dirs); }
  });

  // --- C2: 数组格式 sftp.json ---
  test('C2 savePythonToSftpJson array-format sftp.json only modifies matching entry', async () => {
    const dirs = makeTempWorkspaces(['arr'], [
      [
        { host: 'a', port: 22 },
        { host: 'h', port: 22 },
        { host: 'b', port: 22 },
      ]
    ]);
    try {
      await savePythonToSftpJson(
        { fsPath: dirs[0] } as any,
        'h', 22,
        { path: '/py' }
      );
      const content = fs.readJsonSync(path.join(dirs[0], '.vscode', 'sftp.json'));
      expect(content).toHaveLength(3);
      expect(content[0].python).toBeUndefined();
      expect(content[1].python).toEqual({ interpreter: '/py' });
      expect(content[2].python).toBeUndefined();
    } finally { cleanup(dirs); }
  });

  // --- C3: 覆盖已有 ---
  test('C3 savePythonToSftpJson overwrites existing python field', async () => {
    const dirs = makeTempWorkspaces(['ov'], [{ host: 'h', port: 22, python: { interpreter: '/old/py' } }]);
    try {
      await savePythonToSftpJson({ fsPath: dirs[0] } as any, 'h', 22, { path: '/new/py' });
      const content = fs.readJsonSync(path.join(dirs[0], '.vscode', 'sftp.json'));
      expect(content.python.interpreter).toBe('/new/py');
    } finally { cleanup(dirs); }
  });

  // --- C4: args undefined 时不写 ---
  test('C4 savePythonToSftpJson skips args when undefined', async () => {
    const dirs = makeTempWorkspaces(['na'], [{ host: 'h', port: 22 }]);
    try {
      await savePythonToSftpJson({ fsPath: dirs[0] } as any, 'h', 22, { path: '/py' });
      const content = fs.readJsonSync(path.join(dirs[0], '.vscode', 'sftp.json'));
      expect(content.python.interpreter).toBe('/py');
      expect(content.python.args).toBeUndefined();
    } finally { cleanup(dirs); }
  });

  // --- C5: read 命中 ---
  test('C5 readPythonFromSftpJson returns entry when host matches', async () => {
    const dirs = makeTempWorkspaces(['r1'], [{
      host: 'h', port: 22,
      python: { interpreter: '/usr/bin/python3', args: '--verbose' },
    }]);
    try {
      const got = await readPythonFromSftpJson({ fsPath: dirs[0] } as any, 'h', 22);
      expect(got).toEqual({ path: '/usr/bin/python3', args: '--verbose' });
    } finally { cleanup(dirs); }
  });

  // --- C6: read 未命中 ---
  test('C6 readPythonFromSftpJson returns undefined when host differs', async () => {
    const dirs = makeTempWorkspaces(['r2'], [{ host: 'h', port: 22 }]);
    try {
      const got = await readPythonFromSftpJson({ fsPath: dirs[0] } as any, 'other', 22);
      expect(got).toBeUndefined();
    } finally { cleanup(dirs); }
  });

  // --- C7: 命中但未设 python ---
  test('C7 readPythonFromSftpJson returns undefined when matching but python absent', async () => {
    const dirs = makeTempWorkspaces(['r3'], [{ host: 'h', port: 22 }]);
    try {
      const got = await readPythonFromSftpJson({ fsPath: dirs[0] } as any, 'h', 22);
      expect(got).toBeUndefined();
    } finally { cleanup(dirs); }
  });

  // --- C8: 文件不存在 ---
  test('C8 savePythonToSftpJson fails when sftp.json missing', async () => {
    const dir = path.join(os.tmpdir(), `sftp-test-missing-${Date.now()}`);
    fs.mkdirpSync(dir);
    try {
      await expect(
        savePythonToSftpJson({ fsPath: dir } as any, 'h', 22, { path: '/py' })
      ).rejects.toThrow();
    } finally { try { fs.removeSync(dir); } catch (_) {} }
  });

  // --- C9: findWorkspaceForHost 单工作区 ---
  test('C9 findWorkspaceForHost returns matching workspace', () => {
    const dirs = makeTempWorkspaces(['w1', 'w2'], [
      { host: 'a', port: 22 },
      { host: 'h', port: 22 },
    ]);
    const vscode = require('vscode');
    const orig = vscode.workspace.workspaceFolders;
    vscode.workspace.workspaceFolders = [
      { uri: { fsPath: dirs[0] } },
      { uri: { fsPath: dirs[1] } },
    ];
    try {
      const got = findWorkspaceForHost('h', 22);
      expect(got).toBeDefined();
      expect(got!.fsPath).toBe(dirs[1]);
    } finally {
      vscode.workspace.workspaceFolders = orig;
      cleanup(dirs);
    }
  });

  // --- C10: findWorkspaceForHost 无匹配 ---
  test('C10 findWorkspaceForHost returns undefined when no workspace matches', () => {
    const dirs = makeTempWorkspaces(['nx'], [{ host: 'a', port: 22 }]);
    const vscode = require('vscode');
    const orig = vscode.workspace.workspaceFolders;
    vscode.workspace.workspaceFolders = [{ uri: { fsPath: dirs[0] } }];
    try {
      const got = findWorkspaceForHost('nonexistent', 22);
      expect(got).toBeUndefined();
    } finally {
      vscode.workspace.workspaceFolders = orig;
      cleanup(dirs);
    }
  });
});
