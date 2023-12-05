import { getThat } from "./state";

function findRootSplit(split: any) {
	// If this split has no parent, it's the root.
	if (!split.parent) {
		return split;
	}
	// Otherwise, keep looking upwards.
	return findRootSplit(split.parent);
}

function collectLeavesByTab(split: any, result: any = []) {
	if (split.type == "tabs") {
		result.push([split, []]);
		collectLeavesByTab(split.children, result);
	} else if (split.type == "leaf") {
		const parentSplitId = split.parent.id;
		// find array index for split with id parentSplitId
		let idx = result.findIndex((x: any) => x[0].id == parentSplitId);
		result[idx][1].push(split);
	}

	if (split.children) {
		for (const child of split.children) {
			collectLeavesByTab(child, result);
		}
	}
	return result;
}

export function collectLeavesByTabHelper() {
	const { workspace } = getThat().app;
	const currLeaf = workspace.getLeaf();
	const rootSplit = findRootSplit(currLeaf);
	return collectLeavesByTab(rootSplit);
}

export function getCurrentTabIndex(leavesByTab: any[], span: HTMLSpanElement) {
	let workspaceTab = span.closest(".workspace-tabs");
	let currTabIdx = leavesByTab.findIndex((x: any) => {
		return x[0].containerEl == workspaceTab;
	});
	return currTabIdx;
}

export function getAdjacentTabs(
	leavesByTab: any[],
	currTabIdx: number,
	file: string
) {
	let rightAdjacentTab: any[] = [];
	let leftAdjacentTab: any[] = [];
	let adjacentTabs: any[] = [];

	if (leavesByTab[currTabIdx + 1]) {
		rightAdjacentTab = leavesByTab[currTabIdx + 1][1].map((leaf: any) =>
			leaf.getViewState()
		);
		adjacentTabs = [...adjacentTabs, ...rightAdjacentTab];
	}
	if (leavesByTab[currTabIdx - 1]) {
		leftAdjacentTab = leavesByTab[currTabIdx - 1][1].map((leaf: any) =>
			leaf.getViewState()
		);
		adjacentTabs = [...adjacentTabs, ...leftAdjacentTab];
	}

	let index = adjacentTabs.findIndex((x: any) => x.state.file == file);
	return { adjacentTabs, rightAdjacentTab, leftAdjacentTab, index };
}

export async function openFileInAdjacentTab(
	leavesByTab: any[],
	currTabIdx: number,
	file: string
) {
	let { adjacentTabs, index } = getAdjacentTabs(leavesByTab, currTabIdx, file);

	// there are no adjacent tabs
	if (adjacentTabs.length == 0) {
		const { workspace } = getThat().app;
		const currLeaf = workspace.getLeaf();
		let newLeaf = workspace.createLeafBySplit(currLeaf);
		await openFileInLeaf(newLeaf, file);
		return newLeaf;
	} else {
		// leaf doesn't exist in either adjacent tab
		let adjacentTab;
		if (leavesByTab[currTabIdx + 1]) adjacentTab = leavesByTab[currTabIdx + 1];
		else if (leavesByTab[currTabIdx - 1])
			adjacentTab = leavesByTab[currTabIdx - 1];

		if (adjacentTab) {
			let tab = adjacentTab[0];
			let newLeaf: any = this.app.workspace.createLeafInParent(tab, 0);
			await openFileInLeaf(newLeaf, file);
			return newLeaf;
		}
	}
	return null;
}

export async function openFileInLeaf(newLeaf: any, file: string) {
	let targetFile: any = this.app.vault.getAbstractFileByPath(file);
	await newLeaf.openFile(targetFile, { active: false });
}
