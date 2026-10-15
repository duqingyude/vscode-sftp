import app from '../../app';

const STORAGE_KEY = 'sftp.python.config';

export interface PythonEntry {
  path: string;
  version?: string;
  args?: string;
  cwd?: string;
}

interface PythonStorage {
  [profileKey: string]: PythonEntry;
}

function getStorage(): PythonStorage {
  const state = app.context.globalState.get<PythonStorage>(STORAGE_KEY);
  return state || {};
}

function setStorage(storage: PythonStorage): void {
  app.context.globalState.update(STORAGE_KEY, storage);
}

export function buildProfileKey(config: { host: string; port: number; username?: string; remotePath: string }): string {
  const username = config.username || '';
  return `${config.host}:${config.port}/${username}${config.remotePath}`;
}

export function getInterpreter(key: string): PythonEntry | undefined {
  return getStorage()[key];
}

export function setInterpreter(key: string, entry: PythonEntry): void {
  const storage = getStorage();
  storage[key] = entry;
  setStorage(storage);
}

export function clearInterpreter(key: string): void {
  const storage = getStorage();
  delete storage[key];
  setStorage(storage);
}
