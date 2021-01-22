import { TheTask } from './TheTask';
import { DueState } from './types';
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
	priority,
}
/**
 * Does not modify the original array
 */
export function sortTasks(tasks: TheTask[], property: SortProperty, direction = SortDirection.DESC): TheTask[] {
	const tasksCopy = tasks.slice();
	let sortedTasks: TheTask[] = [];

	if (property === SortProperty.priority) {
		sortedTasks = tasksCopy.sort((a, b) => {
			if (a.priority === b.priority) {
				return 0;
			} else {
				return a.priority > b.priority ? 1 : -1;
			}
		});
	}
	if (direction === SortDirection.ASC) {
		return sortedTasks.reverse();
	}
	return sortedTasks;
}

/**
 * Sort tasks by groups in this order: Overdue => Due => Not due;
 *
 * With secondary sort by priority.
 */
export function defaultSortTasks(tasks: TheTask[]) {
	const overdueTasks = tasks.filter(t => t.due?.isDue === DueState.overdue);
	const dueTasks = tasks.filter(t => t.due?.isDue === DueState.due);
	const notDueTasks = tasks.filter(t => !t.due?.isDue || !t.due);
	const sortedOverdueTasks = sortTasks(overdueTasks, SortProperty.priority);
	const sortedDueTasks = sortTasks(dueTasks, SortProperty.priority);
	const sortedNotDueTasks = sortTasks(notDueTasks, SortProperty.priority);
	return [...sortedOverdueTasks, ...sortedDueTasks, ...sortedNotDueTasks];
}
