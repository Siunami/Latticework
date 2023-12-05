import {
	state,
	updateCursor,
	updateHover,
	getCursor,
	getHover,
	resetHover,
	resetCursor,
} from "./state";
import { ACTION_TYPE } from "./constants";
import {
	collectLeavesByTabHelper,
	getCurrentTabIndex,
	openFileInAdjacentTab,
} from "./workspace";
import {
	processURI,
	decodeURIComponentString,
	findTextPositions,
	listItemLength,
} from "./utils";

function highlightHoveredReference(dataString: string, tabIdx: number) {
	let [prefix, text, suffix, file, from, to] = processURI(dataString);

	const leavesByTab = collectLeavesByTabHelper();
	let index = leavesByTab[tabIdx][1]
		.map((leaf: any) => leaf.getViewState())
		.findIndex((x: any) => x.state.file == file);
	if (index != -1) {
		let targetLeaf = leavesByTab[tabIdx][1][index];

		const editor = targetLeaf.view.editor;
		/*
		{
			"top": 0,
			"left": 0,
			"clientHeight": 1311,
			"clientWidth": 1063,
			"height": 1311,
			"width": 1078
		}
		*/
		let positions = findTextPositions(
			targetLeaf.view,
			text,
			prefix.slice(0, prefix.length - 1),
			suffix.slice(1, suffix.length)
		);
		if (!positions) return;
		let rangeStart = positions.rangeStart;
		let rangeEnd = positions.rangeEnd;

		const originalScroll = editor.getScrollInfo();
		const originalCursor = editor.getCursor();

		const ranges = [];

		let lines = text.split("\n");
		let currIndex = 0;

		// function shiftIfBullet(rangeStart) {}

		if (rangeStart.line != rangeEnd.line) {
			let start = rangeStart.line;
			let end = rangeEnd.line;
			let curr = start;
			while (curr <= end) {
				if (curr == start) {
					editor.replaceRange(
						`+++${decodeURIComponentString(lines[currIndex])}+++`,
						rangeStart,
						{
							line: curr,
							ch: editor.getLine(curr).length,
						}
					);
					ranges.push([
						lines[currIndex],
						rangeStart,
						{
							line: curr,
							ch: editor.getLine(curr).length,
						},
					]);
					curr++;
				} else if (curr == end) {
					let listItemIndex = listItemLength(lines[currIndex]);
					let listItemText = lines[currIndex].slice(
						listItemIndex,
						lines[currIndex].length
					);
					editor.replaceRange(
						`+++${decodeURIComponentString(listItemText)}+++`,
						{
							line: curr,
							ch: listItemIndex,
						},
						rangeEnd
					);
					ranges.push([
						listItemText,
						{
							line: curr,
							ch: listItemIndex,
						},
						Object.assign({}, rangeEnd, { ch: rangeEnd.ch + 6 }),
					]);
					curr++;
				} else {
					let listItemIndex = listItemLength(lines[currIndex]);
					let listItemText = lines[currIndex].slice(
						listItemIndex,
						lines[currIndex].length
					);
					editor.replaceRange(
						`+++${decodeURIComponentString(listItemText)}+++`,
						{
							line: curr,
							ch: listItemIndex,
						},
						{
							line: curr,
							ch: editor.getLine(curr).length,
						}
					);
					ranges.push([
						listItemText,
						{
							line: curr,
							ch: listItemIndex,
						},
						{
							line: curr,
							ch: editor.getLine(curr).length,
						},
					]);
					curr++;
				}
				currIndex++;
			}
		} else {
			editor.replaceRange(
				`+++${decodeURIComponentString(text)}+++`,
				rangeStart,
				rangeEnd
			);
			ranges.push([
				text,
				rangeStart,
				Object.assign({}, rangeEnd, { ch: rangeEnd.ch + 6 }),
			]);
		}

		editor.scrollIntoView(
			{
				from: rangeStart,
				to: rangeEnd,
			},
			true
		);
		return {
			tabIdx,
			index,
			dataString,
			originalTop: originalScroll.top,
			originalCursor,
			ranges,
		};
	}
	return null;
}

export async function startReferenceEffect(
	span: HTMLSpanElement,
	type: string
) {
	let source = type == ACTION_TYPE.HOVER ? getHover() : getCursor();
	let destination = type == ACTION_TYPE.HOVER ? getCursor() : getHover();
	let updateState = type == ACTION_TYPE.HOVER ? updateHover : updateCursor;
	let getState = type == ACTION_TYPE.HOVER ? getHover : getCursor;
	let resetState = type == ACTION_TYPE.HOVER ? resetHover : resetCursor;

	// Mutex, prevent concurrent access to following section of code
	if (source != null) return;
	updateState({
		type: `${type}-start`,
	});

	const dataString = span.getAttribute("data");
	if (!dataString) return;

	if (destination != null && destination.dataString == dataString) {
		updateHover(destination);
		return;
	}

	let [prefix, text, suffix, file, from, to] = processURI(dataString);

	let leavesByTab = collectLeavesByTabHelper();
	let currTabIdx = getCurrentTabIndex(leavesByTab, span);

	if (currTabIdx != -1) {
		// && currTab != -1) {
		// // Check adjacent tabs for file and open file if needed
		const newLeaf = await openFileInAdjacentTab(leavesByTab, currTabIdx, file);

		if (newLeaf) {
			updateState({
				leafId: newLeaf.id,
			});
		}

		leavesByTab = collectLeavesByTabHelper();

		// highlight reference in the right tab
		if (leavesByTab[currTabIdx + 1]) {
			const data = highlightHoveredReference(dataString, currTabIdx + 1);
			if (data) {
				updateState(data);
			}
			return;
		}

		// highlight reference in the left tab
		if (leavesByTab[currTabIdx - 1]) {
			const data = highlightHoveredReference(dataString, currTabIdx - 1);
			if (data) {
				updateState(data);
			}
			return;
		}
	}
}

export async function endReferenceCursorEffect() {
	const leavesByTab = collectLeavesByTabHelper();
	if (!getCursor() || Object.keys(getCursor()).length == 0) {
		// End mutex lock
		resetCursor();
		return;
	}

	const {
		tabIdx,
		index,
		dataString,
		leafId,
		originalTop,
		originalCursor,
		ranges,
	} = getCursor();

	if (getHover() != null && getHover().dataString == dataString) {
		// End mutex lock
		resetCursor();
		return;
	}
	if (
		!leavesByTab[tabIdx] ||
		!leavesByTab[tabIdx][1] ||
		!leavesByTab[tabIdx][1][index]
	) {
		// End mutex lock
		resetCursor();
		return;
	}

	let targetLeaf = leavesByTab[tabIdx][1][index];
	// this.app.workspace.setActiveLeaf(targetLeaf);
	const editor = targetLeaf.view.editor;
	if (ranges) {
		ranges.forEach((range: any[]) => {
			editor.replaceRange(range[0], range[1], range[2]);
		});
	}
	editor.scrollIntoView(
		{
			from: ranges[0][1],
			to: ranges[ranges.length - 1][2],
		},
		true
	);

	if (leafId) {
		setTimeout(() => {
			targetLeaf.detach();
		}, 100);
	}

	// End mutex lock
	resetCursor();
}
