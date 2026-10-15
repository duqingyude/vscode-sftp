# v1.18 Python 新功能 — 完整测试设计文档

> 版本: v1.0 | 日期: 2026-10-15 | 对应实现: v1.18.0 ~ v1.18.2

---

## 1. 测试范围覆盖矩阵

| # | 模块 | 功能 | 单元 | 手动 | 集成 |
|---|---|---|---|---|---|
| 1 | `sshClient` | `exec()` 非交互命令执行 | ✅ | | ✅ |
| 2 | `sshClient` | `shell(pty)` PTY channel | ⚠️ | | ✅ |
| 3 | `sshClient` | `forwardOut()` 端口转发 | ⚠️ | | ✅ |
| 4 | `sshPseudoTerminal` | ssh2 PTY ↔ Pseudoterminal 桥接 | ✅ | ✅ | |
| 5 | `pythonConfig` | sftp.json python 字段读写 | ✅ | ✅ | |
| 6 | `pythonRunner` | `buildPythonCommand()` 命令构造 | ✅ | | |
| 7 | `pythonInterpreter` | discover / checkOne / checkDebugpy | ✅ | ✅ | ✅ |
| 8 | `pythonService` | resolveForFile / resolveRemoteContext | ❌ 依赖 VS Code | ✅ | |
| 9 | `pythonDebugAdapter` | start / cleanup / launch | ❌ 依赖 VS Code Debug API | ✅ | ✅ |
| 10 | 3 个 commands | 完整交互流程 | ❌ | ✅ | ✅ |
| 11 | package.json menus | 菜单出现条件 | | ✅ | |
| 12 | i18n | 中/英翻译覆盖 | | ✅ | |

**图例**：✅ 可覆盖 / ⚠️ 部分覆盖 / ❌ 需上一层辅助 / — 不需要

---

## 2. 单元测试用例

### 2.1 `pythonConfig.test.ts`（10 case）

**覆盖函数**：`savePythonToSftpJson`, `readPythonFromSftpJson`, `findWorkspaceForHost`

| # | Case | 输入 | 预期 |
|---|---|---|---|
| C1 | 保存到单对象 sftp.json | `host=h,port=22,path=/usr/bin/python3,args='-v'` | 文件新增 `"python": { "interpreter": "/usr/bin/python3", "args": "-v" }` |
| C2 | 保存到数组格式 sftp.json | 数组有 2 个 profile，匹配第 2 个 | 只改匹配的那一项 |
| C3 | 覆盖已有 python 字段 | 已有 `"python": { "interpreter": "/old/py" }` | 替换为新 interpreter |
| C4 | 空 args 不写入（undefined） | `args=undefined` | python 只有 interpreter 字段 |
| C5 | readPythonFromSftpJson 命中 | host/port 匹配 | 返回 `{ path, args }` |
| C6 | readPythonFromSftpJson 未命中 | host/port 不匹配 | 返回 undefined |
| C7 | readPythonFromSftpJson 命中但未设 python | host/port 匹配但无 python 字段 | 返回 undefined |
| C8 | sftp.json 文件不存在 | 路径不存在 | save → 抛 / read → 返回 undefined |
| C9 | findWorkspaceForHost 单工作区 | 一个 workspace 含匹配 sftp.json | 返回该 workspaceUri |
| C10 | findWorkspaceForHost 多工作区 | 多个 workspace，只有一个匹配 | 返回匹配的那个 |

### 2.2 `pythonRunner.test.ts`（5 case）

**覆盖函数**：`buildPythonCommand`

| # | Case | 输入 | 预期 |
|---|---|---|---|
| C1 | 基础命令 | `pythonPath=/usr/bin/python3, dir=/home/u, file=a.py, args=''` | `cd "/home/u" && "/usr/bin/python3" "a.py"` |
| C2 | 含 args | `args='--verbose -x 1'` | 末尾带 args |
| C3 | 路径含空格 | `dir="/home/my proj", file="my file.py"` | 双引号包裹 `cd "/home/my proj" && ... "my file.py"` |
| C4 | 路径含双引号 | `dir='/home/u/n"m'` | 转义 `\"` |
| C5 | args 含前后空格 | `args='  -v  '` | trim 后 `&& "/p" "f.py" -v` |

### 2.3 `pythonInterpreter.test.ts`（8 case）

