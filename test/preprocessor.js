const tsc = require('typescript');
const tsConfig = require('../tsconfig.json');

module.exports = {
  process(src, path) {
    if (path.endsWith('.ts') || path.endsWith('.tsx')) {
      const result = tsc.transpileModule(src, {
        compilerOptions: tsConfig.compilerOptions,
        fileName: path,
      });
      return { code: result.outputText, map: result.sourceMapText };
    }
    return { code: src };
  },
};
