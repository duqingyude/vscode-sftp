# Python 新功能测试计划 + 设计文档

## Repository Research

### 现有测试基础设施

| 项 | 详情 |
|---|---|
| 测试框架 | Jest 29（`npm test`） |
| TS 编译 | `test/preprocessor.js`（TS → JS 变换） |
| 测试匹配 | `test/**/*.spec.js` + `**/__tests__/*.ts` |
| Mock 模式 | `jest.mock('fs')` + `memfs`（现有 transfer-test.ts） |
| 已有 mock helper | `test/helper/localRemoteFs.ts` |
| 依赖 | `memfs`、`fs-extra`（已在 devDeps） |

**约束**：Jest 环境不能直接 require `vscode` 模块 → 所有调用 VS Code API 的代码必须依赖注入或在测试中 mock 整个 `vscode` 模块。

### 新功能清单（v1.18.0 ~ v1.18.2）

| # | 模块 | 功能 | 可单测？ |
|---|---|---|---|
| 1 | `sshClient` | `exec()` 非交互命令执行 | ✅ mock ssh2 Client |
| 2 | `sshClient` | `shell(pty)` PTY channel | ⚠️ 部分（bridge 逻辑可测，真实 PTY 行为需集成） |
| 3 | `sshClient` | `forwardOut()` 端口转发 | ⚠️ 部分 |
| 4 | `sshPseudoTerminal` | ssh2 PTY ↔ Pseudoterminal 桥接 | ⚠️ 部分（vscode.Pseudoterminal 接口可 mock） |
| 5 | `pythonConfig` | 读写 `.vscode/sftp.json` python 字段 | ✅ 纯 fs 操作，mock fs-extra |
| 6 | `pythonConfig` | `findWorkspaceForHost()` 多工作区匹配 | ✅ |
| 7 | `pythonRunner` | `buildPythonCommand()` 命令构造 | ✅ 纯字符串 |
| 8 | `pythonInterpreter` | `discover()` / `checkOne()` / `checkDebugpy()` | ✅ mock RemoteClient.exec |
| 9 | `pythonService` | `resolveForFile()` / `selectInterpreter()` | ❌ 依赖 vscode.QuickPick/showInputBox |
| 10 | `pythonService` | `resolveRemoteContext()` / `pickConnection()` | ❌ 依赖 vscode + getAllFileService |
| 11 | `pythonDebugAdapter` | `start()` / `cleanup()` / `launchVsCodeDebug()` | ❌ 依赖 VS Code Debug API |
| 12 | 3 个 commands | 完整交互流程 | ❌ 端到端 → 手动 / 集成测试 |

### VS Code API mock 策略

现有项目 Jest 环境里**没有** vscode 的 mock。需要：

```typescript
// test/helper/mockVscode.ts
export const vscode = {
  Uri: { parse: (s) => ({ scheme: 'remote', authority: 'h:22', path: s }) },
  workspace: { workspaceFolders: [/* ... */] },
  window: {
    showQuickPick: jest.fn(),
    showInputBox: jest.fn(),
    showInformationMessage: jest.fn(),
    showWarningMessage: jest.fn(),
    showErrorMessage: jest.fn(),
    createTerminal: jest.fn().mockReturnValue({ show: jest.fn() }),
  },
  debug: {
    startDebugging: jest.fn(),
    onDidTerminateDebugSession: jest.fn(),
  },
  EventEmitter: jest.fn().mockImplementation(() => ({ fire: jest.fn(), dispose: jest.fn(), event: jest.fn() })),
  Pseudoterminal: {},  // 接口 mock
};
jest.mock('vscode', () => vscode, { virtual: true });
```

### ssh2 Client mock 策略

```typescript
// test/helper/mockSshClient.ts
const mockChannel = {
  on: jest.fn(),
  write: jest.fn(),
  end: jest.fn(),
  setWindow: jest.fn(),
  stderr: { on: jest.fn() },
};
const mockClient = {
  exec: jest.fn((cmd, cb) => cb(null, mockChannel)),
  shell: jest.fn((pty, cb) => cb(null, mockChannel)),
  forwardOut: jest.fn((lh, lp, rh, rp, cb) => cb(null, { end: jest.fn() })),
  on: jest.fn(),
};
```

---

## Files and Modules

### 要创建的文件

| 文件 | 类型 | 职责 |
|---|---|---|
| `docs/TEST_DESIGN.md` | 设计文档 | **主交付物** — 完整测试方案，每功能点测试用例清单 |
| `test/helper/mockVscode.ts` | Mock helper | vscode 虚拟模块 mock |
| `test/helper/mockSshClient.ts` | Mock helper | ssh2 Client + Channel mock |
| `test/helper/mockFs.ts` | Mock helper | fs-extra 的 sftp.json 读写 mock |
| `src/modules/python/__tests__/pythonConfig.test.ts` | Unit | savePythonToSftpJson / readPythonFromSftpJson / findWorkspaceForHost |
| `src/modules/python/__tests__/pythonRunner.test.ts` | Unit | buildPythonCommand |
| `src/modules/python/__tests__/pythonInterpreter.test.ts` | Unit | discover / checkOne / checkDebugpy（mock RemoteClient.exec） |
| `src/core/remote-client/__tests__/sshClient.test.ts` | Unit | exec / shell / forwardOut（mock ssh2） |
| `src/core/remote-client/__tests__/sshPseudoTerminal.test.ts` | Unit | bridge 逻辑（writeEmitter/handleInput/close） |

