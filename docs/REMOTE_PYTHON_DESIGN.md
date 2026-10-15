# SFTP Extension — 远程 Python 运行与调试 设计文档

> **版本**: v4.0  
> **日期**: 2026-10-15  
> **状态**: Draft  
> **目标版本**: v1.18.0  
> **核心变更**:  
> 1. 原有 "Open SSH in Terminal" 从 `ssh.exe` 改为 ssh2 PTY + Pseudoterminal  
> 2. **去除后台运行模式**，只保留交互式运行（SshPseudoTerminal）+ 调试（debugpy + forwardOut）

---

## 1. 设计目标

### 1.1 两个核心功能 + 一个现有功能改造

| # | 功能 | 说明 | 实现方式 |
|---|---|---|---|
| ✅ 新增 | **远程 Python 解释器选择** | 自动发现 + 持久化 | ssh2.exec（非交互） |
| ✅ 新增 | **交互运行 Python** | 支持 `input()`、REPL、Ctrl+C | ssh2.shell PTY + **VS Code Pseudoterminal** |
| ✅ 新增 | **调试 Python** | debugpy attach，完整 VS Code UI | ssh2.exec 启动 + **ssh2.forwardOut** 端口转发 |
| 🔄 改造 | **Open SSH in Terminal**（现有） | 完全去除本地 `ssh.exe` | ssh2.shell PTY + **VS Code Pseudoterminal** |

### 1.2 明确去除的内容

| 去除项 | 原因 |
|---|---|
| **后台运行 Python**（Run Python File Background） | ssh2.exec + OutputChannel 无法处理交互场景，但实际 Python 脚本大多需要 stdin 或至少用户想实时看到输出；保留交互式一种模式即可覆盖绝大多数使用场景 |
| **本地 ssh.exe 依赖** | ssh2 已在依赖中（SFTP 本身就用它），其 `.shell()` 方法原生支持 PTY，VS Code 提供 Pseudoterminal 接口桥接，**不需要任何外部二进制** |

### 1.3 ssh2 的三种通道 × 三个功能

| ssh2 方法 | PTY | stdin/stdout | VS Code 对接 | 功能 |
|---|---|---|---|---|
| `.exec(cmd)` | ❌ | 非流式捕获 | 自行处理 | 解释器发现（which）、debugpy 检查/启动/kill |
| `.shell(pty)` | ✅ 自动分配 | 流式双向 | **Pseudoterminal** | 交互运行 Python、Open SSH Shell |
| `.forwardOut()` | ❌ | 原始 TCP | Node.js Duplex stream | debugpy 端口转发（替代 `ssh -fNL`） |

**注意**：`.exec()` 只做非交互的"检测"和"启动后台进程"，所有用户可见的终端交互都走 `.shell(pty)`。

---

## 2. 关键技术：VS Code Pseudoterminal

### 2.1 接口定义

```typescript
interface Pseudoterminal {
  onDidWrite: vscode.Event<string>;     // → 输出到 Terminal
  onDidClose?: vscode.Event<void | number>;
  open(initialDimensions): void;
  close(): void;
  handleInput?(data: string): void;     // ← 用户敲键盘
  setDimensions?(dimensions): void;     // Terminal 窗口 resize
}

// 创建
vscode.window.createTerminal({ name: 'SSH: myhost', pty });
```

### 2.2 ssh2 PTY ↔ Pseudoterminal 桥接

```
用户敲键盘       → handleInput(data)        → ssh2 channel.write(data) → 远程进程
远程 stdout/stderr ← channel.on('data')    ← writeEmitter.fire(data)   ← VS Code Terminal 显示
Terminal 窗口 resize → setDimensions(dim)  → channel.setWindow(w, h)  → 远程进程收到 SIGWINCH
Terminal 关闭    → close()                  → channel.end()
```

### 2.3 SshPseudoTerminal 类（核心）

**文件**：`src/core/remote-client/sshPseudoTerminal.ts`

