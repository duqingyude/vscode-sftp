# Privacy Policy

**Last updated:** 2026-09-08

## Summary

This extension does **not** collect, store, transmit, or sell any personal data. There is no telemetry, no analytics, no tracking, and no data leaves your machine except the traffic you explicitly configure (connections to your own remote servers).

## What this extension does

`vscode-sftp` (SFTP Extension) is a local development tool that lets you sync files between your local workspace and remote servers over FTP/FTPS/SFTP. All configuration lives in your workspace (`.vscode/sftp.json`) or your user settings.

## Data handled locally

| Data | Where it lives | Who can access it |
| ---- | -------------- | ----------------- |
| Server host, port, protocol | Local `sftp.json` / user settings | Only your local VS Code instance |
| Username, password, private key path, passphrase | Local `sftp.json` / user settings | Only your local VS Code instance |
| Files synced to/from remote servers | Your local workspace and your configured servers | Only you and the servers you configure |

## What is transmitted

- **Connections to servers you configure.** When you run a sync, upload, download, or browse operation, the extension connects to the exact host/port you specified in your configuration. No other network requests are made.
- **No third-party endpoints.** The extension does not phone home, does not call any analytics service, and does not contact any Microsoft, GitHub, or other third-party service at runtime.

## Private keys

If you use `privateKeyPath`, the key file is read from your local filesystem and used **only** to authenticate to the remote server you configured. It is never uploaded, logged, or transmitted anywhere else.

## Updates / Extension marketplace

When you install or update the extension from a marketplace (e.g. Open VSX, VS Code Marketplace, or Cursor), the marketplace client may send standard installation metadata (extension ID, version, machine identifier) to that marketplace service. This is handled by the marketplace client itself and is outside this extension's control. The extension code itself performs no network communication other than to your configured servers.

## Children's privacy

This extension is a developer tool and is not directed at children under 13 (or the applicable age of consent in your jurisdiction). It does not knowingly collect any personal information from anyone, including children.

## Changes to this policy

If this policy changes, the new version will be published here and the version number bumped in the extension changelog.

## Contact

Questions about this policy: [khoazero123@live.com](mailto:khoazero123@live.com) or via GitHub issues on https://github.com/khoazero123/vscode-sftp.
