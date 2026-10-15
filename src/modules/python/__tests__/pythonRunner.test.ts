import { buildPythonCommand } from '../pythonRunner';

describe('pythonRunner.buildPythonCommand', () => {
  // C1: 基础命令
  test('C1 basic command', () => {
    const cmd = buildPythonCommand('/usr/bin/python3', '/home/user', 'main.py');
    expect(cmd).toBe('cd "/home/user" && "/usr/bin/python3" "main.py"');
  });

  // C2: 含 args
  test('C2 with args appended', () => {
    const cmd = buildPythonCommand('/py', '/d', 'f.py', '-v -x 1');
    expect(cmd).toBe('cd "/d" && "/py" "f.py" -v -x 1');
  });

  // C3: 路径含空格
  test('C3 paths with spaces are quoted', () => {
    const cmd = buildPythonCommand('/path/my python', '/home/my proj', 'my file.py');
    expect(cmd).toBe('cd "/home/my proj" && "/path/my python" "my file.py"');
  });

  // C4: 路径含双引号 → 转义
  test('C4 double quotes in paths are escaped', () => {
    const cmd = buildPythonCommand('/p"y', '/d"r', 'f.py');
    expect(cmd).toBe('cd "/d\\"r" && "/p\\"y" "f.py"');
  });

  // C5: args 前后空格 trim
  test('C5 args surrounding whitespace trimmed', () => {
    const cmd = buildPythonCommand('/py', '/d', 'f.py', '  -v  ');
    expect(cmd).toBe('cd "/d" && "/py" "f.py" -v');
  });
});
