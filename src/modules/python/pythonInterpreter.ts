import RemoteClient from '../../core/remote-client/remoteClient';

export interface RemotePython {
  path: string;
  version: string;
  majorMinor: string;
  hasDebugpy: boolean;
  isVirtualEnv: boolean;
}

/**
 * Discover all Python interpreters available on the remote host.
 * Uses ssh2.exec() for non-interactive probing.
 */
export class PythonInterpreterDiscovery {
  async discover(client: RemoteClient): Promise<RemotePython[]> {
    const results: RemotePython[] = [];

    // 1. PATH lookup: which -a python3 python python3.8 ... python3.12
    const whichCmd =
      'which -a python3 python python3.8 python3.9 python3.10 python3.11 python3.12 2>/dev/null || true';
    const { stdout: whichOut } = await client.exec(whichCmd);
    const paths = [...new Set(whichOut.split('\n').filter(Boolean))];

    // 2. Check each path
    for (const p of paths) {
      try {
        const info = await this.checkOne(client, p);
        if (info) results.push(info);
      } catch (e) {
        // ignore — one python might be broken, others might work
      }
    }

    // 3. conda environments
    try {
      const condaCmd = 'conda env list --json 2>/dev/null || true';
      const { stdout, exitCode } = await client.exec(condaCmd);
      if (exitCode === 0 && stdout.trim()) {
        const envs = JSON.parse(stdout);
        for (const [, path] of Object.entries<string>(envs.envs)) {
          const pyPath = `${path}/bin/python`;
          try {
            const info = await this.checkOne(client, pyPath);
            if (info && !results.some(r => r.path === info.path)) {
              results.push(info);
            }
          } catch (e) {}
        }
      }
    } catch (e) {
      // conda not installed — fine
    }

    // Sort by version desc (newest first)
    return results.sort((a, b) => b.majorMinor.localeCompare(a.majorMinor));
  }

  /** Check a single python path — runs a JSON-printing script. */
  private async checkOne(client: RemoteClient, path: string): Promise<RemotePython | null> {
    const cmd = `${path} -c "import sys, json, importlib.util; print(json.dumps({'version': sys.version.split()[0], 'majorMinor': '{}.{}'.format(sys.version_info.major, sys.version_info.minor), 'executable': sys.executable, 'prefix': sys.prefix, 'base_prefix': sys.base_prefix, 'has_debugpy': importlib.util.find_spec('debugpy') is not None}))" 2>/dev/null`;
    const { stdout, exitCode } = await client.exec(cmd);
    if (exitCode !== 0 || !stdout.trim()) return null;
    const info = JSON.parse(stdout);
    return {
      path,
      version: info.version,
      majorMinor: info.majorMinor,
      hasDebugpy: info.has_debugpy,
      isVirtualEnv: info.prefix !== info.base_prefix,
    };
  }

  /** Quick check: does this python have debugpy? */
  async checkDebugpy(client: RemoteClient, path: string): Promise<boolean> {
    const { exitCode } = await client.exec(`${path} -c "import debugpy" 2>/dev/null`);
    return exitCode === 0;
  }
}
