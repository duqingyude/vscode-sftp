import { SshPseudoTerminal } from '../sshPseudoTerminal';
import { createMockChannel, createMockClient } from '../../../../test/helper/mockSshClient';
import * as vscode from 'vscode';

/**
 * SshPseudoTerminal 的 client 参数直接走 ssh2 .shell()。
 * 我们用 createMockClient 造一个，然后手动驱动 channel 事件。
 */

function waitTick() {
  return new Promise(res => setImmediate(res));
}

describe('SshPseudoTerminal', () => {
  // 每个 case 都造一个 mock client，避免串味
  let mockChannel: any;
  let mockClient: any;

  beforeEach(() => {
    mockChannel = createMockChannel();
    mockClient = createMockClient({
      channelFactory: () => mockChannel,
    });
    // reset mockVscode 的 EventEmitter 历史
    jest.clearAllMocks();
  });

  // P1: open() 建立 shell + PTY 80x24
  test('P1 open requests shell with default 80x24 PTY', async () => {
    const pty = new SshPseudoTerminal(mockClient);
    pty.open(undefined);
    await waitTick();
    expect(mockClient.shell).toHaveBeenCalledWith(
      { cols: 80, rows: 24 }, expect.any(Function)
    );
  });

  // P2: open() 带 initialDimensions
  test('P2 open uses provided initialDimensions', async () => {
    const pty = new SshPseudoTerminal(mockClient);
    pty.open({ columns: 120, rows: 40 } as any);
    await waitTick();
    expect(mockClient.shell).toHaveBeenCalledWith(
      { cols: 120, rows: 40 }, expect.any(Function)
    );
  });

  // P3: open() 带 initialCommand → 写入 channel
  test('P3 open writes initial command to channel', async () => {
    const pty = new SshPseudoTerminal(mockClient, 'python main.py');
    pty.open(undefined);
    await waitTick();
    expect(mockChannel.write).toHaveBeenCalledWith('python main.py\n');
  });

  // P4: open() 时 shell 报错 → writeEmitter.fire + closeEmitter.fire(1)
  test('P4 open handles shell error by firing error text and close(1)', async () => {
    const errClient = createMockClient({ shellError: new Error('perm denied') });
    const pty: any = new SshPseudoTerminal(errClient);
    // 截获实例内部的 emitter
    const writeSpy = jest.fn();
    const closeSpy = jest.fn();
    // 在 open 之前替换
    Object.defineProperty(pty, 'writeEmitter', {
      value: { fire: writeSpy, dispose: jest.fn(), event: () => () => {} },
      writable: true,
    });
    Object.defineProperty(pty, 'closeEmitter', {
      value: { fire: closeSpy, dispose: jest.fn(), event: () => () => {} },
      writable: true,
    });

    pty.open(undefined);
    await waitTick();
    expect(writeSpy).toHaveBeenCalled();
    expect(writeSpy.mock.calls[0][0]).toMatch(/SSH Error/);
    expect(closeSpy).toHaveBeenCalledWith(1);
  });

  // P5: channel data → writeEmitter.fire
  test('P5 bridges channel "data" into writeEmitter', async () => {
    const pty: any = new SshPseudoTerminal(mockClient);
    const writeSpy = jest.fn();
    Object.defineProperty(pty, 'writeEmitter', {
      value: { fire: writeSpy, dispose: jest.fn(), event: () => () => {} },
      writable: true,
    });
    pty.open(undefined);
    await waitTick();
    mockChannel.emitData(Buffer.from('hello'));
    expect(writeSpy).toHaveBeenCalledWith('hello');
  });

  // P6: channel close → closeEmitter.fire
  test('P6 bridges channel "close" into closeEmitter', async () => {
    const pty: any = new SshPseudoTerminal(mockClient);
    const closeSpy = jest.fn();
    Object.defineProperty(pty, 'closeEmitter', {
      value: { fire: closeSpy, dispose: jest.fn(), event: () => () => {} },
      writable: true,
    });
    pty.open(undefined);
    await waitTick();
    mockChannel.emitClose(42);
    expect(closeSpy).toHaveBeenCalledWith(42);
  });

  // P7: handleInput → channel.write
  test('P7 handleInput forwards keystrokes to channel', async () => {
    const pty = new SshPseudoTerminal(mockClient);
    pty.open(undefined);
    await waitTick();
    pty.handleInput('ls -la\n');
    expect(mockChannel.write).toHaveBeenCalledWith('ls -la\n');
  });

  // P8: setDimensions → channel.setWindow
  test('P8 setDimensions calls channel.setWindow with 4 args', async () => {
    const pty = new SshPseudoTerminal(mockClient);
    pty.open(undefined);
    await waitTick();
    pty.setDimensions({ columns: 200, rows: 50 } as any);
    expect(mockChannel.setWindow).toHaveBeenCalledWith(200, 50, 480, 640);
  });

  // P9: close() 释放 channel + dispose emitters
  test('P9 close() ends channel and disposes emitters', async () => {
    const pty: any = new SshPseudoTerminal(mockClient);
    const writeDispose = jest.fn();
    const closeDispose = jest.fn();
    Object.defineProperty(pty, 'writeEmitter', {
      value: { fire: jest.fn(), dispose: writeDispose, event: () => () => {} },
      writable: true,
    });
    Object.defineProperty(pty, 'closeEmitter', {
      value: { fire: jest.fn(), dispose: closeDispose, event: () => () => {} },
      writable: true,
    });
    pty.open(undefined);
    await waitTick();
    pty.close();
    expect(mockChannel.end).toHaveBeenCalled();
    expect(writeDispose).toHaveBeenCalled();
    expect(closeDispose).toHaveBeenCalled();
  });

  // P10: 已关闭后 handleInput 不写入
  test('P10 handleInput is a no-op after close()', async () => {
    const pty = new SshPseudoTerminal(mockClient);
    pty.open(undefined);
    await waitTick();
    pty.close();
    pty.handleInput('should not write');
    expect(mockChannel.write).not.toHaveBeenCalledWith('should not write');
  });
});
