# SFTP Extension 国际化 (i18n) 设计文档

> **版本**: v1.0  
> **日期**: 2026-10-15  
> **目标语言**: 英文 (en — 默认) + 中文简体 (zh-cn)  
> **后续可扩展**: 日文 (ja)、繁体中文 (zh-tw)、韩文 (ko) 等

---

## 1. 现状分析

### 1.1 技术基线

| 项 | 当前状态 |
|---|---|
| TypeScript | 3.9.10 (暂不升级，避免破坏编译) |
| VS Code API | `vscode@1.40` |
| 现有 i18n | **无** — 所有用户可见字符串硬编码为英文 |
| webpack | 已在用，需增加 `bundle.l10n.*.json` 的打包 |
| `@vscode/l10n` | **未安装** — 将作为新依赖引入 |

### 1.2 需要本地化的字符串清单

#### A. package.json — 声明层（约 44 处）

| # | 字段路径 | 当前值 | i18n key |
|---|---|---|---|
| 1 | `displayName` | `"SFTP Extension"` | `extension.displayName` |
| 2 | `description` | `"SFTP/FTP extension"` | `extension.description` |
| 3 | `viewsContainers.activitybar[0].title` | `"SFTP"` | `views.activitybar.title` |
| 4 | `views.sftp[0].name` | `"Explorer"` | `views.remoteExplorer.name` |
| 5 | `configuration.title` | `"sftp configuration"` | `config.title` |
| 6 | `configuration.properties.sftp.printDebugLog.description` | `"print debug log on sftp output channel.(reload vscode when change this)"` | `config.printDebugLog.desc` |
| 7 | `configuration.properties.sftp.debug.description` | 同上 | `config.debug.desc` |
| 8 | `configuration.properties.sftp.downloadWhenOpenInRemoteExplorer.description` | `"\"Download\" instead of \"View Content\" when open file in Remote Explorer"` | `config.downloadWhenOpen.desc` |
| 9–42 | `commands[*].title` (34 个命令) | `"Config"`, `"Upload File"` ... | `commands.sftp.config.title` |
| — | `commands[*].category` | 全部 `"SFTP"` | `commands.category` |

#### B. TypeScript 源码 — 运行时层（约 28 处）

**showInformationMessage / showWarningMessage / showErrorMessage**

| # | 文件 | 行 | 字符串 |
|---|---|---|---|
| 1 | `src/commands/commandSetProfile.ts` | 38 | `'No Available Profile.'` |
| 2 | `src/commands/abstract/createCommand.ts` | 56, 90 | `'Are you sure you want to upload to all profiles?'` + `'Yes'` / `'No'` |
| 3 | `src/commands/fileCommandCreateFile.ts` | 40–41 | `` `Are you sure you want to delete '${filename}'?` `` + `'Delete'` |
| 4 | `src/commands/fileCommandCreateFolder.ts` | 40–41 | 同上 |
| 5 | `src/commands/fileCommandDeleteRemote.ts` | 21–22 | 同上 |
| 6 | `src/core/fileBaseOperations.ts` | 59 | `` `Can't create file becase file already exist` `` |
| 7 | `src/core/remote-client/remoteClient.ts` | 58 | `` `[${host}]: Enter your password` `` |
| 8 | `src/helper/error.ts` | 15 | `'Detail'` |
| 9 | `src/modules/fileActivityMonitor.ts` | 70 | `'Do you want SFTP to download this file?'` |
| 10 | `src/modules/remoteExplorer/treeDataProvider.ts` | 128 | `'View Remote Resource'` |

**showInputBox prompt / showQuickPick placeHolder**

| # | 文件 | 行 | 字符串 |
|---|---|---|---|
| 11 | `src/commands/fileCommandCreateFile.ts` | 22 | `'Please input file name'` |
| 12 | `src/commands/fileCommandCreateFolder.ts` | 22 | `'Please input folder name'` |
| 13 | `src/commands/commandSetProfile.ts` | 53 | `'select a profile'` |
| 14 | `src/commands/commandOpenSshConnection.ts` | 68 | `'Select a folder...'` |
| 15 | `src/commands/commandConfig.ts` | 70 | `'Select a folder...'` |
| 16 | `src/commands/commandUploadChangedFiles.ts` | 164 | `'Choose a repository'` |
| 17 | `src/helper/select.ts` | 81 | `'Select a target...'` |

