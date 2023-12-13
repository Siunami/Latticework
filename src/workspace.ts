import {
	TAbstractFile,
	TFile,
	Workspace,
	WorkspaceLeaf,
	WorkspaceRoot,
	WorkspaceSplit,
	WorkspaceTabs,
} from "obsidian";
import { getThat } from "./state";
import { ACTION_TYPE } from "./constants";

function findRootSplit(split: any) {
	console.log(split);
	// If this split has no parent, it's the root.
	if (!split.parent) {
		return split;
	}
	// Otherwise, keep looking upwards.
	return findRootSplit(split.parent);
}

// function collectLeavesByTab(split: any, result: any = []) {
// 	if (split.type == "tabs") {
// 		result.push([split, []]);
// 		collectLeavesByTab(split.children, result);
// 	} else if (split.type == "leaf") {
// 		const parentSplitId = split.parent.id;
// 		// find array index for split with id parentSplitId
// 		let idx = result.findIndex((x: any) => x[0].id == parentSplitId);
// 		result[idx][1].push(split);
// 	}

// 	if (split.children) {
// 		for (const child of split.children) {
// 			collectLeavesByTab(child, result);
// 		}
// 	}
// 	return result;
// }

function collectLeavesByTab(
	split: WorkspaceSplit,
	result: [WorkspaceLeaf[]] | [] = []
) {
	// @ts-ignore
	const type = split.type;
	if (!type) throw new Error("Split type not found");

	if (type == "tabs" || type == "split") {
		// @ts-ignore
		const children = split.children;
		if (!children) throw new Error("Split children not found");

		if (children) {
			for (const child of children) {
				let emptyList: WorkspaceLeaf[] = [];

				collectLeavesByTab(child, result);
			}
		}
		// result.push([]);
		// collectLeavesByTab(children, result);
	} else if (type == "leaf") {
		// @ts-ignore
		const parentSplitId = split.parent.id;
		if (!parentSplitId) throw new Error("Split parent id not found");

		// find array index for split with id parentSplitId
		let idx = result.findIndex((tab: WorkspaceLeaf[]) => {
			// @ts-ignore
			const tabId = tab[0].parent.id;
			return tabId == parentSplitId;
		});
		if (idx == -1) {
			// @ts-ignore
			result.push([split as WorkspaceLeaf]);
		} else {
			result[idx].push(split as WorkspaceLeaf);
		}
	}

	// if (children) {
	// 	for (const child of children) {
	// 		collectLeavesByTab(child, result);
	// 	}
	// }
	return result;
}

export function collectLeavesByTabHelper() {
	const { workspace } = getThat();
	const currLeaf: WorkspaceLeaf = workspace.getLeaf();
	// const rootSplit = findRootSplit(currLeaf);
	const rootSplit: WorkspaceSplit = currLeaf.getRoot();
	return collectLeavesByTab(rootSplit);
}

export function getCurrentTabIndex(leavesByTab: any[], span: HTMLSpanElement) {
	let workspaceTab = span.closest(".workspace-tabs");
	let currTabIdx = leavesByTab.findIndex((tab: WorkspaceLeaf[]) => {
		const leafTab = tab[0].view.containerEl.closest(".workspace-tabs");
		return leafTab == workspaceTab;
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
		rightAdjacentTab = leavesByTab[currTabIdx + 1];
		adjacentTabs = [...adjacentTabs, ...rightAdjacentTab];
	}
	if (leavesByTab[currTabIdx - 1]) {
		leftAdjacentTab = leavesByTab[currTabIdx - 1];
		adjacentTabs = [...adjacentTabs, ...leftAdjacentTab];
	}

	let index = adjacentTabs.findIndex(
		(x: WorkspaceLeaf) => x.getViewState().state.file == file
	);
	return { adjacentTabs, rightAdjacentTab, leftAdjacentTab, index };
}

export async function openFileInAdjacentTab(
	leavesByTab: any[],
	currTabIdx: number,
	file: string,
	type?: string
) {
	let { adjacentTabs, rightAdjacentTab, leftAdjacentTab } = getAdjacentTabs(
		leavesByTab,
		currTabIdx,
		file
	);

	let rightAdjacentTabNames = rightAdjacentTab.map(
		(x: WorkspaceLeaf) => x.getViewState().state.file
	);
	let leftAdjacentTabNames = leftAdjacentTab.map(
		(x: WorkspaceLeaf) => x.getViewState().state.file
	);
	const { workspace } = getThat();

	if (rightAdjacentTabNames.includes(file)) {
		// file exists in right tab
		const originalTab = rightAdjacentTab.filter(
			(t) => t.containerEl.style.display != "none"
		);
		let leaf = rightAdjacentTab[rightAdjacentTabNames.indexOf(file)];
		workspace.revealLeaf(leaf);
		return { newLeaf: leaf, temp: false, originalTab };
	} else if (leftAdjacentTabNames.includes(file)) {
		// file exists in left tab
		const originalTab = leftAdjacentTab.filter(
			(t) => t.containerEl.style.display != "none"
		);
		let leaf = leftAdjacentTab[leftAdjacentTabNames.indexOf(file)];
		workspace.revealLeaf(leaf);
		return { newLeaf: leaf, temp: false, originalTab };
	} else if (rightAdjacentTab.length > 0) {
		// there exists a right tab
		const originalTab = rightAdjacentTab.filter(
			(t) => t.containerEl.style.display != "none"
		);
		let currLeaf = workspace.getLeaf();
		let leaf = rightAdjacentTab[0];
		workspace.setActiveLeaf(leaf);
		let newLeaf = workspace.getLeaf(true);
		await openFileInLeaf(newLeaf, file);
		workspace.revealLeaf(newLeaf);
		workspace.setActiveLeaf(currLeaf);
		return { newLeaf, temp: true, originalTab };
	} else if (leftAdjacentTab.length > 0) {
		// there exists a left tab
		const originalTab = leftAdjacentTab.filter(
			(t) => t.containerEl.style.display != "none"
		);
		let currLeaf = workspace.getLeaf(); // get current active leaf
		let leaf = leftAdjacentTab[0];
		workspace.setActiveLeaf(leaf); // get the leaf in adjacent tab
		let newLeaf = workspace.getLeaf(true); // create a new leaf
		await openFileInLeaf(newLeaf, file); // load file into new leaf
		workspace.revealLeaf(newLeaf); // reveal new leaf
		workspace.setActiveLeaf(currLeaf); // set active leaf back to original
		return { newLeaf, temp: true, originalTab };
	} else {
		// no adjacent tabs
		const currLeaf = workspace.getLeaf();
		let newLeaf = workspace.createLeafBySplit(currLeaf);
		await openFileInLeaf(newLeaf, file);
		return { newLeaf, temp: true };
	}
	// return { newLeaf: null, temp: false };
}

export async function openFileInLeaf(leaf: WorkspaceLeaf, file: string) {
	let targetFile: TAbstractFile | null =
		getThat().vault.getAbstractFileByPath(file);
	if (targetFile && targetFile instanceof TFile)
		await leaf.openFile(targetFile, { active: false });
}