```typescript
import * as vscode from 'vscode';
import { Client } from 'ssh2';

export class SshPseudoTerminal implements vscode.Pseudoterminal {
  private writeEmitter = new vscode.EventEmitter<string>();
  private closeEmitter = new vscode.EventEmitter<void | number>();
  private channel: any;
  private closed = false;

  onDidWrite = this.writeEmitter.event;
  onDidClose = this.closeEmitter.event;

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

      channel.on('data', (d: Buffer) => this.writeEmitter.fire(d.toString('utf8')));
      channel.stderr.on('data', (d: Buffer) => this.writeEmitter.fire(d.toString('utf8')));
      channel.on('close', (code: number | null) => {
        if (!this.closed) {
          this.closed = true;
          this.closeEmitter.fire(code ?? 0);
        }
      });

      if (this.initialCommand) {
        channel.write(this.initialCommand + '\n');
      }
    });
  }

  handleInput(data: string): void {
    if (this.channel && !this.closed) {
      this.channel.write(data);
    }
  }

  setDimensions(dimensions: vscode.TerminalDimensions): void {
    if (this.channel) {
      try { this.channel.setWindow(dimensions.columns, dimensions.rows, 480, 640); }
      catch (e) { /* channel 可能已关闭 */ }
    }
  }

  close(): void {
    this.closed = true;
    if (this.channel) { try { this.channel.end(); } catch (e) {} this.channel = null; }
    this.writeEmitter.dispose();
    this.closeEmitter.dispose();
  }
}
```

### 2.4 使用示例

**打开纯 SSH Shell（现有功能改造）**：
```typescript
const pty = new SshPseudoTerminal(sshClient);
const terminal = vscode.window.createTerminal({
  name: `SSH: ${config.host}`,
  pty
});
terminal.show();
```

**运行 Python 文件**：
```typescript
const remoteCmd = `cd "${remoteDir}" && "${pythonPath}" "${fileName}" ${args}`;
const pty = new SshPseudoTerminal(sshClient, remoteCmd);
const terminal = vscode.window.createTerminal({
  name: `Python: ${fileName} @ ${config.host}`,
  pty
});
terminal.show();
```

---

## 3. 完整架构

### 3.1 分层图

```
┌─────────────────────────────────────────────────────────────┐
│  package.json                                               │
│  - commands: selectInterpreter / runPython / debugPython    │
│              / openSshShell (改造)                           │
│  - menus: .py 文件右键菜单                                   │
│  - configuration: sftp.python.*                              │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│  Commands                                                   │
│  src/commands/                                              │
│    commandOpenSshConnection.ts  ← 改造：ssh.exe → PTY      │
│    commandSelectPythonInterpreter.ts                        │
│    commandRunPythonFile.ts     ← SshPseudoTerminal           │
│    commandDebugPythonFile.ts   ← ssh2.exec + forwardOut     │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│  Service Layer（新增 src/modules/python/）                  │
│    pythonService.ts         统一入口                         │
│    pythonInterpreter.ts     which + conda + venv 发现        │
│    pythonConfig.ts          globalState 持久化               │
│    pythonRunner.ts          构造远程命令字符串                 │
│    pythonDebugAdapter.ts    debugpy + forwardOut + launch    │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│  Infra Layer（扩展 sshClient）                              │
│  sshClient.exec(command)     ssh2.exec，捕获输出             │
│  sshClient.shell(cmd?, pty?) ssh2.shell，返回 PTY channel    │
│  sshClient.forwardOut(...)   ssh2.forwardOut，原始 TCP       │
│  sshPseudoTerminal.ts        新增 —— PTY ↔ Terminal 桥接     │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 三条执行路径

#### 路径 A：Open SSH Shell + 交互运行 Python

```
┌────────────────────────────────────┐
│ VS Code Terminal                   │
│  ↑ onDidWrite.fire(data)           │
│  ↓ handleInput(data)               │
└──────────┬─────────────────────────┘
           │
┌──────────▼─────────────────────────┐
│ SshPseudoTerminal                  │
│  open() → client.shell(pty)         │
│  handleInput() → channel.write     │
│  on('data') → writeEmitter.fire     │
│  setDimensions() → setWindow        │
└──────────┬─────────────────────────┘
           │