**showConfirmMessage / dialog options**

| # | 文件 | 行 | 字符串 |
|---|---|---|---|
| 18 | `src/host.ts` | 88–89 | `'Yes'` / `'No'` (confirm label 默认值) |
| 19 | `src/commands/commandConfig.ts` | 20–21 | `'SFTP expects to work at a folder.'` + `'Open Folder'` |
| 20 | `src/commands/commandConfig.ts` | 34–35 | `'There are no available folders in current workspace.'` + `'Add Folder to Workspace'` |

**tree item label / UI label**

| # | 文件 | 行 | 字符串 |
|---|---|---|---|
| 21 | `src/commands/commandSetProfile.ts` | 24 | `` `${profile} (active)` `` |
| 22 | `src/commands/commandSetProfile.ts` | 32 | `'UNSET'` |

**Error messages (直接抛给用户的)**

| # | 文件 | 行 | 字符串 |
|---|---|---|---|
| 23 | `src/core/fileService.ts` | 196 | `` `Can't not find remote "${remote}"` `` |
| 24 | `src/core/fileService.ts` | 338 | `` `Environment variable "${evnVarName}" not found` `` |
| 25 | `src/core/remote-client/ftpClient.ts` | 63 | `'Timeout while connecting to server'` |
| 26 | `src/core/remoteFileSystem.ts` | 38 | `'No client or clientOption is provided'` |
| 27 | `src/modules/remoteExplorer/explorer.ts` | 45 | `` `Config Not Found. (${uri})` `` |
| 28 | `src/modules/remoteExplorer/treeDataProvider.ts` | 140, 185, 225 | 3 处 `Can't find config/remote...` |

---

## 2. 技术选型

采用 **VS Code 官方原生 i18n 方案**（`@vscode/l10n` + `package.nls.json`），这是 2023 年起 VS Code 官方推荐、未来唯一维护的本地化机制。

### 2.1 两层文件结构

```
vscode-sftp/
├── package.json                    ← 源文件，%key% 形式引用
├── package.nls.json                ← 默认英文（值与现在完全相同）
├── package.nls.zh-cn.json          ← 中文翻译
├── l10n/
│   ├── bundle.l10n.json            ← TS 源码中的 l10n.t() 默认英文
│   └── bundle.l10n.zh-cn.json      ← TS 源码中的 l10n.t() 中文翻译
├── webpack.config.js               ← 增加 l10n bundle 处理
├── src/
│   └── i18n.ts                     ← 可选：封装 t() 工具
└── ...
```

### 2.2 package.json 层 — `%key%` 语法

将所有硬编码英文字符串改为 `%key%`，对应翻译放在 `package.nls.*.json`：

```jsonc
// package.json (源文件)
{
  "displayName": "%extension.displayName%",
  "description": "%extension.description%",
  "contributes": {
    "commands": [
      {
        "command": "sftp.config",
        "title": "%commands.sftp.config.title%",
        "category": "%commands.category%"
      }
    ]
  }
}
```

```jsonc
// package.nls.json  (英文 — 默认)
{
  "extension.displayName": "SFTP Extension",
  "extension.description": "SFTP/FTP extension",
  "commands.category": "SFTP",
  "commands.sftp.config.title": "Config",
  "commands.sftp.upload.file.title": "Upload File",
  // ...
}
```

```jsonc
// package.nls.zh-cn.json  (中文)
{
  "extension.displayName": "SFTP 扩展",
  "extension.description": "SFTP/FTP 文件传输扩展",
  "commands.category": "SFTP",
  "commands.sftp.config.title": "配置",
  "commands.sftp.upload.file.title": "上传文件",
  // ...
}
```

### 2.3 TypeScript 源码层 — `@vscode/l10n`

安装 `@vscode/l10n` 后，在源码中用 `l10n.t()` 包装所有用户可见字符串：

