import { MarkdownView } from "obsidian";
import { REFERENCE_REGEX } from "./constants";

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

export function checkCursorPositionAtDatastring(
	evt: Event | { target: HTMLElement }
): any {
	const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
	const cursorFrom = activeView?.editor.getCursor("from");
	const cursorTo = activeView?.editor.getCursor("to");

	// console.log(cursorFrom);
	// console.log(cursorTo);

	let matched = false;
	let matchSpan;
	if (
		cursorFrom &&
		cursorTo &&
		cursorFrom.ch == cursorTo.ch &&
		cursorFrom.line == cursorTo.line
		// &&cursorFrom.ch - 1 >= -1
	) {
		const lineText = activeView?.editor.getLine(cursorFrom.line);
		// console.log(lineText);

		// from possible regex matches in lineText
		if (lineText) {
			const matches = [...lineText.matchAll(REFERENCE_REGEX)];
			matches.forEach((match) => {
				// console.log(match);
				if (match.index?.toString()) {
					const start = match.index;
					const end = start + match[0].length;
					if (end == cursorTo.ch && evt.target) {
						const dataString = match[1];
						// get the html element at the match location
						const container: any = evt.target;
						// console.log(container);
						// find html span element in target that has a data attribute equal to contents
						let span = container.querySelector(`span[data="${dataString}"]`);
						if (span && span instanceof HTMLSpanElement) {
							console.log("Found span element:", span);
							// Do something with the span element
							matched = true;

							matchSpan = span;
						} else {
							console.log("Span element not found");
						}
					}
				}
			});
		}
	}
	return { matched, span: matchSpan };
}