┌──────────▼─────────────────────────┐
│ ssh2 Client.shell() → PTY channel  │
└────────────────────────────────────┘
```

**触发入口**：
- `SFTP: Open SSH in Terminal` → 纯 shell（不传 initialCommand）
- `.py` 文件右键 → `Run Python File` → 打开 shell 并自动执行 `cd dir && python file.py`

#### 路径 B：调试 Python

```
前置检查: ssh2.exec("python -c 'import debugpy'")
          ├── 有 → 继续
          └── 没有 → showWarningMessage + 用户手动执行 "python -m pip install debugpy"

步骤 1: ssh2.exec("python -m debugpy --listen 0.0.0.0:5678 --wait-for-client file.py &")
步骤 2: ssh2.forwardOut('127.0.0.1', 5678, '127.0.0.1', 5678)
          ↓
          本地 localhost:5678 → 远程 127.0.0.1:5678
步骤 3: vscode.debug.startDebugging({
          type: 'debugpy', request: 'attach',
          connect: { host: 'localhost', port: 5678 },
          pathMappings: [{ localRoot: localCacheDir, remoteRoot: remoteDir }]
        })
步骤 4: 用户在 VS Code 中设置断点 → 运行 → 断点命中
步骤 5: 结束 → ssh2.exec("kill $(pgrep -f debugpy)") + close forwardOut stream
```

#### 路径 C：解释器发现（基础设施）

```
ssh2.exec("which -a python3 python python3.8-3.12") → PATH 中所有 python
ssh2.exec("python -c 'import json,sys,...'")        → 版本 + debugpy 检测
ssh2.exec("conda env list --json")                  → conda 环境
ssh2.exec("find ~ -name activate ...")              → venv 扫描
```

### 3.3 FTP 协议的限制

FTP 不支持 ssh2 `.shell()` 和 `.forwardOut()`。当用户用 FTP profile 时：

```typescript
if (config.protocol !== 'sftp') {
  vscode.window.showWarningMessage(
    l10n.t('SSH shell and debugging require SFTP protocol.')
  );
  return;
}
```

---

## 4. 需求明细

### 4.1 Python 解释器（ssh2.exec，非交互）

| # | 需求 | 实现 |
|---|---|---|
| F1 | 自动发现 PATH + conda + venv | `which -a` + `python -c json` + `conda env list` + `find ~` |
| F2 | 手动选择 | QuickPick + showInputBox |
| F3 | 持久化到 profile | globalState，key = `host:port/user/remotePath` |
| F4 | 状态栏 | Remote Explorer TreeView 顶部 `🐍 Python 3.11.6` |
| F5 | 首次引导 | Remote Explorer 首次打开时，检测到 Python → 提示配置 |

### 4.2 交互运行 Python（SshPseudoTerminal）

| # | 需求 | 实现 |
|---|---|---|
| F6 | `.py` 文件右键菜单 | `Run Python File`（`$(play)` 图标） |
| F7 | 命令面板 | `SFTP: Run Python File on Remote` |
| F8 | 工作目录 | 默认文件所在目录，可配置 `sftp.python.defaultCwd` |
| F9 | 运行参数 | 首次弹出 showInputBox，记住后复用 |
| F10 | 支持 input() | ✅ PTY 模式原生支持 stdin |
| F11 | 支持 Ctrl+C | ✅ VS Code Terminal 原生处理 SIGINT |
| F12 | Open SSH in Terminal | **改造现有功能**：ssh.exe → SshPseudoTerminal |

### 4.3 调试 Python（ssh2.exec + forwardOut）

| # | 需求 | 实现 |
|---|---|---|
| F13 | `.py` 文件右键菜单 | `Debug Python File`（`$(debug-alt)` 图标） |
| F14 | 命令面板 | `SFTP: Debug Python File on Remote` |
| F15 | debugpy 检测 | 调试前 `python -c 'import debugpy'`，缺失则提示用户手动安装 |
| F16 | debugpy 启动 | `python -m debugpy --listen 0.0.0.0:5678 --wait-for-client file.py &` |
| F17 | 端口转发 | `ssh2.forwardOut('127.0.0.1', local, '127.0.0.1', remote)` |
| F18 | launch.json 动态生成 | `pathMappings`: SFTP 本地缓存路径 ↔ 远程路径 |
| F19 | 调试结束清理 | `kill $(pgrep -f debugpy)` + close forwardOut stream |

### 4.4 package.json 改动

```jsonc
{
  "contributes": {
    "commands": [
      {
        "command": "sftp.python.selectInterpreter",
        "title": "%commands.sftp.python.select.title%",
        "category": "SFTP"
      },
      {
        "command": "sftp.python.runFile",
        "title": "%commands.sftp.python.run.title%",
        "category": "SFTP",
        "icon": "$(play)"
      },
      {
        "command": "sftp.python.debugFile",
        "title": "%commands.sftp.python.debug.title%",
        "category": "SFTP",
        "icon": "$(debug-alt)"
      }
    ],
    "menus": {
      "view/item/context": [
        {
          "command": "sftp.python.runFile",
          "group": "1_python@1",
          "when": "view == remoteExplorer && viewItem == file && resourcePath =~ /\\.py$/"
        },
        {
          "command": "sftp.python.debugFile",
          "group": "1_python@2",
          "when": "view == remoteExplorer && viewItem == file && resourcePath =~ /\\.py$/"
        }
      ],
      "commandPalette": [
        { "command": "sftp.python.selectInterpreter", "when": "sftp.enabled" },
        { "command": "sftp.python.runFile", "when": "sftp.enabled" },
        { "command": "sftp.python.debugFile", "when": "sftp.enabled" }
      ]
    },
    "configuration": {
      "properties": {
        "sftp.python.defaultArgs": {
          "type": "string", "default": "",
          "description": "%config.python.defaultArgs.desc%"
        },
        "sftp.python.debugpyPort": {
          "type": "number", "default": 5678,
          "description": "%config.python.debugpyPort.desc%"
        }
      }
    }
  }
}
```

### 4.5 文件路径映射

Remote Explorer URI: `remote://host:22/home/user/project/main.py`