```ts
import * as l10n from '@vscode/l10n';

// 之前
showInformationMessage('No Available Profile.');

// 之后
showInformationMessage(l10n.t('No Available Profile.'));

// 带占位符 — 用 {0} {1}，不是 ${}
showInformationMessage(
  l10n.t("Are you sure you want to delete '{0}'?", filename),
  l10n.t('Delete')
);
```

对应的 `bundle.l10n.json`：

```jsonc
// l10n/bundle.l10n.json
{
  "No Available Profile.": "No Available Profile.",
  "Are you sure you want to delete '{0}'?": "Are you sure you want to delete '{0}'?",
  "Delete": "Delete",
  "Detail": "Detail",
  // ...
}
```

```jsonc
// l10n/bundle.l10n.zh-cn.json
{
  "No Available Profile.": "没有可用的连接配置。",
  "Are you sure you want to delete '{0}'?": "确定要删除 '{0}' 吗？",
  "Delete": "删除",
  "Detail": "详情",
  // ...
}
```

### 2.4 关键约束

| 约束 | 说明 |
|---|---|
| **l10n.t() 是运行时调用** | `@vscode/l10n` 运行时根据 VS Code 语言设置自动加载正确的 bundle |
| **bundle.l10n.json 的 key 必须是英文** | key 就是英文原文，翻译文件提供中文值。webpack 打包时会把 key 内联到 bundle |
| **package.nls.json 的 key 是结构化的** | 推荐点号路径，如 `commands.sftp.upload.file.title` |
| **webpack 需要处理 l10n bundle** | 添加 `vscode-nls-dev` 或 webpack 插件，确保 bundle 文件被复制到最终产物 |
| **占位符用 `{0}` `{1}`** | 不是 `${xxx}` 或 `%s`，这是 `@vscode/l10n` 的标准格式 |
| **错误消息可能包含 server 返回值** | 用户只翻译"框架"部分，动态内容（如错误码、路径）原样保留 |

---

## 3. 实施计划

### Phase 1: package.json 声明层本地化（风险低，可独立验证）

1. 创建 `package.nls.json` 和 `package.nls.zh-cn.json`，覆盖上面 A 类清单（44 处）
2. 修改 `package.json` 中的硬编码字符串为 `%key%`
3. 在 VS Code 中 `F5` 运行扩展，切换语言验证：
   - 设置 `display.language: zh-cn`
   - 打开命令面板，确认命令标题为中文
   - 打开设置，确认 sftp 配置项描述为中文
   - 查看侧边栏，确认 Explorer 标题为中文
4. `npm run compile` 应不受影响（因为 webpack 不处理 package.json）

### Phase 2: TypeScript 运行时层本地化

1. `npm install @vscode/l10n --save`
2. 创建 `l10n/bundle.l10n.json` 和 `l10n/bundle.l10n.zh-cn.json`，覆盖上面 B 类清单（28 处）
3. **逐文件**替换硬编码字符串：
   - `showInformationMessage(l10n.t('...'))`
   - `showQuickPick(items, { placeHolder: l10n.t('...') })`
   - `showInputBox({ prompt: l10n.t('...') })`
   - `throw new Error(l10n.t('...'))`
4. 修改 `webpack.config.js`：
   - 增加 `NormalModuleReplacementPlugin` 把 `@vscode/l10n` 替换为 runtime shim（因为 VS Code 宿主自带 l10n API）
   - 确保 `l10n/` 目录被复制到 dist/ 旁
   - 或者用官方推荐的 `vscode-nls-dev` + webpack 插件
5. `npm run compile` + 手工验证：
   - Set Profile → 空 profile 提示中文
   - Delete → 确认对话框中文
   - Create File/Folder → prompt 中文
   - 连接密码输入 → prompt 中文

### Phase 3: 构建与打包集成

1. `package.json` 增加 `l10n: "./l10n"` 属性，告知 vsce bundle 位置
2. 修改 `.vscodeignore` 确保 `l10n/` 目录被包含进 VSIX
3. 确认 `vsce package` 时 `package.nls.*.json` 和 `l10n/bundle.l10n.*.json` 都被打包
4. 验证最终 VSIX：解压后检查两种语言的 JSON 文件都在

