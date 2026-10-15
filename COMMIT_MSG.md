feat: add full English + Chinese bilingual i18n support (v1.17.0)

Add complete VS Code native localization so the extension UI follows the
user's VS Code display.language setting. English is the default fallback,
Chinese Simplified (zh-cn) translations are provided for every user-facing
string.

## What was localized

### package.json declaration layer (46 keys in package.nls.json)
- displayName, description
- viewsContainers.activitybar.title
- views.remoteExplorer.name
- configuration.title + 3 config property descriptions
- ALL 34 command titles and categories

### TypeScript runtime layer (30 keys in l10n/bundle.l10n.json)
Translated at 34 call sites across 18 source files:
- showInformationMessage / showWarningMessage / showErrorMessage
- showQuickPick placeHolder / showInputBox prompt
- showConfirmMessage Yes/No labels
- throw new Error(...) user-visible error messages
- Tree view item titles and labels

## How it works

- package.json uses %key% syntax → VS Code loads package.nls.*.json
  based on display.language at extension discovery time.
- TypeScript source uses @vscode/l10n → l10n.t('English source string')
  at runtime, with {0} style positional placeholders (NOT ${var}).
- Two files control all runtime strings:
  l10n/bundle.l10n.json        English default (key == value)
  l10n/bundle.l10n.zh-cn.json  Chinese translations

## Files changed

New:
  package.nls.json
  package.nls.zh-cn.json
  l10n/bundle.l10n.json
  l10n/bundle.l10n.zh-cn.json
  docs/I18N_DESIGN.md

Modified:
  package.json            version 1.16.9 → 1.17.0, %key% syntax, "l10n": "./l10n"
  package-lock.json       added @vscode/l10n runtime dep
  webpack.config.js       externals: '@vscode/l10n': 'commonjs @vscode/l10n'
  .vscodeignore           added nls + l10n whitelist
  18 src/**/*.ts          import * as l10n from '@vscode/l10n' + l10n.t() wrapping

## Build verification
  npm run compile         → webpack 5.111.1 compiled successfully
  vsce package            → sftp-extension-1.17.0.vsix, 837 files, 6.02 MB

## Usage
VS Code picks zh-cn automatically when display.language is set to zh-cn.
No code change needed — just switch language in VS Code settings and
reload the window.
