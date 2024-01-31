import { MarkdownView } from "obsidian";
import { REFERENCE_REGEX } from "./constants";
import { match } from "assert";

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
	to: number,
	portal: string,
	toggle: string
] {
	let [prefix, text, suffix, file, from, to, portal, toggle] =
		dataString.split(":");
	prefix = decodeURIComponentString(prefix);
	text = decodeURIComponentString(text);
	suffix = decodeURIComponentString(suffix);
	file = decodeURIComponentString(file);
	from = decodeURIComponentString(from);
	to = decodeURIComponentString(to);
	if (portal) portal = decodeURIComponentString(portal);
	toggle = decodeURIComponentString(toggle);

	return [
		prefix,
		text,
		suffix,
		file,
		parseInt(from),
		parseInt(to),
		portal,
		toggle,
	];
}

export function getPrefixAndSuffix(document: string, from: number, to: number) {
	let prefix = document
		.slice(from - 25, from)
		.split("\n")
		.slice(-1)[0];

	let suffix = document.slice(to, to + 25).split("\n")[0];
	return { prefix, suffix };
}

export function findTextPositions(
	text: string,
	searchTerm: string,
	prefix: string = "",
	suffix: string = ""
) {
	let rollingIndex = 0;

	const lines = text.split("\n").map((line: string, i: number) => {
		let data = { line, index: rollingIndex, length: line.length + 1, i };
		rollingIndex += data.length;
		return data;
	});
	let matchIndex: number | null = null;

	// I'm matching true or false suffix since cache may have stored either
	// making this part of the code match indifferent
	if (text.includes(prefix + searchTerm + suffix)) {
		matchIndex = text.indexOf(prefix + searchTerm + suffix);
	} else if (text.includes(prefix + searchTerm.slice(0, -2) + "f)" + suffix)) {
		matchIndex = text.indexOf(prefix + searchTerm.slice(0, -2) + "f)" + suffix);
	} else if (text.includes(prefix + searchTerm.slice(0, -2) + "t)" + suffix)) {
		matchIndex = text.indexOf(prefix + searchTerm.slice(0, -2) + "t)" + suffix);
	}

	if (matchIndex != null) {
		let index: number = matchIndex as number; // casting as typescript is missing that null has been checked
		let startIndex =
			lines.findIndex((line: any) => line.index > index + prefix.length) - 1;
		let endIndex =
			lines.findIndex(
				(line: any) => line.index > index + prefix.length + searchTerm.length
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

						// find html span element in target that has a data attribute equal to contents
						let span = container;
						if (!span.getAttribute("data"))
							span = container.querySelector(
								`span[data="${dataString}"]`
							) as HTMLSpanElement;

						if (span && span instanceof HTMLSpanElement) {
							// console.log("Found span element:", span);
							// Do something with the span element
							matched = true;

							matchSpan = span;
						} else {
							// console.log("Span element not found");
						}
					}
				}
			});
		}
	}
	return { matched, span: matchSpan };
}