**覆盖函数**：`discover`, `checkOne`, `checkDebugpy`（通过 mock RemoteClient.exec）

| # | Case | mock exec 行为 | 预期 |
|---|---|---|---|
| C1 | discover：全部 python 不存在 | `which -a` 返回空 | 返回空数组 |
| C2 | discover：一个 python 可用 | `which -a` 返回 `/usr/bin/python3` + checkOne JSON 正常 | 1 条 RemotePython |
| C3 | discover：多个 python | which 返回 3 个路径，2 个 checkOne 正常 | 2 条，按 version 降序 |
| C4 | discover：一个 python 坏 | 其中一个 exec 抛异常 | 跳过坏的，保留好的 |
| C5 | discover：conda 存在 | `conda env list --json` 返回 2 个 env | 追加 conda env 中的 python |
| C6 | discover：conda 不存在 | conda 命令 exitCode≠0 | 跳过 conda 分支 |
| C7 | checkDebugpy：已安装 | `python -c 'import debugpy'` exitCode=0 | 返回 true |
| C8 | checkDebugpy：未安装 | exitCode≠0 | 返回 false |

### 2.4 `sshClient.test.ts`（6 case）

**覆盖函数**：`exec`, `shell`, `forwardOut`（通过 mock ssh2 Client）

| # | Case | mock ssh2 行为 | 预期 |
|---|---|---|---|
| C1 | exec 成功 | cb(null, channel) → channel 触发 data + close | resolve({ stdout, stderr, exitCode }) |
| C2 | exec 失败 | cb(err) | reject(err) |
| C3 | exec stderr | channel.stderr.on('data') 触发 | stderr 字段正确 |
| C4 | shell 成功 | cb(null, channel) | resolve(channel) |
| C5 | shell 失败 | cb(err) | reject(err) |
| C6 | forwardOut 成功 | cb(null, stream) | resolve(stream) |
| C7 | forwardOut 失败 | cb(err) | reject(err) |
| C8 | exec exitCode null（进程被 kill） | close(null) | exitCode=0 |

### 2.5 `sshPseudoTerminal.test.ts`（8 case）

**覆盖函数**：`open`, `handleInput`, `setDimensions`, `close`（mock ssh2 Client + vscode.EventEmitter）

| # | Case | 动作 | 预期 |
|---|---|---|---|
| C1 | open → writeEmitter fire | channel.on('data', buf) 触发 | `writeEmitter.fire(buf.toString())` 被调用 |
| C2 | open → closeEmitter fire | channel.on('close', code) | `closeEmitter.fire(code ?? 0)` 被调用 |
| C3 | handleInput → channel.write | `pty.handleInput('ls\r')` | `channel.write('ls\r')` 被调用 |
| C4 | handleInput 当 channel 已 close | 先调 `pty.close()` 再 `handleInput` | channel.write **不被调用** |
| C5 | setDimensions → channel.setWindow | `pty.setDimensions({ columns: 120, rows: 40 })` | `channel.setWindow(120, 40, 480, 640)` |
| C6 | close → channel.end | `pty.close()` | `channel.end()` + 所有 emitter dispose |
| C7 | 初始命令 | `new SshPseudoTerminal(client, 'echo hi')` | open 时 `channel.write('echo hi\n')` |
| C8 | stderr 也 fire | channel.stderr.on('data') 触发 | writeEmitter.fire 被调用 |

**辅助**：mockChannel 加 `emitData(buf)` / `emitClose(code)` 手动触发事件。

---

## 3. 手动测试清单

> 使用真实 SFTP profile：`.vscode/sftp.json` → `192.168.50.243`

### 3.1 Select Python Interpreter

| # | 步骤 | 预期 |
|---|---|---|
| M1.1 | 右键 Remote Explorer 根节点 → "Select Remote Python Interpreter" | QuickPick 弹出，列出远程 Python |
| M1.2 | 选择一个 | sftp.json 自动加 `"python": { "interpreter": "..." }` |
| M1.3 | 再次选择不同的 | sftp.json 被覆盖 |
| M1.4 | 选 "Enter path manually..." | showInputBox 弹窗，手动输入后写入 sftp.json |
| M1.5 | 执行命令面板 "Select Remote Python Interpreter" | 多 profile 时 QuickPick 让用户选节点（从 commandPalette 进入时无 item） |

