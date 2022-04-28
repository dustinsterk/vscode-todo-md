import { TreeItemSortType } from '../types';
import { toggleGlobalSetting } from '../utils/vscodeUtils';

export function toggleTagsTreeViewSorting() {
	toggleGlobalSetting('todomd.sortTagsView', [TreeItemSortType.Alphabetic, TreeItemSortType.Count]);
}
