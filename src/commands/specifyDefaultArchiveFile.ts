import { commands } from 'vscode';
import { specifyDefaultArchiveFile } from '../utils/extensionUtils';

export async function specifyDefaultArchiveFileCommand() {
	await specifyDefaultArchiveFile();
	await commands.executeCommand('list.focusDown');// Workaround for https://github.com/microsoft/vscode/issues/126782
}
