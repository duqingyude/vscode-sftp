import SSHClient from '../sshClient';
import { createMockClient, createMockChannel } from '../../../../test/helper/mockSshClient';

/**
 * sshClient.ts 里 _initClient() 返回 new Client() from 'ssh2'。
 * 我们直接 new SSHClient({...}) 后覆盖 ._client 来测试 exec/shell/forwardOut。
 */
function makeSshClient(mockClient: any): SSHClient {
  // 用一个假的 option；SSHClient 构造只用到 _initClient()
  const sc: any = new SSHClient({ host: 'h', port: 22, debug: () => {} } as any);
  sc._client = mockClient;
  return sc as SSHClient;
}

// 让 fake timers 正确处理 setTimeout
beforeEach(() => {
  jest.useRealTimers();
});

describe('SSHClient.exec', () => {
  // E1: 正常 stdout
  test('E1 exec collects stdout and resolves on close', async () => {
    const mock = createMockClient({
      channelFactory: () => createMockChannel(Buffer.from('hello world\n'), Buffer.from('')),
    });
    const ssh = makeSshClient(mock);
    const result = await ssh.exec('echo hello');
    expect(mock.exec).toHaveBeenCalledWith('echo hello', expect.any(Function));
    expect(result.stdout).toBe('hello world\n');
    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
  });

  // E2: 有 stderr
  test('E2 exec captures stderr separately', async () => {
    const mock = createMockClient({
      channelFactory: () => createMockChannel(Buffer.from('out'), Buffer.from('err')),
    });
    const ssh = makeSshClient(mock);
    const r = await ssh.exec('cmd');
    expect(r.stdout).toBe('out');
    expect(r.stderr).toBe('err');
  });

  // E3: 非零 exitCode
  test('E3 exec returns exitCode when non-zero', async () => {
    const mock = createMockClient({ exitCode: 2 });
    const ssh = makeSshClient(mock);
    const r = await ssh.exec('false');
    expect(r.exitCode).toBe(2);
  });

  // E4: exec 底层报错
  test('E4 exec rejects when ssh2.exec errors', async () => {
    const err = new Error('connect failed');
    const mock = createMockClient({ execError: err });
    const ssh = makeSshClient(mock);
    await expect(ssh.exec('cmd')).rejects.toThrow('connect failed');
  });

  // E5: null close code → 0
  test('E5 exec treats null close code as exitCode 0', async () => {
    const mock = createMockClient({ exitCode: null });
    const ssh = makeSshClient(mock);
    const r = await ssh.exec('cmd');
    expect(r.exitCode).toBe(0);
  });
});

describe('SSHClient.shell', () => {
  // S1: 正常 shell 返回 channel
  test('S1 shell resolves with a channel', async () => {
    const mock = createMockClient();
    const ssh = makeSshClient(mock);
    const ch = await ssh.shell();
    expect(mock.shell).toHaveBeenCalledWith({ cols: 80, rows: 24 }, expect.any(Function));
    expect(ch).toBeDefined();
    expect(typeof ch.write).toBe('function');
  });

  // S2: 带 initialCommand
  test('S2 shell writes initial command to channel', async () => {
    const mock = createMockClient();
    const ssh = makeSshClient(mock);
    const ch = await ssh.shell('python main.py');
    expect(ch.write).toHaveBeenCalledWith('python main.py\n');
  });

  // S3: 带 ptyOptions
  test('S3 shell uses custom cols/rows', async () => {
    const mock = createMockClient();
    const ssh = makeSshClient(mock);
    await ssh.shell(undefined, { cols: 120, rows: 40 });
    expect(mock.shell).toHaveBeenCalledWith({ cols: 120, rows: 40 }, expect.any(Function));
  });

  // S4: shell 报错
  test('S4 shell rejects when ssh2.shell errors', async () => {
    const mock = createMockClient({ shellError: new Error('shell fail') });
    const ssh = makeSshClient(mock);
    await expect(ssh.shell()).rejects.toThrow('shell fail');
  });
});

describe('SSHClient.forwardOut', () => {
  // F1: 正常
  test('F1 forwardOut resolves with a stream', async () => {
    const mock = createMockClient();
    const ssh = makeSshClient(mock);
    const st = await ssh.forwardOut('127.0.0.1', 5678, '127.0.0.1', 5678);
    expect(mock.forwardOut).toHaveBeenCalledWith(
      '127.0.0.1', 5678, '127.0.0.1', 5678, expect.any(Function)
    );
    expect(st).toBeDefined();
  });

  // F2: 报错
  test('F2 forwardOut rejects on error', async () => {
    const mock = createMockClient({ forwardOutError: new Error('forwards fail') });
    const ssh = makeSshClient(mock);
    await expect(ssh.forwardOut('a', 1, 'b', 2)).rejects.toThrow('forwards fail');
  });
});
