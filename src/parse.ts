import vscode, { Range } from 'vscode';
import { DueDate } from './dueDate';
import { extensionConfig, extensionState } from './extension';
import { Count, Priority, TheTask } from './TheTask';

interface ParseLineReturn {
	lineType: string;
	value?: unknown;
}
interface TaskReturn extends ParseLineReturn {
	lineType: 'task';
	value: TheTask;
}
interface SpecialCommentReturn extends ParseLineReturn {
	lineType: 'specialComment';
	value: string[];
}
interface CommentReturn extends ParseLineReturn {
	lineType: 'comment';
}
interface EmptyLineReturn extends ParseLineReturn {
	lineType: 'empty';
}
/**
 * Main parsing function. 1 Line - 1 Task.
 */
export function parseLine(textLine: vscode.TextLine): CommentReturn | EmptyLineReturn | SpecialCommentReturn | TaskReturn {
	let line = textLine.text.trim();
	if (!line.length) {
		return {
			lineType: 'empty',
		};
	}

	const lineNumber = textLine.lineNumber;
	if (line.startsWith('# ')) {
		return {
			lineType: 'comment',
		};
	} else if (line.startsWith('## ')) {
		const tags = [];
		const tempLine = line.slice(3).trim().split(' ');
		for (const word of tempLine) {
			if (word.startsWith('#')) {
				tags.push(...word.split('#').filter(tag => tag.length));
			}
		}
		return {
			lineType: 'specialComment',
			value: tags,
		};
	}

	const indentLvl = Math.floor(textLine.firstNonWhitespaceCharacterIndex / extensionState.activeDocumentTabSize);

	/** Offset of the current word (Used to calculate ranges for decorations) */
	let index = textLine.firstNonWhitespaceCharacterIndex;

	let done = line.startsWith(extensionConfig.doneSymbol);
	if (done) {
		line = line.replace(extensionConfig.doneSymbol, '');
		index += extensionConfig.doneSymbol.length;
	}

	const words = line.split(' ');

	const rawText = textLine.text;
	const contexts = [];
	const contextRanges: Range[] = [];
	const projects = [];
	const projectRanges: Range[] = [];
	const specialTagRanges: Range[] = [];
	const text: string[] = [];
	let priority: Priority | undefined;
	let priorityRange: Range | undefined;
	const tags: string[] = [];
	const tagsDelimiterRanges: Range[] = [];
	const tagsRange: Range[] = [];
	let count: Count | undefined;
	let threshold: string | undefined;
	let overdue: string | undefined;
	let isHidden: boolean | undefined;
	let isCollapsed: boolean | undefined;
	let due: DueDate | undefined;
	let dueRange: Range | undefined;
	let overdueRange: Range | undefined;
	let collapseRange: Range | undefined;
	let completionDateRange: Range | undefined;

	for (const word of words) {
		switch (word[0]) {
			case '{': {
				if (word[word.length - 1] !== '}') {
					text.push(word);
					break;
				}
				const [specialTag, value = ''] = word.slice(1, -1).split(':');
				const range = new Range(lineNumber, index, lineNumber, index + word.length);
				if (specialTag === 'due') {
					if (value.length) {
						due = new DueDate(value);
						dueRange = range;
					}
				} else if (specialTag === 'overdue') {
					overdue = value;
					overdueRange = range;
				} else if (specialTag === 'cr') {
					specialTagRanges.push(range);
				} else if (specialTag === 'cm') {
					// Presence of completion date indicates that the task is done
					done = true;
					completionDateRange = range;
					specialTagRanges.push(range);
				} else if (specialTag === 'count') {
					if (value === undefined) {
						break;
					}
					const [current, needed] = value.split('/');
					const currentValue = parseInt(current, 10);
					const neededValue = parseInt(needed, 10);
					if (!Number.isFinite(currentValue) || !Number.isFinite(neededValue)) {
						break;
					}
					specialTagRanges.push(range);
					if (currentValue === neededValue) {
						done = true;
					}
					count = {
						range,
						current: currentValue,
						needed: neededValue,
					};
				} else if (specialTag === 't') {
					threshold = value;
					specialTagRanges.push(range);
				} else if (specialTag === 'h') {
					isHidden = true;
					specialTagRanges.push(range);
				} else if (specialTag === 'c') {
					isCollapsed = true;
					collapseRange = range;
					specialTagRanges.push(range);
				} else {
					text.push(word);
				}
				break;
			}
			case '#': {
				const tempTags = word.split('#').filter(tag => tag.length);
				let temp = index;
				for (const tag of tempTags) {
					tagsDelimiterRanges.push(new Range(lineNumber, temp, lineNumber, temp + 1));
					tagsRange.push(new Range(lineNumber, temp + 1, lineNumber, temp + 1 + tag.length));
					temp += tag.length + 1;
					tags.push(tag);
				}
				break;
			}
			case '@': {
				if (word.length !== 1) {
					contexts.push(word.slice(1));
					contextRanges.push(new Range(lineNumber, index, lineNumber, index + word.length));
				} else {
					text.push(word);
				}
				break;
			}
			case '+': {
				if (word.length !== 1) {
					projects.push(word.slice(1));
					projectRanges.push(new Range(lineNumber, index, lineNumber, index + word.length));
				} else {
					text.push(word);
				}
				break;
			}
			case '(': {
				if (/^\([A-Z]\)$/.test(word)) {
					priority = word[1] as Priority;
					priorityRange = new Range(lineNumber, index, lineNumber, index + word.length);
				} else {
					text.push(word);
				}
				break;
			}
			default: {
				text.push(word);
			}
		}
		index += word.length + 1;// 1 is space sign
	}

	return {
		lineType: 'task',
		value: new TheTask({
			tags,
			rawText,
			tagsDelimiterRanges,
			tagsRange,
			projects,
			projectRanges,
			done,
			priority,
			priorityRange,
			specialTagRanges,
			due,
			dueRange,
			overdueRange,
			collapseRange,
			completionDateRange,
			count,
			threshold,
			overdue,
			isHidden,
			isCollapsed,
			contexts,
			contextRanges,
			title: text.join(' '),
			lineNumber,
			indentLvl,
		}),
	};
}