### Phase 4: 后续扩展（本次不实施）

- 用 `@vscode/l10n-dev` 或 `vscode-nls-dev` 做字符串提取（目前手工维护足够）
- 加入日文 (ja)、繁体中文 (zh-tw)、韩文 (ko)
- 加入 Crowdin / POEditor 集成做社区翻译
- 接入 VS Code Marketplace Translation 贡献计划

---

## 4. 各文件具体改动示例

### 4.1 `package.nls.json`（新建）

```json
{
  "extension.displayName": "SFTP Extension",
  "extension.description": "SFTP/FTP extension",
  "views.activitybar.title": "SFTP",
  "views.remoteExplorer.name": "Explorer",

  "config.title": "sftp configuration",
  "config.printDebugLog.desc": "print debug log on sftp output channel.(reload vscode when change this)",
  "config.downloadWhenOpen.desc": "\"Download\" instead of \"View Content\" when open file in Remote Explorer",

  "commands.category": "SFTP",

  "commands.sftp.config.title": "Config",
  "commands.sftp.setProfile.title": "Set Profile",
  "commands.sftp.openConnectInTerminal.title": "Open SSH in Terminal",
  "commands.sftp.cancelAllTransfer.title": "Cancel All Transfers",

  "commands.sftp.upload.file.title": "Upload File",
  "commands.sftp.upload.changedFiles.title": "Upload Changed Files",
  "commands.sftp.upload.activeFile.title": "Upload Active File",
  "commands.sftp.upload.folder.title": "Upload Folder",
  "commands.sftp.upload.activeFolder.title": "Upload Active Folder",
  "commands.sftp.upload.project.title": "Upload Project",
  "commands.sftp.forceUpload.title": "Force Upload",
  "commands.sftp.upload.file.to.allProfiles.title": "Upload File To All Profiles",
  "commands.sftp.upload.activeFile.to.allProfiles.title": "Upload Active File To All Profiles",
  "commands.sftp.upload.folder.to.allProfiles.title": "Upload Folder To All Profiles",
  "commands.sftp.upload.activeFolder.to.allProfiles.title": "Upload Active Folder To All Profiles",
  "commands.sftp.upload.project.to.allProfiles.title": "Upload Project To All Profiles",
  "commands.sftp.forceUpload.to.allProfiles.title": "Force Upload To All Profiles",

  "commands.sftp.download.file.title": "Download File",
  "commands.sftp.download.activeFile.title": "Download Active File",
  "commands.sftp.download.folder.title": "Download Folder",
  "commands.sftp.download.activeFolder.title": "Download Active Folder",
  "commands.sftp.download.project.title": "Download Project",
  "commands.sftp.forceDownload.title": "Force Download",

  "commands.sftp.sync.localToRemote.title": "Sync Local -> Remote",
  "commands.sftp.sync.remoteToLocal.title": "Sync Remote -> Local",
  "commands.sftp.sync.bothDirections.title": "Sync Both Directions",

  "commands.sftp.diff.title": "Diff with Remote",
  "commands.sftp.diff.activeFile.title": "Diff Active File with Remote",

  "commands.sftp.list.title": "List",
  "commands.sftp.listActiveFolder.title": "List Active Folder",
  "commands.sftp.listAll.title": "List All",

  "commands.sftp.delete.remote.title": "Delete",
  "commands.sftp.create.folder.title": "Create Folder",
  "commands.sftp.create.file.title": "Create File",

  "commands.sftp.revealInExplorer.title": "Reveal in Explorer",
  "commands.sftp.revealInRemoteExplorer.title": "Reveal in Remote Explorer",
  "commands.sftp.remoteExplorer.editInLocal.title": "Edit in Local",
  "commands.sftp.viewContent.title": "View Content",
  "commands.sftp.remoteExplorer.refresh.title": "Refresh",
  "commands.sftp.remoteExplorer.refreshActiveFile.title": "Refresh Active Remote File"
}
```

### 4.2 `package.nls.zh-cn.json`（新建）

