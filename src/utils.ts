import { MarkdownView, TextFileView, View } from "obsidian";
import { REFERENCE_REGEX, ACTION_TYPE, SVG_HOVER_COLOR } from "./constants";
import { startReferenceEffect, endReferenceCursorEffect } from "./events";
import {
	getHoveredCursor,
	updateHoveredCursor,
	removeHoveredCursor,
	getHover,
} from "./state";

export function parseEditorPosition(positionString: string) {
	let [line, ch] = positionString.split(",");
	return { line: parseInt(line), ch: parseInt(ch) };
}

export function encodeURIComponentString(str: string): string {
	return encodeURIComponent(str).replace(/[:()]/g, function (c) {
		return "%" + c.charCodeAt(0).toString(16);
	});
}

export function decodeURIComponentString(str: string): string {
	return decodeURIComponent(
		str.replace(/%3A/g, ":").replace(/%28/g, "(").replace(/%29/g, ")")
	);
}

export function processURI(
	dataString: string
): [
	prefix: string,
	text: string,
	suffix: string,
	file: string,
	from: number,
	to: number
] {
	let [prefix, text, suffix, file, from, to] = dataString.split(":");
	prefix = decodeURIComponentString(prefix);
	text = decodeURIComponentString(text);
	suffix = decodeURIComponentString(suffix);
	file = decodeURIComponentString(file);
	from = decodeURIComponentString(from);
	to = decodeURIComponentString(to);
	return [prefix, text, suffix, file, parseInt(from), parseInt(to)];
}

export function getPrefixAndSuffix(document: string, from: number, to: number) {
	let prefix = document
		.slice(from - 25 > 0 ? from - 25 : 0, from)
		.split("\n")
		.slice(-1)[0];
	let suffix = document.slice(to, to + 25).split("\n")[0];
	return { prefix, suffix };
}

export function findTextPositions(
	view: View,
	searchTerm: string,
	prefix: string = "",
	suffix: string = ""
) {
	let rollingIndex = 0;

	// @ts-ignore
	const text = view.data;
	// const text = view.getDisplayText();
	const lines = text.split("\n").map((line: string, i: number) => {
		let data = { line, index: rollingIndex, length: line.length + 1, i };
		rollingIndex += data.length;
		return data;
	});

	if (text.includes(prefix + searchTerm + suffix)) {
		let matchIndex = text.indexOf(prefix + searchTerm + suffix);
		let startIndex =
			lines.findIndex((line: any) => line.index > matchIndex + prefix.length) -
			1;
		let endIndex =
			lines.findIndex(
				(line: any) =>
					line.index > matchIndex + prefix.length + searchTerm.length
			) - 1;

		if (startIndex == -2) startIndex = lines.length - 1;
		if (endIndex == -2) endIndex = lines.length - 1;

		return {
			rangeStart: {
				line: startIndex,
				ch: matchIndex + prefix.length - lines[startIndex].index,
			},
			rangeEnd: {
				line: endIndex,
				ch:
					matchIndex +
					prefix.length +
					searchTerm.length -
					lines[endIndex].index,
			},
			lines,
		};
	}
	return null;
}

export function listItemLength(line: string) {
	// Matches lines that start with a bullet (either -, *, or + followed by a space)
	const bulletRegex = /^(\s*[-*+]\s+)/;

	// Matches lines that start with a number followed by a dot and a space (like "1. ")
	const numberRegex = /^(\s*\d+\.\s+)/;

	let match = line.match(bulletRegex) || line.match(numberRegex);
	return match ? match[0].length : 0;
}

export function checkCursorPositionAtDatastring(evt: Event): {
	matched: boolean;
	span: HTMLSpanElement | undefined;
} {
	const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
	const cursorFrom = activeView?.editor.getCursor("from");
	const cursorTo = activeView?.editor.getCursor("to");

	let matched = false;
	let matchSpan: HTMLSpanElement | undefined = undefined;
	if (
		cursorFrom &&
		cursorTo &&
		cursorFrom.ch == cursorTo.ch &&
		cursorFrom.line == cursorTo.line
		// &&cursorFrom.ch - 1 >= -1
	) {
		const lineText = activeView?.editor.getLine(cursorFrom.line);

		// from possible regex matches in lineText
		if (lineText) {
			const matches = [...lineText.matchAll(REFERENCE_REGEX)];
			matches.forEach((match) => {
				if (match.index?.toString()) {
					const start: number = match.index;
					const end: number = start + match[0].length;
					if (end == cursorTo.ch && evt.target) {
						const dataString = match[1];
						// get the html element at the match location
						let checkContainer = evt.target instanceof Element;
						if (!checkContainer)
							throw new Error("Element not instance of Element");
						let container = evt.target as Element;

						console.log(container);
						let activeLine;
						if (container.classList.contains("cm-active")) {
							activeLine = container;
						}
						// else if (container.closest(".cm-active")) {
						// 	activeLine = container.closest(".cm-active");
						// }
						else {
							activeLine = container.querySelector(".cm-active");
						}
						console.log(activeLine);
						if (!activeLine) throw new Error("Element not instance of Element");
						// find html span element in target that has a data attribute equal to contents
						let span = activeLine.querySelector(`span[data="${dataString}"]`);
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

// Remove an existing higlighted reference
export function handleRemoveHoveredCursor(user: string) {
	if (getHoveredCursor()) {
		// cursors not associated with the user action
		let nonCursors = getHoveredCursor()
			.filter((element: any) => {
				return element.user !== user;
			})
			.map((element: any) => element.cursor.closest("span"));

		// white background if cursors are not associated with the user action
		getHoveredCursor()
			.filter((element: any) => element.user === user)
			.forEach((element: any) => {
				if (!nonCursors.includes(element.cursor.closest("span"))) {
					element.cursor.style.backgroundColor = "white";
				}
			});

		removeHoveredCursor(user);
	}
}

export function checkFocusCursor(evt: Event) {
	let { matched, span } = checkCursorPositionAtDatastring(evt);

	if (matched && span) {
		// remove existing cursors
		const svgElement = span.querySelector("svg");
		if (svgElement) {
			handleRemoveHoveredCursor(ACTION_TYPE.CURSOR);
			svgElement.style.backgroundColor = SVG_HOVER_COLOR;
			updateHoveredCursor(svgElement, ACTION_TYPE.CURSOR);
		}

		endReferenceCursorEffect(); // this takes 100ms to close existing peek tab
		if (span) startReferenceEffect(span, ACTION_TYPE.CURSOR);

		// setTimeout(() => {
		// 	if (span) startReferenceEffect(span, ACTION_TYPE.CURSOR);
		// }, ); // so wait 125ms before opening new peek tab
	} else {
		endReferenceCursorEffect();
		handleRemoveHoveredCursor(ACTION_TYPE.CURSOR);
	}
}