```typescript
const uri = vscode.Uri.parse('remote://host:22/home/user/project/main.py');
// uri.authority → "host:22"
// uri.path      → "/home/user/project/main.py"
// 远程目录      → "/home/user/project"
// 文件名        → "main.py"
// 本地缓存      → 查 fileService 已下载的缓存路径
```

---

## 5. sshClient 基类扩展

### 5.1 RemoteClient 新增 3 个方法

**文件**：`src/core/remote-client/remoteClient.ts`

```typescript
abstract class RemoteClient {
  // 已有方法（connect, sftp, list ...）

  /**
   * 非交互式执行远程命令
   * 用途：解释器发现、debugpy 检查/启动/kill
   */
  abstract exec(command: string): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
  }>;

  /**
   * 交互式 shell（PTY）
   * 用途：交互运行 Python、Open SSH Shell
   */
  abstract shell(
    initialCommand?: string,
    ptyOptions?: { cols: number; rows: number }
  ): Promise<any>;

  /**
   * 本地 → 远程 TCP 端口转发
   * 用途：debugpy 端口转发
   */
  abstract forwardOut(
    localHost: string, localPort: number,
    remoteHost: string, remotePort: number
  ): Promise<any>;
}
```

### 5.2 SSHClient 实现

**文件**：`src/core/remote-client/sshClient.ts`（扩展）

```typescript
async exec(command: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    (this as any)._client.exec(command, (err, channel) => {
      if (err) return reject(err);
      const chunks: Buffer[] = [];
      const errChunks: Buffer[] = [];
      channel.on('close', (code: number | null) => {
        resolve({
          stdout: Buffer.concat(chunks).toString('utf8'),
          stderr: Buffer.concat(errChunks).toString('utf8'),
          exitCode: code ?? 0,
        });
      });
      channel.on('data', (d: Buffer) => chunks.push(d));
      channel.stderr.on('data', (d: Buffer) => errChunks.push(d));
    });
  });
}

async shell(initialCommand?: string, ptyOptions?: { cols: number; rows: number }): Promise<any> {
  return new Promise((resolve, reject) => {
    (this as any)._client.shell(ptyOptions ?? { cols: 80, rows: 24 }, (err, channel) => {
      if (err) return reject(err);
      if (initialCommand) channel.write(initialCommand + '\n');
      resolve(channel);
    });
  });
}

async forwardOut(
  localHost: string, localPort: number,
  remoteHost: string, remotePort: number
): Promise<any> {
  return new Promise((resolve, reject) => {
    (this as any)._client.forwardOut(localHost, localPort, remoteHost, remotePort, (err, stream) => {
      if (err) return reject(err);
      resolve(stream);
    });
  });
}
```