```json
{
  "extension.displayName": "SFTP 扩展",
  "extension.description": "SFTP/FTP 文件传输扩展",
  "views.activitybar.title": "SFTP",
  "views.remoteExplorer.name": "资源管理器",

  "config.title": "SFTP 配置",
  "config.printDebugLog.desc": "在 SFTP 输出频道打印调试日志（修改后请重启 VS Code）",
  "config.downloadWhenOpen.desc": "在远程资源管理器打开文件时下载文件而非查看内容",

  "commands.category": "SFTP",

  "commands.sftp.config.title": "配置",
  "commands.sftp.setProfile.title": "设置连接配置",
  "commands.sftp.openConnectInTerminal.title": "在终端中打开 SSH 连接",
  "commands.sftp.cancelAllTransfer.title": "取消所有传输",

  "commands.sftp.upload.file.title": "上传文件",
  "commands.sftp.upload.changedFiles.title": "上传已修改的文件",
  "commands.sftp.upload.activeFile.title": "上传当前文件",
  "commands.sftp.upload.folder.title": "上传文件夹",
  "commands.sftp.upload.activeFolder.title": "上传当前文件夹",
  "commands.sftp.upload.project.title": "上传项目",
  "commands.sftp.forceUpload.title": "强制上传",
  "commands.sftp.upload.file.to.allProfiles.title": "上传文件到所有连接配置",
  "commands.sftp.upload.activeFile.to.allProfiles.title": "上传当前文件到所有连接配置",
  "commands.sftp.upload.folder.to.allProfiles.title": "上传文件夹到所有连接配置",
  "commands.sftp.upload.activeFolder.to.allProfiles.title": "上传当前文件夹到所有连接配置",
  "commands.sftp.upload.project.to.allProfiles.title": "上传项目到所有连接配置",
  "commands.sftp.forceUpload.to.allProfiles.title": "强制上传到所有连接配置",

  "commands.sftp.download.file.title": "下载文件",
  "commands.sftp.download.activeFile.title": "下载当前文件",
  "commands.sftp.download.folder.title": "下载文件夹",
  "commands.sftp.download.activeFolder.title": "下载当前文件夹",
  "commands.sftp.download.project.title": "下载项目",
  "commands.sftp.forceDownload.title": "强制下载",

  "commands.sftp.sync.localToRemote.title": "同步 本地 → 远程",
  "commands.sftp.sync.remoteToLocal.title": "同步 远程 → 本地",
  "commands.sftp.sync.bothDirections.title": "双向同步",

  "commands.sftp.diff.title": "与远程对比",
  "commands.sftp.diff.activeFile.title": "当前文件与远程对比",

  "commands.sftp.list.title": "列出远程文件",
  "commands.sftp.listActiveFolder.title": "列出当前文件夹的远程文件",
  "commands.sftp.listAll.title": "列出所有远程文件",

  "commands.sftp.delete.remote.title": "删除",
  "commands.sftp.create.folder.title": "创建文件夹",
  "commands.sftp.create.file.title": "创建文件",

  "commands.sftp.revealInExplorer.title": "在资源管理器中显示",
  "commands.sftp.revealInRemoteExplorer.title": "在远程资源管理器中显示",
  "commands.sftp.remoteExplorer.editInLocal.title": "在本地编辑",
  "commands.sftp.viewContent.title": "查看内容",
  "commands.sftp.remoteExplorer.refresh.title": "刷新",
  "commands.sftp.remoteExplorer.refreshActiveFile.title": "刷新远程文件"
}
```

### 4.3 `l10n/bundle.l10n.json`（新建）

