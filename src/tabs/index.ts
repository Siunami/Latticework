import { state } from "../state";

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
	const { workspace } = state.values[0].app;
	const currLeaf = workspace.getLeaf();
	const rootSplit = findRootSplit(currLeaf);
	return collectLeavesByTab(rootSplit);
}