### 5.3 FTP Client — 只实现 exec

FTP 不支持 shell/forwardOut。当用户用 FTP profile 调用 Python 功能时，提示降级：

```typescript
// 在 command 入口统一检查
if (config.protocol !== 'sftp') {
  vscode.window.showWarningMessage(
    l10n.t('SSH shell and debugging require SFTP protocol.')
  );
  return;
}
```

---

## 6. Open SSH in Terminal 改造（原有功能）

### 6.1 Before → After 对比

**Before**（v4.0 之前，启动本地 ssh.exe）：
```typescript
// src/commands/commandOpenSshConnection.ts
const sshCommand = `ssh -t ${username}@${host} -p ${port} -i "${keyPath}"`;
const terminal = vscode.window.createTerminal(config.name);
terminal.sendText(sshCommand);
terminal.show();
```

**After**（v4.0，纯 ssh2 PTY）：
```typescript
const sshClient = await getOrCreateSshClient(config); // 复用已有 SFTP 连接
const pty = new SshPseudoTerminal(sshClient);
const terminal = vscode.window.createTerminal({
  name: `SSH: ${config.host}`,
  pty
});
terminal.show();
```

### 6.2 改造优势

| 好处 | 说明 |
|---|---|
| **零外部依赖** | 不再需要本地 ssh.exe（Windows 上可能没装） |
| **鉴权自动复用** | ssh2 client 已有 agent/key/password 会话，不用再连一次 |
| **跳板机自动支持** | ssh2 的 hop/jump 已处理好，ssh.exe 需要额外 ProxyJump 配置 |
| **跨平台一致** | Windows/Linux/macOS 行为完全相同 |
| **连接状态同步** | SFTP 连接断开 → Terminal 自动关闭（监听 sshClient.on('close')） |

### 6.3 新增：Terminal 生命周期管理

```typescript
// 每个 SshPseudoTerminal 记录在 SSHClient 上
// SSHClient 断开时通知所有关联的 Terminal
this._client.on('close', () => {
  this._terminals.forEach(pty => {
    try { pty.close(); } catch (e) {}
  });
});
```

---

## 7. 新增/修改文件清单

### 新增（9 个）

| 文件 | 职责 |
|---|---|
| `src/core/remote-client/sshPseudoTerminal.ts` | **核心**：ssh2 PTY ↔ VS Code Pseudoterminal 桥接 |
| `src/modules/python/pythonService.ts` | 统一入口，协调发现/选择/运行/调试 |
| `src/modules/python/pythonInterpreter.ts` | which + conda + venv 发现 |
| `src/modules/python/pythonConfig.ts` | globalState 持久化 |
| `src/modules/python/pythonRunner.ts` | 命令字符串构造 + 调用 SshPseudoTerminal |
| `src/modules/python/pythonDebugAdapter.ts` | debugpy 检查 + forwardOut + launch.json + 清理 |
| `src/commands/commandSelectPythonInterpreter.ts` | QuickPick 选择 |
| `src/commands/commandRunPythonFile.ts` | SshPseudoTerminal 交互运行 |
| `src/commands/commandDebugPythonFile.ts` | debugpy attach 调试 |

### 修改（4 个）

| 文件 | 改动 |
|---|---|
| `src/core/remote-client/sshClient.ts` | +exec() +shell() +forwardOut() + 终端生命周期管理 |
| `src/core/remote-client/ftpClient.ts` | +exec()（FTP 协议只实现非交互） |
| `src/commands/commandOpenSshConnection.ts` | ssh.exe → **SshPseudoTerminal**（原有功能改造） |
| `package.json` | +3 commands +2 configs + i18n keys |

**总计**：新增 9 文件 + 修改 4 文件

---

## 8. 实施计划

