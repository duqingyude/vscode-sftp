import * as l10n from '@vscode/l10n';
import * as output from '../ui/output';
import logger from '../logger';
import { showErrorMessage } from '../host';

export function reportError(err: Error | string, ctx?: string) {
  let errorString: string;
  if (err instanceof Error) {
    errorString = err.message;
    logger.error(`${err.stack}`, ctx);
  } else {
    errorString = err;
    logger.error(errorString, ctx);
  }

  showErrorMessage(errorString, l10n.t('Detail')).then(result => {
    if (result === l10n.t('Detail')) {
      output.show();
    }
  });
  return;
}
