/**
 * Minimal mock of ssh2 Client for unit testing sshClient.
 * Provides mock exec/shell/forwardOut that we can drive from tests.
 */

export function createMockChannel(stdoutBuf: Buffer = Buffer.from(''), stderrBuf: Buffer = Buffer.from('')) {
  const handlers: Record<string, Array<(...args: any[]) => void>> = {};
  const channel = {
    _handlers: handlers,
    on: jest.fn((event: string, cb: (...args: any[]) => void) => {
      if (!handlers[event]) handlers[event] = [];
      handlers[event].push(cb);
      return channel;
    }),
    write: jest.fn(),
    end: jest.fn(),
    setWindow: jest.fn(),
    stderr: {
      _handlers: {},
      on: jest.fn((event: string, cb: (...args: any[]) => void) => {
        if (!channel.stderr._handlers[event]) channel.stderr._handlers[event] = [];
        channel.stderr._handlers[event].push(cb);
        return channel.stderr;
      }),
    },
    // Helpers for tests
    emitData(buf: Buffer) {
      (handlers['data'] || []).forEach(cb => cb(buf));
    },
    emitStderrData(buf: Buffer) {
      (channel.stderr._handlers['data'] || []).forEach(cb => cb(buf));
    },
    emitClose(code: number | null) {
      (handlers['close'] || []).forEach(cb => cb(code));
    },
    _stdoutBuf: stdoutBuf,
    _stderrBuf: stderrBuf,
  };
  return channel;
}

export function createMockStream() {
  return { end: jest.fn(), on: jest.fn() };
}

export function createMockClient(overrides: Record<string, any> = {}) {
  // Each call to exec/shell returns a fresh channel
  let channelFactory = overrides.channelFactory || (() => createMockChannel());
  let streamFactory = overrides.streamFactory || (() => createMockStream());

  const client: any = {
    exec: jest.fn((_cmd: string, cb: (err: any, channel: any) => void) => {
      if (overrides.execError) { cb(overrides.execError, null); return; }
      const ch = channelFactory();
      // Auto-emit stdout/stderr/close so the Promise in sshClient.exec resolves
      setTimeout(() => {
        ch.emitData(ch._stdoutBuf);
        ch.emitStderrData(ch._stderrBuf);
        ch.emitClose(overrides.exitCode ?? 0);
      }, 0);
      cb(null, ch);
    }),

    shell: jest.fn((_pty: any, cb: (err: any, channel: any) => void) => {
      if (overrides.shellError) { cb(overrides.shellError, null); return; }
      cb(null, channelFactory());
    }),

    forwardOut: jest.fn((_lh: string, _lp: number, _rh: string, _rp: number, cb: (err: any, stream: any) => void) => {
      if (overrides.forwardOutError) { cb(overrides.forwardOutError, null); return; }
      cb(null, streamFactory());
    }),

    on: jest.fn(),
    ...overrides,
  };
  return client;
}
