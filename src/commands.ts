import { commands, window, workspace, Position, Range, TextEditor, TextDocument, TextLine } from 'vscode';
import * as vscode from 'vscode';
import { EXTENSION_NAME, state, FILTER_ACTIVE_CONTEXT_KEY, updateState, G, globalState } from './extension';
import { DueTreeItem } from './treeViewProviders/dueProvider';
import { config } from './extension';
import { appendTaskToFile } from './utils';
import { sortTasks, SortProperty } from './sort';
import { getFullRangeFromLines, openFileInEditor, insertSnippet } from './vscodeUtils';
import { filterItems } from './filter';
import { getDateInISOFormat } from './timeUtils';
import { taskProvider } from './treeViewProviders/treeViews';
import { Task } from './parse';

export function registerCommands() {
	commands.registerTextEditorCommand(`${EXTENSION_NAME}.toggleDone`, (editor, edit, treeItem?: DueTreeItem) => {
		const ln = treeItem ? treeItem.parsedLine.ln : editor.selection.active.line;
		const task = getTaskAtLine(ln);
		if (!task) {
			return;
		}
		const workspaceEdit = new vscode.WorkspaceEdit();
		if (task.count) {
			const charIndexWithOffset = task.count.range.start.character + 'count:'.length + 1;
			const neededRange = new vscode.Range(ln, charIndexWithOffset, ln, charIndexWithOffset + String(task.count.current).length);
			let newValue = 0;
			if (task.count.current !== task.count.needed) {
				newValue = task.count.current + 1;
			}
			workspaceEdit.replace(editor.document.uri, neededRange, String(newValue));
			vscode.workspace.applyEdit(workspaceEdit);
		} else {
			toggleTaskAtLine(ln, editor.document);
		}
	});
	commands.registerTextEditorCommand(`${EXTENSION_NAME}.archiveCompletedTasks`, editor => {
		if (!config.defaultArchiveFile) {
			vscode.window.showWarningMessage('No default archive file specified');
			return;
		}
		const completedTasks = state.tasks.filter(t => t.done && !t.isRecurring);
		if (!completedTasks.length) {
			return;
		}
		const edit = new vscode.WorkspaceEdit();
		for (const task of completedTasks) {
			const line = editor.document.lineAt(task.ln);
			appendTaskToFile(line.text, config.defaultArchiveFile);
			edit.delete(editor.document.uri, line.rangeIncludingLineBreak);
		}
		workspace.applyEdit(edit);
	});
	commands.registerTextEditorCommand(`${EXTENSION_NAME}.sortByPriority`, (editor, edit) => {
		const selection = editor.selection;
		if (selection.isEmpty) {
			vscode.window.showInformationMessage('Select tasks to sort');
			return;
		}
		const lineStart = selection.start.line;
		const lineEnd = selection.end.line;
		const tasks: any[] = [];
		for (let i = lineStart; i <= lineEnd; i++) {
			const task: any = getTaskAtLine(i);
			if (task) {
				task.line = editor.document.lineAt(i).text;
				tasks.push(task);
			}
		}
		const sortedTasks: any[] = sortTasks(tasks, SortProperty.priority);
		const result = sortedTasks.map(t => t.line).join('\n');
		edit.replace(getFullRangeFromLines(editor.document, lineStart, lineEnd), result);
	});
	commands.registerCommand(`${EXTENSION_NAME}.getNextTask`, () => {
	// if (theRightFileOpened) {
	// 	return;
	// }
		const document = updateState();
		let tasks = state.tasks.filter(t => !t.done);
		if (!tasks.length) {
			vscode.window.showInformationMessage('No tasks');
			return;
		}
		const dueTasks = tasks.filter(t => t.isDue);
		if (dueTasks.length) {
			tasks = dueTasks;
		}

		const sortedTasks = sortTasks(tasks, SortProperty.priority);
		vscode.window.showInformationMessage(sortedTasks[0].title);
	});
	commands.registerCommand(`${EXTENSION_NAME}.addTask`, async () => {
		if (state.theRightFileOpened) {
			return;
		}
		if (config.defaultFile) {
			const text = await window.showInputBox();
			if (!text) {
				return;
			}
			appendTaskToFile(text, config.defaultFile);
		}
	});
	commands.registerCommand(`${EXTENSION_NAME}.openDefaultArvhiveFile`, () => {
		openFileInEditor(config.defaultArchiveFile);
	});
	commands.registerCommand(`${EXTENSION_NAME}.completeTask`, async () => {
		const document = await updateState();
		const array = [];
		for (const task of state.tasks) {
			if (task.done) {
				continue;
			}
			array.push(task.title);
		}
		const result = await window.showQuickPick(array);
		if (!result) {
			return;
		}
		const task = state.tasks.find(t => t.title === result);
		if (!task) {
			return;
		}
		toggleTaskAtLine(task.ln, document);
	});
	commands.registerTextEditorCommand(`${EXTENSION_NAME}.filter`, async editor => {
		const filterStr = await vscode.window.showInputBox({
			prompt: 'Examples: #Tag, @Context, +Project',
		});
		if (!filterStr) {
			return;
		}
		const filteredTasks = filterItems(state.tasks, filterStr);
		vscode.commands.executeCommand('setContext', FILTER_ACTIVE_CONTEXT_KEY, true);
		taskProvider.refresh(filteredTasks);
	});
	commands.registerCommand(`${EXTENSION_NAME}.clearFilter`, editor => {
		taskProvider.refresh(state.tasks);
		vscode.commands.executeCommand('setContext', FILTER_ACTIVE_CONTEXT_KEY, false);
	});
	commands.registerCommand(`${EXTENSION_NAME}.insertTodayDate`, editor => {
		insertSnippet(getDateInISOFormat(new Date()));
	});
	commands.registerCommand(`${EXTENSION_NAME}.clearGlobalState`, () => {
	// @ts-ignore No API
		globalState._value = {};
		globalState.update('hack', 'toClear');// TODO: is this required to clear state?
	});
	commands.registerCommand(`${EXTENSION_NAME}.goToLine`, (lineNumber: number) => {
		const range = new vscode.Range(lineNumber, 0, lineNumber, 0);
		const { activeTextEditor } = window;
		if (!activeTextEditor) {
			return;
		}
		vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
		activeTextEditor.selection = new vscode.Selection(range.start, range.end);
		activeTextEditor.revealRange(range, vscode.TextEditorRevealType.Default);
	});
	commands.registerTextEditorCommand('todomd.resetAllRecurringTasks', editor => {
		uncheckAllRecurringTasks(editor);
	});
}