interface ParsedDocument {
	tasks: TheTask[];
	tasksAsTree: TheTask[];
	commentLines: Range[];
}
/**
 * Some features require knowledge beyond 1 line.
 * Parsing links, for example, is taken from vscode api that runs on a document. This function maps it to each line.
 *
 * Also other things, like nested tasks...
 */
export async function parseDocument(document: vscode.TextDocument): Promise<ParsedDocument> {
	const tasks: TheTask[] = [];
	const commentLines: Range[] = [];
	let additionalTags: string[] = [];

	const links = await vscode.commands.executeCommand<vscode.DocumentLink[]>('vscode.executeLinkProvider', document.uri) ?? [];

	for (let i = 0; i < document.lineCount; i++) {
		const parsedLine = parseLine(document.lineAt(i));
		switch (parsedLine.lineType) {
			case 'empty': continue;
			case 'comment': {
				commentLines.push(new Range(i, 0, i, 0));
				additionalTags = [];
				continue;
			}
			case 'specialComment': {
				commentLines.push(new Range(i, 0, i, 0));
				additionalTags = parsedLine.value;
				continue;
			}
			default: {
				// Additional tags ------------
				if (additionalTags.length !== 0) {
					parsedLine.value.tags.push(...additionalTags);
				}
				// Links ----------------------
				const linksOnThisLine = links.filter(link => link.range.start.line === i && link.target !== undefined);
				if (linksOnThisLine.length !== 0) {
					parsedLine.value.links = linksOnThisLine.map(link => ({
						characterRange: [link.range.start.character, link.range.end.character],
						value: link.target!.toString(true),
						scheme: link.target!.scheme,
					}));
				}
				// Overdue --------------------
				if (parsedLine.value.overdue && parsedLine.value.due?.raw) {
					parsedLine.value.due = new DueDate(parsedLine.value.due.raw, {
						overdue: parsedLine.value.overdue,
					});
				}
				// Handle nested tasks (find parent task lineNumber)
				if (parsedLine.value.indentLvl) {
					for (let j = tasks.length - 1; j >= 0; j--) {
						if (tasks[j].indentLvl < parsedLine.value.indentLvl) {
							parsedLine.value.parentTaskLineNumber = tasks[j].lineNumber;
							break;
						}
					}
				}
				tasks.push(parsedLine.value);
			}
		}
	}
	// Move nested tasks inside the task
	const tasksMap: {
		[lineNumber: number]: TheTask;
	} = Object.create(null);
	for (const task of tasks) {
		tasksMap[task.lineNumber] = new TheTask({
			...task,
			subtasks: [],
		});
	}
	const tasksAsTree: TheTask[] = [];
	for (const task of tasks) {
		if (task.parentTaskLineNumber !== undefined) {
			tasksMap[task.parentTaskLineNumber].subtasks.push(tasksMap[task.lineNumber]);
		} else {
			tasksAsTree.push(tasksMap[task.lineNumber]);
		}
	}

	return {
		tasksAsTree,
		tasks,
		commentLines,
	};
}
