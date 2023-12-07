import {
	EditorState,
	StateField,
	Annotation,
	StateEffect,
	Extension,
	RangeSetBuilder,
	Transaction,
	Text,
} from "@codemirror/state";
import { Backlink } from "./types";
import { updateBacklinkMarkPositions } from "./references";

export let that = StateField.define<any>({
	create() {
		return null;
	},
	update(value, tr: any) {
		if (
			tr["annotations"].length == 2 &&
			tr["annotations"][0].value.type == "that"
		) {
			return tr["annotations"][0].value.that;
		}
		return value;
	},
});

export let hoveredCursor = StateField.define<any>({
	create() {
		return null;
	},
	update(value, tr: any) {
		if (
			tr["annotations"].length == 2 &&
			tr["annotations"][0].value.type == "hoveredCursor"
		) {
			return tr["annotations"][0].value.cursor;
		} else if (
			tr["annotations"].length == 2 &&
			tr["annotations"][0].value.type == "removeHoveredCursor"
		) {
			return null;
		}
		return value;
	},
});

export let backlinks = StateField.define<Backlink[]>({
	create() {
		return [];
	},
	update(value, tr) {
		/*
			I  want to get the current activeLeaf and recompute the references
			merge this into the references field
		*/

		if (tr.effects.length > 0) {
			try {
				let data: { type: string; backlinks: Backlink[] } = JSON.parse(
					tr.effects[0].value
				);
				if (data.type == "backlink") {
					if (data.backlinks.length == 0) return value;
					let referencingLocation =
						data.backlinks[0]["referencingLocation"]["filename"];
					let filteredValues = value.filter(
						(backlink) =>
							backlink.referencingLocation.filename != referencingLocation
					);
					return [...filteredValues, ...data.backlinks];
				}
				return value;
			} catch (e) {
				console.log(e);
				return value;
			}
		}
		return value;
	},
});

export let hoverElement = StateField.define<object | null>({
	create() {
		return null;
	},
	update(value, tr) {
		if (tr.effects.length > 0) {
			try {
				let data = JSON.parse(tr.effects[0].value);
				if (data.type == "hover-start") {
					return Object.assign({}, data);
				} else if (data.type == "hover") {
					if (value) return Object.assign(value, data);
					return data;
				} else if (data.type == "hover-off") {
					return null;
				}
				return value;
			} catch (e) {
				console.log(e);
				return value;
			}
		}
		return value;
	},
});

export let cursorElement = StateField.define<object | null>({
	create() {
		return null;
	},
	update(value, tr) {
		if (tr.effects.length > 0) {
			try {
				let data = JSON.parse(tr.effects[0].value);
				if (data.type == "cursor-start") {
					return {};
				} else if (data.type == "cursor") {
					if (value) return Object.assign(value, data);
					return data;
				} else if (data.type == "cursor-off") {
					return null;
				}
				return value;
			} catch (e) {
				console.log(e);
				return value;
			}
		}
		return value;
	},
});

export let editorChange = StateField.define<null>({
	create() {
		return null;
	},
	update(value, tr) {
		if (tr.effects.length > 0) {
			try {
				let data = JSON.parse(tr.effects[0].value);
				if (data.type == "sync") {
					updateBacklinkMarkPositions();
					return value;
				}
				return value;
			} catch (e) {
				console.log(e);
				return value;
			}
		}
		return value;
	},
});

export const thatAnnotation = Annotation.define<any>();
export const hoveredCursorAnnotation = Annotation.define<any>();
export const hoverEffect = StateEffect.define<string>();
export const cursorEffect = StateEffect.define<string>();
export const backlinkEffect = StateEffect.define<string>();
export const referenceMarksAnnotation = Annotation.define<any>();

export let state: any = EditorState.create({
	extensions: [
		that,
		hoveredCursor,
		backlinks,
		hoverElement,
		cursorElement,
		editorChange,
	],
});

export function syncBacklinks() {
	state = state.update({
		effects: backlinkEffect.of(JSON.stringify({ type: "sync" })),
	}).state;
}

export function getThat() {
	return state.field(that);
}

export function updateThat(that: any) {
	state = state.update({
		annotations: thatAnnotation.of({
			type: "that",
			that,
		}),
	}).state;
}

export function getHoveredCursor() {
	return state.field(hoveredCursor);
}

export function updateHoveredCursor(cursor: HTMLOrSVGElement) {
	state = state.update({
		annotations: hoveredCursorAnnotation.of({
			type: "hoveredCursor",
			cursor,
		}),
	}).state;
}

export function removeHoveredCursor() {
	state = state.update({
		annotations: hoveredCursorAnnotation.of({
			type: "removeHoveredCursor",
		}),
	}).state;
}

export function getHover() {
	return state.field(hoverElement);
}

export function updateHover(value: object) {
	state = state.update({
		effects: hoverEffect.of(
			JSON.stringify(Object.assign(value, { type: "hover" }))
		),
	}).state;
}

export function resetHover() {
	state = state.update({
		effects: hoverEffect.of(
			JSON.stringify({
				type: "hover-off",
			})
		),
	}).state;
}

export function getCursor() {
	return state.field(cursorElement);
}

export function updateCursor(value: object) {
	state = state.update({
		effects: cursorEffect.of(
			JSON.stringify(Object.assign(value, { type: "cursor" }))
		),
	}).state;
}

export function resetCursor() {
	state = state.update({
		effects: cursorEffect.of(
			JSON.stringify({
				type: "cursor-off",
			})
		),
	}).state;
}

export function getBacklinks(): Backlink[] {
	return state.field(backlinks);
}

// NOTE: I have no idea what this is doing.
export function updateBacklinks(value: Backlink[]) {
	state = state.update({
		effects: backlinkEffect.of(
			JSON.stringify(Object.assign({ backlinks: value }, { type: "backlink" }))
		),
	}).state;
}
/*
export function getReferenceMarks() {
	return state.field(referenceMarks);
}

// Need to check before adding to array if reference exists already
// Just compare "reference" data object in the span
export function updateReferenceMarks(
	value: object,
	reference: object,
	id: string
) {
	state = state.update({
		annotations: referenceMarksAnnotation.of({
			type: "referenceMark",
			element: value,
			reference,
			id,
		}),
	}).state;
}

export function removeReferenceMark(reference: object) {
	let marks = state.field(referenceMarks);
	let index = marks.map((x: any) => x.reference).indexOf(reference);
	if (index != -1) {
		marks.splice(index, 1);
		state = state.update({
			annotations: referenceMarksAnnotation.of({
				type: "removeReferenceMark",
				reference,
			}),
		}).state;
	}
}
*/
