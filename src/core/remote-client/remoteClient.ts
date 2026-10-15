import * as l10n from '@vscode/l10n';
import CustomError from '../customError';

export interface ConnectOption {
  // common
  host: string;
  port: number;
  username?: string;
  password?: string;
  connectTimeout?: number;
  debug(x: string): void;

  // ssh-only
  privateKeyPath?: string;
  privateKey?: string;
  passphrase?: string | boolean;
  interactiveAuth?: boolean | string[];
  agent?: string;
  sock?: any;
  hop?: ConnectOption | ConnectOption[];
  jump?: ConnectOption | ConnectOption[];
  jumps?: ConnectOption[];
  limitOpenFilesOnRemote?: boolean | number;

  // ftp-only
  secure?: any;
  secureOptions?: object;
  passive?: boolean;
}

export enum ErrorCode {
  CONNECT_CANCELLED,
}

export interface Config {
  askForPasswd(msg: string): Promise<string | undefined>;
}

export default abstract class RemoteClient {
  protected _client: any;
  protected _option: ConnectOption;

  constructor(option: ConnectOption) {
    this._option = option;
    this._client = this._initClient();
  }

  abstract end(): void;
  abstract getFsClient(): any;
  protected abstract _doConnect(connectOption: ConnectOption, config: Config): Promise<void>;
  protected abstract _hasProvideAuth(connectOption: ConnectOption): boolean;
  protected abstract _initClient(): any;

  /**
   * 非交互式执行远程命令（解释器发现、debugpy 检查/启动/kill）
   * 默认抛错 —— FTP 协议不支持。SSH 客户端 override。
   */
  exec(_command: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    throw new Error('exec() is only available for SFTP/SSH protocol');
  }

  /**
   * 交互式 shell（PTY）。用于：交互运行 Python、Open SSH Shell。
   * 默认抛错 —— FTP 协议不支持。SSH 客户端 override。
   */
  shell(_initialCommand?: string, _ptyOptions?: { cols: number; rows: number }): Promise<any> {
    throw new Error('shell() is only available for SFTP/SSH protocol');
  }

  /**
   * 本地 → 远程 TCP 端口转发（debugpy attach 用）。
   * 默认抛错 —— FTP 协议不支持。SSH 客户端 override。
   */
  forwardOut(
    _localHost: string, _localPort: number,
    _remoteHost: string, _remotePort: number
  ): Promise<any> {
    throw new Error('forwardOut() is only available for SFTP/SSH protocol');
  }

  async connect(connectOption: ConnectOption, config: Config) {
    if (this._hasProvideAuth(connectOption)) {
      return this._doConnect(connectOption, config);
    }

    const password = await config.askForPasswd(l10n.t('[{0}]: Enter your password', connectOption.host));

    // cancel connect
    if (password === undefined) {
      throw new CustomError(ErrorCode.CONNECT_CANCELLED, 'cancelled');
    }

    return this._doConnect({ ...connectOption, password }, config);
  }

  onDisconnected(cb) {
    this._client
      .on('end', () => {
        cb('end');
      })
      .on('close', () => {
        cb('close');
      })
      .on('error', err => {
        cb('error');
      });
  }
}