```json
{
  // 消息提示
  "No Available Profile.": "No Available Profile.",
  "Are you sure you want to upload to all profiles?": "Are you sure you want to upload to all profiles?",
  "Are you sure you want to delete '{0}'?": "Are you sure you want to delete '{0}'?",
  "Can't create file becase file already exist": "Can't create file becase file already exist",
  "[{0}]: Enter your password": "[{0}]: Enter your password",
  "Detail": "Detail",
  "Do you want SFTP to download this file?": "Do you want SFTP to download this file?",
  "View Remote Resource": "View Remote Resource",

  // prompt / placeholder
  "Please input file name": "Please input file name",
  "Please input folder name": "Please input folder name",
  "select a profile": "select a profile",
  "Select a folder...": "Select a folder...",
  "Choose a repository": "Choose a repository",
  "Select a target...": "Select a target...",

  // 按钮标签
  "Yes": "Yes",
  "No": "No",
  "Delete": "Delete",

  // Config 初始化
  "SFTP expects to work at a folder.": "SFTP expects to work at a folder.",
  "Open Folder": "Open Folder",
  "There are no available folders in current workspace.": "There are no available folders in current workspace.",
  "Add Folder to Workspace": "Add Folder to Workspace",

  // 状态标签
  "{0} (active)": "{0} (active)",
  "UNSET": "UNSET",

  // Error 消息
  "Can't not find remote \"{0}\"": "Can't not find remote \"{0}\"",
  "Environment variable \"{0}\" not found": "Environment variable \"{0}\" not found",
  "Timeout while connecting to server": "Timeout while connecting to server",
  "No client or clientOption is provided": "No client or clientOption is provided",
  "Config Not Found. ({0})": "Config Not Found. ({0})"
}
```

### 4.4 `l10n/bundle.l10n.zh-cn.json`（新建）

```json
{
  "No Available Profile.": "没有可用的连接配置。",
  "Are you sure you want to upload to all profiles?": "确定要上传到所有连接配置吗？",
  "Are you sure you want to delete '{0}'?": "确定要删除 '{0}' 吗？",
  "Can't create file becase file already exist": "无法创建文件，文件已存在",
  "[{0}]: Enter your password": "[{0}]：请输入密码",
  "Detail": "详情",
  "Do you want SFTP to download this file?": "是否下载此文件？",
  "View Remote Resource": "查看远程资源",

  "Please input file name": "请输入文件名",
  "Please input folder name": "请输入文件夹名",
  "select a profile": "请选择连接配置",
  "Select a folder...": "选择文件夹...",
  "Choose a repository": "选择一个仓库",
  "Select a target...": "选择目标...",

  "Yes": "是",
  "No": "否",
  "Delete": "删除",

  "SFTP expects to work at a folder.": "SFTP 需要在文件夹中工作。",
  "Open Folder": "打开文件夹",
  "There are no available folders in current workspace.": "当前工作区没有可用的文件夹。",
  "Add Folder to Workspace": "向工作区添加文件夹",

  "{0} (active)": "{0} (当前使用)",
  "UNSET": "未设置",

  "Can't not find remote \"{0}\"": "找不到 remote \"{0}\" 配置",
  "Environment variable \"{0}\" not found": "找不到环境变量 \"{0}\"",
  "Timeout while connecting to server": "连接服务器超时",
  "No client or clientOption is provided": "未提供客户端或客户端配置",
  "Config Not Found. ({0})": "找不到配置。({0})"
}
```

### 4.5 源码改动示例

**Before — `src/commands/commandSetProfile.ts`**
```ts
showInformationMessage('No Available Profile.');
const item = await vscode.window.showQuickPick(profiles, { placeHolder: 'select a profile' });
```

**After**
```ts
import * as l10n from '@vscode/l10n';
// ...
showInformationMessage(l10n.t('No Available Profile.'));
const item = await vscode.window.showQuickPick(profiles, { placeHolder: l10n.t('select a profile') });
```

**Before — `src/commands/fileCommandDeleteRemote.ts`**
```ts
window.showInformationMessage(
  `Are you sure you want to delete '${filename}'?`,
  'Delete'
);
```

**After**
```ts
import * as l10n from '@vscode/l10n';
// ...
window.showInformationMessage(
  l10n.t("Are you sure you want to delete '{0}'?", filename),
  l10n.t('Delete')
);
```

### 4.6 `webpack.config.js` 改动要点

```js
// 需要确保：
// 1. @vscode/l10n 不需要打包（VS Code 宿主已提供 l10n API）
externals: {
  vscode: 'commonjs vscode',
  ssh2: 'commonjs ssh2',
  '@vscode/l10n': 'commonjs @vscode/l10n',   // ← 新增
},
// 2. l10n/ 目录需要被复制到 VSIX
// (vsce package 会处理，但要确保 .vscodeignore 不排除 l10n/)
```

