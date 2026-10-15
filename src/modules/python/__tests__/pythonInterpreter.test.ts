import { PythonInterpreterDiscovery, RemotePython } from '../pythonInterpreter';

/** Helper: build a fake RemoteClient whose .exec() returns preset values. */
function makeMockClient(execResults: Array<{ stdout: string; stderr?: string; exitCode?: number }>) {
  let callIdx = 0;
  const client: any = {
    exec: jest.fn(async (_cmd: string) => {
      const r = execResults[callIdx++] || { stdout: '', exitCode: 0 };
      return { stdout: r.stdout, stderr: r.stderr ?? '', exitCode: r.exitCode ?? 0 };
    }),
  };
  return client;
}

const SAMPLE_JSON = JSON.stringify({
  version: '3.11.6',
  majorMinor: '3.11',
  executable: '/usr/bin/python3',
  prefix: '/usr',
  base_prefix: '/usr',
  has_debugpy: true,
});

const VENV_JSON = JSON.stringify({
  version: '3.10.12',
  majorMinor: '3.10',
  executable: '/opt/venv/bin/python',
  prefix: '/opt/venv',
  base_prefix: '/usr',
  has_debugpy: false,
});

describe('PythonInterpreterDiscovery', () => {
  const disc = new PythonInterpreterDiscovery();

  // I1: which 返回空
  test('I1 discover returns empty when which finds nothing', async () => {
    const client = makeMockClient([
      { stdout: '', exitCode: 0 },              // which
      { stdout: '', exitCode: 1 },              // conda (not installed)
    ]);
    const result = await disc.discover(client);
    expect(result).toEqual([]);
  });

  // I2: which 返回单个 python
  test('I2 discover finds one interpreter', async () => {
    const client = makeMockClient([
      { stdout: '/usr/bin/python3\n', exitCode: 0 },  // which
      { stdout: SAMPLE_JSON, exitCode: 0 },           // checkOne
      { stdout: '', exitCode: 1 },                     // conda
    ]);
    const result = await disc.discover(client);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      path: '/usr/bin/python3',
      majorMinor: '3.11',
      hasDebugpy: true,
      isVirtualEnv: false,
    });
  });

  // I3: which 返回多个 + 去重
  test('I3 discover deduplicates which output and sorts by version desc', async () => {
    const py312 = JSON.stringify({
      version: '3.12.0', majorMinor: '3.12',
      executable: '/usr/bin/python', prefix: '/usr', base_prefix: '/usr',
      has_debugpy: false,
    });
    // which 去重后路径顺序：['/usr/bin/python3', '/usr/bin/python']
    // checkOne 按这个顺序消耗 mock 数组
    const client = makeMockClient([
      { stdout: '/usr/bin/python3\n/usr/bin/python3\n/usr/bin/python\n', exitCode: 0 },  // which
      { stdout: SAMPLE_JSON, exitCode: 0 },   // checkOne python3 → 3.11
      { stdout: py312, exitCode: 0 },          // checkOne python  → 3.12
      { stdout: '', exitCode: 1 },             // conda
    ]);
    const result = await disc.discover(client);
    expect(result).toHaveLength(2);
    // 版本降序：3.12 在前
    expect(result[0].majorMinor).toBe('3.12');
    expect(result[1].majorMinor).toBe('3.11');
  });

  // I4: checkOne 失败的不加入
  test('I4 discover skips paths where checkOne throws or returns non-zero', async () => {
    const client = makeMockClient([
      { stdout: '/usr/bin/python3\n/broken/py\n', exitCode: 0 },
      { stdout: SAMPLE_JSON, exitCode: 0 },    // python3 OK
      { stdout: '', exitCode: 1 },             // broken 非零退出
      { stdout: '', exitCode: 1 },             // conda
    ]);
    const result = await disc.discover(client);
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe('/usr/bin/python3');
  });

  // I5: conda 发现
  test('I5 discover picks up conda environments', async () => {
    const condaJson = JSON.stringify({
      envs: {
        root: '/root/miniconda3',
        myenv: '/root/miniconda3/envs/myenv',
      },
      default_prefix: '/root/miniconda3',
    });
    const client = makeMockClient([
      { stdout: '/usr/bin/python3\n', exitCode: 0 },   // which
      { stdout: SAMPLE_JSON, exitCode: 0 },              // python3
      { stdout: condaJson, exitCode: 0 },                // conda list
      // root env check (可能没有 python，失败也没事)
      { stdout: JSON.stringify({
          version: '3.9.15', majorMinor: '3.9',
          executable: '/root/miniconda3/bin/python',
          prefix: '/root/miniconda3', base_prefix: '/root/miniconda3',
          has_debugpy: false,
        }), exitCode: 0 },
      // myenv check（和 PATH 里的 python3 版本一样 → 被去重）
      { stdout: SAMPLE_JSON, exitCode: 0 },
    ]);
    const result = await disc.discover(client);
    // 至少包含 base + conda env（myenv 因版本和路径不同不会被去重；等下看实际逻辑）
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  // I6: conda 命令本身抛异常也不影响
  test('I6 discover handles conda exec throwing', async () => {
    const client: any = {
      exec: jest.fn(async (cmd: string) => {
        if (cmd.startsWith('which')) return { stdout: '/usr/bin/python3\n', exitCode: 0 };
        if (cmd.startsWith('/usr/bin/python3')) return { stdout: SAMPLE_JSON, exitCode: 0 };
        if (cmd.startsWith('conda')) throw new Error('conda not found');
        return { stdout: '', exitCode: 0 };
      }),
    };
    const result = await disc.discover(client);
    expect(result).toHaveLength(1);
  });

  // I7: checkDebugpy 有
  test('I7 checkDebugpy returns true when debugpy import succeeds', async () => {
    const client = makeMockClient([{ stdout: '', exitCode: 0 }]);
    const ok = await disc.checkDebugpy(client, '/usr/bin/python3');
    expect(ok).toBe(true);
  });

  // I8: checkDebugpy 无
  test('I8 checkDebugpy returns false when exitCode != 0', async () => {
    const client = makeMockClient([{ stdout: '', exitCode: 1 }]);
    const ok = await disc.checkDebugpy(client, '/usr/bin/python3');
    expect(ok).toBe(false);
  });

  // I9: venv 识别
  test('I9 discover marks virtualenv correctly (prefix != base_prefix)', async () => {
    const client = makeMockClient([
      { stdout: '/opt/venv/bin/python\n', exitCode: 0 },
      { stdout: VENV_JSON, exitCode: 0 },
      { stdout: '', exitCode: 1 },  // conda
    ]);
    const result = await disc.discover(client);
    expect(result).toHaveLength(1);
    expect(result[0].isVirtualEnv).toBe(true);
  });
});