### 3.2 Open SSH in Terminal

| # | 步骤 | 预期 |
|---|---|---|
| M2.1 | 右键 Remote Explorer 根节点 → "Open SSH in Terminal" | VS Code Terminal 打开，SSH PTY 连接成功 |
| M2.2 | 在 Terminal 里敲 `pwd` / `ls` | 正常输出 |
| M2.3 | 在 Terminal 里敲 Ctrl+C | 中断当前命令 |
| M2.4 | Terminal 窗口 resize | 远程收到 SIGWINCH |
| M2.5 | SFTP 连接断开（拔网线 / server shutdown） | Terminal 自动关闭（channel.on('close')） |

### 3.3 Run Python File

| # | 步骤 | 预期 |
|---|---|---|
| M3.1 | 右键远程 `.py` 文件 → "Run Python File on Remote" | 打开 PTY Terminal，cd 到目录 + python file.py |
| M3.2 | 第一次 Run（sftp.json 没 python） | 自动弹出 QuickPick 让选 interpreter |
| M3.3 | 有 `input()` 的脚本 | 暂停等待用户输入（PTY 交互生效） |
| M3.4 | Run 时取消 args 输入 | Terminal 不打开 |
| M3.5 | 本地 `.py` Editor 右键 → "Run Python File" | 没有远程 URI → QuickPick 让用户选远程节点 |

### 3.4 Debug Python File

| # | 步骤 | 预期 |
|---|---|---|
| M4.1 | 右键 `.py` → "Debug Python File on Remote"，远程没装 debugpy | showWarningMessage："debugpy is not installed... Copy command / Cancel" |
| M4.2 | 选 "Copy command" | Clipboard 写入 `python -m pip install debugpy` |
| M4.3 | 已装 debugpy | ssh2.exec 后台启动 debugpy → ssh2.forwardOut 端口转发 → VS Code Debug attach |
| M4.4 | VS Code 设置断点 → 启动 | 断点命中（pathMappings 正确） |
| M4.5 | 结束调试 | debugpy 进程被 kill + forwardOut stream 关闭 |
| M4.6 | forwardOut 端口 5678 被占用 | 错误提示（端口冲突处理待增强） |

### 3.5 菜单出现条件

| # | 步骤 | 预期 |
|---|---|---|
| M5.1 | Remote Explorer 根节点右键 | 有 Open SSH in Terminal + Select Python Interpreter |
| M5.2 | Remote Explorer `.py` 文件右键 | 有 Run Python + Debug Python |
| M5.3 | Remote Explorer 非 `.py` 文件右键 | **没有** Run Python + Debug Python |
| M5.4 | Editor 打开 `.py` 文件（本地）右键 | 有 Run Python + Debug Python |
| M5.5 | Editor 打开 `.js` 文件右键 | **没有** Run Python + Debug Python |
| M5.6 | FTP profile 上调用 Run/Debug | 提示 "Run Python requires SFTP protocol." |

### 3.6 i18n

| # | 步骤 | 预期 |
|---|---|---|
| M6.1 | VS Code 语言 en | 菜单/命令/提示全英文 |
| M6.2 | VS Code 语言 zh-cn | 菜单/命令/提示全中文 |

---

## 4. 已知限制

| 限制 | 说明 | 应对 |
|---|---|---|
| **debugpy pathMappings** | 当前用 remoteDir 作为 localCacheDir，SFTP 本地缓存路径映射需查 fileService | 后续迭代 |
| **多端口冲突** | debugpy 固定 5678，被占用时没自动换端口 | 后续迭代（plan 文档附录 B 有方案） |
| **ExplorerChild Python 命令的 args 持久化** | 只持久化到内存，关闭 VS Code 后丢（sftp.json 只有 interpreter） | 可加 args 字段，非必须 |
| **Jest 不支持 async / done 混用** | transform 用 ts-node，不要写混合模式 | 全部 async/await |
| **真实 PTY 行为** | `setWindow` 的 SIGWINCH 在 Windows 上有边界情况 | 在 Linux/macOS 远程上测 |

---

## 5. 测试结果模板

| 日期 | 版本 | 环境 | 结果 | 备注 |
|---|---|---|---|---|
| 2026-10-15 | v1.18.2 | Windows + 远程 Ubuntu | — | 待执行 |
