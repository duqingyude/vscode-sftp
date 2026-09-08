# Security Policy

## Reporting a Vulnerability

The maintainers of this project take security seriously. If you believe you have found a security vulnerability in this extension, **please do not open a public issue** — report it privately so it can be addressed before disclosure.

### How to report

- **Email:** [khoazero123@live.com](mailto:khoazero123@live.com)
- **Subject prefix:** `[vscode-sftp SECURITY] <short description>`
- Alternatively, use **GitHub Private Vulnerability Reporting** on this repository: https://github.com/khoazero123/vscode-sftp/security/advisories

Please include in your report:

1. A description of the vulnerability and its potential impact.
2. Steps to reproduce it (configuration, commands, environment).
3. Affected version(s) of the extension.
4. Any proof-of-concept or suggested fix, if available.

### What happens next

- You will receive an acknowledgment of your report within **5 business days**.
- You will receive updates as the issue is triaged and fixed.
- Once a fix is released, the vulnerability will be disclosed responsibly after users have had a reasonable window to update.

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.16.x  | ✅ Currently maintained |
| < 1.16  | ❌ Use latest version |

## Security Considerations

This extension connects to remote servers over **FTP/FTPS/SFTP**. By design it handles credentials, private keys, and file transfers on your machine:

- **Credentials stay local.** Configuration is stored in your workspace's `.vscode/sftp.json` and is only used to connect to the servers you configure. Nothing is transmitted anywhere other than the configured remote server.
- **Keep permissions tight.** Ensure `sftp.json` and any private key files referenced by `privateKeyPath` are not committed to version control (see `.gitignore`) and have restrictive file permissions.
- **Use SFTP/SSH keys** over FTP where possible, and avoid storing plaintext passwords in shared or public repositories.
- **Keep the extension updated** — security fixes and dependency updates are shipped in new releases. Do not pin to ancient versions.

## Dependency Security

Dependencies are audited before releases (`npm audit`). If a high/critical advisory affects the runtime dependency tree, it is fixed before the next release or a patched release is published promptly.

## Responsible Disclosure

We follow a coordinated-disclosure approach: reporters get credit for their findings unless they request anonymity, and details are published only after a fix is available.