---

## 5. 验证清单

完成后在两个语言下分别验证：

| # | 验证项 | 操作 | 预期 (en) | 预期 (zh-cn) |
|---|---|---|---|---|
| 1 | 扩展名 | 扩展面板查看 | SFTP Extension | SFTP 扩展 |
| 2 | 命令面板标题 | `Ctrl+Shift+P` → 搜 SFTP | Config / Upload File... | 配置 / 上传文件... |
| 3 | 设置项描述 | VS Code Settings → sftp | English desc | 中文描述 |
| 4 | 侧边栏标题 | 活动栏 SFTP → Explorer | Explorer | 资源管理器 |
| 5 | Set Profile (无 profile) | 无 sftp.json 时执行 | No Available Profile. | 没有可用的连接配置。 |
| 6 | Set Profile (有 profile) | 选择 profile | (active) | (当前使用) |
| 7 | Create File prompt | 执行创建文件 | Please input file name | 请输入文件名 |
| 8 | Delete 确认 | 删除远程文件 | Are you sure...? / Delete | 确定要删除...？ / 删除 |
| 9 | Upload to all 确认 | 触发 all profiles | Are you sure...? / Yes / No | 确定要...吗？ / 是 / 否 |
| 10 | 连接密码 prompt | SSH 连接 | [host]: Enter your password | [host]：请输入密码 |
| 11 | Error → Detail | 触发错误提示 | Detail | 详情 |
| 12 | Output 频道 | 底部面板 → SFTP | SFTP | SFTP (保持) |

---

## 6. 风险与注意事项

| 风险 | 影响 | 应对 |
|---|---|---|
| **占位符格式**：`${name}` 是模板字符串，l10n 里要用 `{0}` | 翻译文件占位符对不上 | 统一在 `l10n.t()` 调用中传参，bundle key 里只出现 `{0}` |
| **bundle key 必须是英文原文** | 翻译文件缺少 key 时会 fallback 到 key 本身（英文） | 好处是"不会显示空"，坏处是漏翻译时用户看到英文 |
| **logger 里的字符串是否翻译** | 当前设计 **不翻译** logger 内部字符串（它们主要是 debug） | 如果未来要翻译，key 前缀加 `log.` |
| **Error 对象 message** | `new Error(message)` 里的 message 可能被 logger/用户看到 | 用 `l10n.t()` 包装 |
| **动态拼接的 UI 字符串** | 如 `` `${profile} (active)` `` | 改用 `l10n.t('{0} (active)', profile)` |
| **`@vscode/l10n` 运行时初始化** | 扩展 activate 之前 l10n 未就绪 | 初始化时间点在扩展启动前，VS Code 保证可用 |
| **`l10n/` 目录是否会被 webpack 打包进去** | webpack 只处理 `.ts`，JSON 不会被打包；vsce 需要单独发现它 | 在 `package.json` 加 `"l10n": "./l10n"` 属性 |

---

## 7. 改动规模估算

| 项 | 数量 | 说明 |
|---|---|---|
| 新建文件 | 4 | `package.nls.json`, `package.nls.zh-cn.json`, `l10n/bundle.l10n.json`, `l10n/bundle.l10n.zh-cn.json` |
| 修改 `package.json` | 1 | 所有硬编码 title/description 改为 `%key%`；加 `"l10n"` 属性 |
| 修改 TypeScript 源文件 | ~13 | 所有硬编码用户可见字符串 → `l10n.t()` |
| 新增依赖 | 1 | `@vscode/l10n` (运行时依赖，体积 < 2 KB) |
| 构建配置改动 | webpack.config.js 小改 | externals 加 `@vscode/l10n` |
| **总计** | **~20 个文件** | — |

---

## 附录：相关参考资料

- VS Code Extension Localization 官方文档：https://code.visualstudio.com/api/extension-guides/localization
- `@vscode/l10n` npm 包：https://www.npmjs.com/package/@vscode/l10n
- vscode-extension-samples l10n 示例：https://github.com/microsoft/vscode-extension-samples/tree/main/localization-sample
- vsce CLI l10n 选项：`vsce package --help`