export function uncheckAllRecurringTasks(editor: TextEditor): void {
	editor.edit(builder => {
		for (const line of state.tasks) {
			if (line.isRecurring && line.done) {
				const ln = line.ln;
				const lineAt = editor.document.lineAt(ln);
				builder.delete(new vscode.Range(ln, lineAt.firstNonWhitespaceCharacterIndex, ln, lineAt.firstNonWhitespaceCharacterIndex + config.doneSymbol.length));
			}
		}
	});
}
export async function toggleTaskAtLine(ln: number, document: TextDocument): Promise<void> {
	const firstNonWhitespaceCharacterIndex = document.lineAt(ln).firstNonWhitespaceCharacterIndex;
	const task = getTaskAtLine(ln);
	if (!task) {
		return;
	}
	const line = document.lineAt(ln);
	const workspaceEdit = new vscode.WorkspaceEdit();
	if (task.done) {
		if (!config.addCompletionDate) {
			// TODO: check if the prefix exists
			workspaceEdit.delete(document.uri, new vscode.Range(ln, firstNonWhitespaceCharacterIndex, ln, firstNonWhitespaceCharacterIndex + config.doneSymbol.length));
		} else {
			const completionDateRegex = /\s{cm:\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?}\s?/;
			const match = completionDateRegex.exec(line.text);
			if (match) {
				workspaceEdit.delete(document.uri, new Range(ln, match.index, ln, match.index + match[0].length));
			}
		}
	} else {
		if (config.addCompletionDate) {
			workspaceEdit.insert(document.uri, new vscode.Position(ln, line.range.end.character), ` {cm:${getDateInISOFormat(new Date(), config.completionDateIncludeTime)}}`);
		} else {
			workspaceEdit.insert(document.uri, new vscode.Position(ln, firstNonWhitespaceCharacterIndex), config.doneSymbol);
		}
	}
	await workspace.applyEdit(workspaceEdit);
	const secondWorkspaceEdit = new vscode.WorkspaceEdit();
	if (config.autoArchiveTasks) {
		if (!task.done || task.isRecurring) {
			const possiblyChangedLine = document.lineAt(ln);
			appendTaskToFile(possiblyChangedLine.text, config.defaultArchiveFile);
			secondWorkspaceEdit.delete(document.uri, possiblyChangedLine.rangeIncludingLineBreak);
		}
	}
	workspace.applyEdit(secondWorkspaceEdit);// Not possible to apply conflicting ranges with just one edit
}
export function getTaskAtLine(lineNumber: number): Task | undefined {
	for (const line of state.tasks) {
		if (line.ln === lineNumber) {
			return line;
		}
	}
	return undefined;
}
