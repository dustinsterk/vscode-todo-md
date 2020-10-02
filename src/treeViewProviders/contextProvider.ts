import vscode from 'vscode';
import { EXTENSION_NAME } from '../extension';
import { ItemForProvider } from '../types';


export class ContextTreeItem extends vscode.TreeItem {
	readonly collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;

	constructor(
		readonly label: string,
		readonly items: LineTreeItem[],
	) {
		super(label);
	}
	// @ts-ignore
	get tooltip(): string | undefined {
		return undefined;
	}
	// @ts-ignore
	get description(): undefined {
		return undefined;
	}

	contextValue = 'project';
}

class LineTreeItem extends vscode.TreeItem {
	readonly collapsibleState = vscode.TreeItemCollapsibleState.None;

	constructor(
		readonly label: string,
		readonly command: vscode.Command,
	) {
		super(label);
	}
	// @ts-ignore
	get tooltip(): undefined {
		return undefined;
	}
	// @ts-ignore
	get description(): undefined {
		return undefined;
	}

	contextValue = 'line';
}

export class ContextProvider implements vscode.TreeDataProvider<ContextTreeItem | LineTreeItem> {
	private readonly _onDidChangeTreeData: vscode.EventEmitter<ContextTreeItem | undefined> = new vscode.EventEmitter<ContextTreeItem | undefined>();
	readonly onDidChangeTreeData: vscode.Event<ContextTreeItem | undefined> = this._onDidChangeTreeData.event;

	constructor(
		private contexts: ItemForProvider[],
	) { }

	refresh(newContexts: ItemForProvider[]): void {
		this.contexts = newContexts;
		this._onDidChangeTreeData.fire(undefined);
	}

	getTreeItem(element: ContextTreeItem | LineTreeItem): vscode.TreeItem {
		return element;
	}

	getChildren(element: ContextTreeItem | undefined): ContextTreeItem[] | LineTreeItem[] {
		if (element) {
			return element.items;
		} else {
			return this.contexts.map(context => new ContextTreeItem(`${context.title} [${context.items.length}]`, context.items.map(item => new LineTreeItem(
				item.title,
				{
					command: `${EXTENSION_NAME}.goToLine`,
					title: 'Go To Line',
					arguments: [item.lineNumber],
				},
			))));
		}
	}
}
