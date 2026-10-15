import * as vscode from 'vscode';
import type { GitExtension, API, Status, Change, Repository } from './git';

let git: API;

export type { API as GitAPI, Repository, Status, Change };

export function getGitService(): API {
  const gitExtension = vscode.extensions.getExtension<GitExtension>('vscode.git')!.exports;

  git = gitExtension.getAPI(1);
  return git;
}
