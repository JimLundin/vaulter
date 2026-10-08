// The editor's routes: a file as text, a rename, the staged changes and what the app committed.
import { pattern } from '../../shell/route.ts';

export const editPage = pattern('/edit/:file/');
export const renamePage = pattern('/rename/:file/');
export const changesPage = pattern('/changes/');
export const historyPage = pattern('/history/');
