export function parseEditorPosition(positionString: string) {
	let [line, ch] = positionString.split(",");
	return { line: parseInt(line), ch: parseInt(ch) };
}

export function encodeURIComponentString(str: string): string {
	return encodeURIComponent(str).replace(/[:()]/g, function (c) {
		return "%" + c.charCodeAt(0).toString(16);
	});
}

export function decodeURIComponentString(str: string) {
	return decodeURIComponent(
		str.replace(/%3A/g, ":").replace(/%28/g, "(").replace(/%29/g, ")")
	);
}

export function processURI(dataString: string) {
	let [prefix, text, suffix, file, from, to] = dataString.split(":");
	prefix = decodeURIComponentString(prefix);
	text = decodeURIComponentString(text);
	suffix = decodeURIComponentString(suffix);
	file = decodeURIComponentString(file);
	from = decodeURIComponentString(from);
	to = decodeURIComponentString(to);
	return [prefix, text, suffix, file, from, to];
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
