import dayjs from 'dayjs';
import intersection from 'lodash/intersection';
import { TextEditor, TextEditorEdit } from 'vscode';
import { TheTask } from './TheTask';
import { DueState } from './types';
import { getTaskAtLineExtension } from './utils/taskUtils';
import { UnsupportedValueError } from './utils/utils';
import { getFullRangeFromLines } from './utils/vscodeUtils';

/**
 * Sorting direction
 */
const enum SortDirection {
	DESC,
	ASC,
}
/**
 * Sorting property
 */
export const enum SortProperty {
	Default,
	Priority,
	Project,
	NotDue,
	Overdue,
	CreationDate,
	CompletionDate,
}
/**
 * Does not modify the original array.
 */
export function sortTasks(tasks: TheTask[], sortProperty: SortProperty, direction = SortDirection.DESC): TheTask[] {
	const tasksCopy = tasks.slice();
	let sortedTasks: TheTask[] = [];

	if (sortProperty === SortProperty.Default) {
		sortedTasks = defaultSortTasks(tasksCopy);
	} else if (sortProperty === SortProperty.Priority) {
		sortedTasks = tasksCopy.sort((a, b) => {
			if (a.priority === b.priority) {
				return 0;
			} else {
				return a.priority > b.priority ? 1 : -1;
			}
		});
	} else if (sortProperty === SortProperty.Project) {
		sortedTasks = sortBySimilarityOfArrays(tasksCopy, 'project');
	} else if (sortProperty === SortProperty.CreationDate) {
		sortedTasks = tasksCopy.sort((a, b) => {
			if (a.creationDate === b.creationDate) {
				return 0;
			} else {
				if (a.creationDate === undefined) {
					return -Infinity;
				} else if (b.creationDate === undefined) {
					return Infinity;
				}
				return dayjs(a.creationDate).diff(b.creationDate);
			}
		});
	} else if (sortProperty === SortProperty.CompletionDate) {
		sortedTasks = tasksCopy.sort((a, b) => {
			if (a.completionDate === b.completionDate) {
				return 0;
			} else {
				if (a.completionDate === undefined) {
					return -Infinity;
				} else if (b.completionDate === undefined) {
					return Infinity;
				}
				return dayjs(a.completionDate).diff(b.completionDate);
			}
		});
	} else if (sortProperty === SortProperty.Overdue) {
		sortedTasks = tasksCopy.sort((a, b) => {
			const overdueA = a.due?.overdueInDays || 0;
			const overdueB = b.due?.overdueInDays || 0;
			if (overdueA === overdueB) {
				return 0;
			} else {
				return overdueA < overdueB ? 1 : -1;
			}
		});
	} else if (sortProperty === SortProperty.NotDue) {
		sortedTasks = tasksCopy.sort((a, b) => {
			const untilA = a.due?.daysUntilDue || 0;
			const untilB = b.due?.daysUntilDue || 0;
			if (untilA === untilB) {
				return 0;
			} else {
				return untilA > untilB ? 1 : -1;
			}
		});
	} else {
		throw new UnsupportedValueError(sortProperty);
	}

	if (direction === SortDirection.ASC) {
		return sortedTasks.reverse();
	}

	return sortedTasks;
}

/**
 * Sort tasks by groups in this order: Invalid => Overdue => Due => Has due, but not due => No due specified;
 *
 * With secondary sort by priority.
 */
export function defaultSortTasks(tasks: TheTask[]) {
	tasks = sortTasks(tasks, SortProperty.Priority);

	const overdueTasks = tasks.filter(t => t.due?.isDue === DueState.Overdue);
	const dueTasks = tasks.filter(t => t.due?.isDue === DueState.Due);
	const invalidDue = tasks.filter(t => t.due?.isDue === DueState.Invalid);
	const dueSpecifiedButNotDue = tasks.filter(t => t.due?.isDue === DueState.NotDue);
	const dueNotSpecified = tasks.filter(t => !t.due);

	return [
		...invalidDue,
		...sortTasks(overdueTasks, SortProperty.Overdue),
		...dueTasks,
		...dueNotSpecified,
		...sortTasks(dueSpecifiedButNotDue, SortProperty.NotDue),
	];
}

function sortBySimilarityOfArrays(tasks: TheTask[], property: 'project'): TheTask[] {
	const similarityMap: {
		ln1: number;
		ln2: number;
		similarity: number;
	}[] = [];

	for (const task1 of tasks) {
		const ln1 = task1.lineNumber;
		for (const task2 of tasks) {
			const ln2 = task2.lineNumber;
			let similarity = 0;
			if (property === 'project') {
				similarity = intersection(task1.projects, task2.projects).length;
			}
			similarityMap.push({
				ln1,
				ln2,
				similarity,
			});
		}
	}
	similarityMap.sort((a, b) => a.similarity - b.similarity);

	const result = [];
	for (const sim of similarityMap) {
		result.push(sim.ln2, sim.ln1);
	}

	// keep unique line numbers but from the end of the array
	return [...new Set(result.reverse())]
		.reverse()
		.map(lineNumber => tasks.find(task => task.lineNumber === lineNumber)!);
}

/**
 * Sort tasks in editor. Default sort is by due date. Same due date sorted by priority.
 */
export function sortTasksInEditor(editor: TextEditor, edit: TextEditorEdit, sortProperty: SortProperty) {
	const selection = editor.selection;
	let lineStart = selection.start.line;
	let lineEnd = selection.end.line;
	if (selection.isEmpty) {
		lineStart = 0;
		lineEnd = editor.document.lineCount - 1;
	}
	const tasks: TheTask[] = [];
	for (let i = lineStart; i <= lineEnd; i++) {
		const task = getTaskAtLineExtension(i);
		if (task) {
			tasks.push(task);
		}
	}
	const sortedTasks = sortTasks(tasks, sortProperty);
	if (!sortedTasks.length) {
		return;
	}
	const result = sortedTasks.map(t => t.rawText).join('\n');
	edit.replace(getFullRangeFromLines(editor.document, lineStart, lineEnd), result);
}