### 要修改的文件

| 文件 | 改动 |
|---|---|
| `package.json` | jest.transform 加 `moduleNameMapper` 指向 mock vscode；testMatch 加 `__tests__/*.ts` |

---

## Implementation Steps

### Step 1: 设计文档（主交付物）

**文件**：`docs/TEST_DESIGN.md`

结构：
1. 测试范围覆盖矩阵（12 个功能点 × 测试类型）
2. 单元测试用例（5 个模块，~40 个 case）
3. 集成测试场景（3 个端到端）
4. 手动测试清单（UI 点击路径 + 预期）
5. 已知限制 + 风险

### Step 2: Mock helpers

按上面策略创建 3 个 mock 文件。

### Step 3: Jest config 更新

```jsonc
"jest": {
  "moduleNameMapper": {
    "^vscode$": "<rootDir>/test/helper/mockVscode.ts"
  }
}
```

### Step 4: 5 组单元测试

| 测试文件 | 用例数 | 说明 |
|---|---|---|
| `pythonConfig.test.ts` | 10 | sftp.json 单对象 / 数组格式 / 覆盖已有 / 空 python 字段 / 不存在文件 |
| `pythonRunner.test.ts` | 5 | 基础命令 / 含空格路径 / 含引号路径 / 空 args |
| `pythonInterpreter.test.ts` | 8 | discover 空结果 / 单 python / 多 python / conda 存在 / conda 不存在 / debugpy 检测 |
| `sshClient.test.ts` | 6 | exec 成功 / exec 失败 / shell 成功 / forwardOut 成功 / forwardOut 失败 |
| `sshPseudoTerminal.test.ts` | 8 | writeEmitter fire / handleInput → channel.write / close / setDimensions / 双 stdout+stderr |

### Step 5: 运行 `npm test`

确保所有新增 case 绿。

### Step 6: 手动测试清单（文档）

用现有真实 SFTP profile（`.vscode/sftp.json` → `192.168.50.243`）列出端到端手动验证步骤。

---

## Dependencies and Considerations

| 项 | 说明 |
|---|---|
| **Jest 对 vscode 的 mock 策略** | 用 `virtual: true` + `moduleNameMapper` 双重保证，避免 transform 阶段报找不到模块 |
| **ssh2 mock 复杂度** | ssh2 `.shell(pty, cb)` 的 cb 签名是 `(err, channel)`，channel 要 mock 所有 `.on('data')` / `.on('close')` / `.stderr.on` |
| **fs-extra mock** | `savePythonToSftpJson` 直接调 `fse.readJson` / `fse.writeJson`，用 `memfs` 或 `jest.mock('fs-extra', ...)` 都可以 |
| **VS Code URI** | `Uri.parse('remote://h:22/path/to/file.py')` 的 authority/path 是纯函数，不需 mock 可直接用 Node 测试 |
| **现有测试不可破坏** | `npm test` 应继续通过（`transfer-test.ts` 用 jest.mock('fs') + memfs，不会与我们的新 mock 冲突） |
| **sftp.json 格式** | 单对象和数组格式都要覆盖（Joi allowUnknown 支持两种） |

---

## Validation

1. `npm test` 全部通过（新增 + 现有）
2. `npm run compile` 无 TypeScript 错误
3. 用真实 SFTP profile（`192.168.50.243`）手动跑：
   - 右键根节点 → Select Python → sftp.json 被正确写入
   - 右键 `.py` → Run → Terminal PTY 正常交互
   - 右键 `.py` → Debug → debugpy attach（可选，视远程环境）

---

## Risks

| 风险 | 处理 |
|---|---|
| **ssh2 mock 覆盖不全** | `.on('data')` 的事件触发要手动 fire，否则 channel 不会产生数据。可在 mockChannel 上加 `emitData(buf)` 辅助方法 |
| **`@vscode/l10n` 影响 Jest** | l10n 是纯运行时 i18n，Jest transform 阶段只看 TS 语法，不执行 l10n.t()。**无需 mock** |
| **测试中 require 的全局 `vscode` 与其他现有 mock 冲突** | 现有测试没 mock vscode。新 mock 用 `moduleNameMapper` 限定在本项目，不改 transform。旧测试跑独立路径。隔离安全 |
| **Windows vs POSIX 路径** | `path.join` / `/` 兼容 → 新测试全部用 `path.posix`，显式指定；sftp.json 路径是远程 POSIX 路径，不依赖本地 path.sep |

---

## Deliverables

| # | 交付物 |
|---|---|
| 1 | `docs/TEST_DESIGN.md` — 测试设计文档（主交付物，手动 + 单元 + 集成覆盖） |
| 2 | `test/helper/mockVscode.ts` — vscode mock |
| 3 | `test/helper/mockSshClient.ts` — ssh2 mock |
| 4 | `test/helper/mockFs.ts` — fs-extra mock |
| 5 | `src/modules/python/__tests__/pythonConfig.test.ts` — 10 个 case |
| 6 | `src/modules/python/__tests__/pythonRunner.test.ts` — 5 个 case |
| 7 | `src/modules/python/__tests__/pythonInterpreter.test.ts` — 8 个 case |
| 8 | `src/core/remote-client/__tests__/sshClient.test.ts` — 6 个 case |
| 9 | `src/core/remote-client/__tests__/sshPseudoTerminal.test.ts` — 8 个 case |
| 10 | `package.json` — Jest moduleNameMapper |