| Phase | 内容 | 预估 |
|---|---|---|
| **1** | sshClient.exec() / shell() / forwardOut() + **SshPseudoTerminal 核心类** | 1-2 天 |
| **2** | **改造 Open SSH in Terminal**（原有功能先改，验证 SshPseudoTerminal 稳定性） | 0.5 天 |
| **3** | Python 解释器发现 + 选择 + 持久化 | 1 天 |
| **4** | 交互运行 Python（右键 + 命令面板） | 0.5 天 |
| **5** | debugpy 调试完整链路（检查 → 启动 → forwardOut → launch → 清理） | 2-3 天 |
| **6** | 打磨 + 错误提示 + 中英文 i18n | 1 天 |

总计：**5-8 天**

---

## 9. 风险与应对

| 风险 | 影响 | 概率 | 应对 |
|---|---|---|---|
| **ssh2 shell PTY echo 双重** | bash/zsh 有 readline 自己处理 echo | 低 | 实测 ssh2 PTY 默认正确处理；如有可 `channel.write('stty -echo\n')` |
| **VS Code Pseudoterminal 兼容性** | API v1.46+，当前扩展要求 v1.64.2 | ✅ 兼容 | 无风险 |
| **Terminal resize 远程不生效** | 远程进程不知道窗口大小变了 | 低 | setDimensions() → channel.setWindow(w, h, 480, 640) 已处理 |
| **多 Profile 多连接** | 每个 SSHClient 有独立 PTY channel | — | 按 fileService 已有连接模型复用 |
| **debugpy pathMappings 断点不命中** | 调试暂停不在预期行 | 高 | SFTP 本地缓存路径已知（fileService）；先粗后细迭代 |
| **debugpy 未安装** | 调试功能不可用 | 中 | **不自动安装**，`showWarningMessage` 提示用户 `python -m pip install debugpy` |
| **FTP 协议降级** | FTP 不支持 shell/forwardOut | — | 入口统一检查 protocol，非 SFTP 时提示 "SSH shell and debugging require SFTP protocol" |

---

## 附录 A：forwardOut 替代 ssh -fNL

```typescript
// ssh.exe 方式（已废弃）：
// spawn('ssh', ['-fNL', '5678:127.0.0.1:5678', 'user@host'])

// ssh2 forwardOut（推荐，不依赖任何外部进程）：
const stream = await sshClient.forwardOut(
  '127.0.0.1', 5678,     // 本地监听
  '127.0.0.1', 5678      // 转发到远程 debugpy
);
// stream 是 Node.js Duplex，VS Code debug adapter 自动连接 localhost:5678
// 调试结束：stream.end()
```

## 附录 B：debugpy 端口冲突处理

```typescript
const basePort = 5678;
let port = basePort;
while (port < basePort + 10) {
  try {
    await sshClient.exec(`python -m debugpy --listen 0.0.0.0:${port} --wait-for-client ${file} &`);
    break;
  } catch (e) { port++; }
}
```

## 附录 C：远程 Python 发现命令

```bash
# PATH 中所有 python
which -a python3 python python3.8 python3.9 python3.10 python3.11 python3.12 2>/dev/null || true

# 版本 + debugpy 检测（一条 JSON）
python3 -c "
import sys, json, importlib.util
print(json.dumps({
  'version': sys.version.split()[0],
  'majorMinor': '{}.{}'.format(sys.version_info.major, sys.version_info.minor),
  'executable': sys.executable,
  'prefix': sys.prefix,
  'base_prefix': sys.base_prefix,
  'has_debugpy': importlib.util.find_spec('debugpy') is not None
}))"

# conda environments
conda env list --json 2>/dev/null
```

## 附录 D：launch.json 模板

```jsonc
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "SFTP: Debug main.py (remote)",
      "type": "debugpy",
      "request": "attach",
      "connect": { "host": "localhost", "port": 5678 },
      "pathMappings": [
        {
          "localRoot": "${workspaceFolder}/.sftp-cache/host22/home/user/project",
          "remoteRoot": "/home/user/project"
        }
      ],
      "justMyCode": false,
      "subProcess": true
    }
  ]
}
```

---

*— v4.0 END —*
