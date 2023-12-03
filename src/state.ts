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

export let references = StateField.define<any[]>({
	create() {
		return [];
	},
	update(value, tr) {
		if (tr.effects.length > 0) {
			try {
				let data = JSON.parse(tr.effects[0].value);
				if (data.type == "reference") {
					// return data.references;
					let set = new Set(
						[...value, ...data.references].map((item) => JSON.stringify(item))
					);
					let uniqueArr = Array.from(set, (item) => JSON.parse(item));
					// return [...new Set([...value, ...data.references])];
					return uniqueArr;
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
					if (value) console.log(Object.assign(value, data));
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
				// console.log(tr.effects[0].value);
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

export let referenceMarks = StateField.define<any[]>({
	create() {
		return [];
	},
	update(value, tr: any) {
		if (
			tr["annotations"].length == 2 &&
			tr["annotations"][0].value.type == "referenceMark"
		) {
			const combinedArray = [
				...value,
				{
					element: tr["annotations"][0].value.element,
					reference: tr["annotations"][0].value.reference,
					id: tr["annotations"][0].value.id,
				},
			];
			return combinedArray;
		} else if (
			tr["annotations"].length == 2 &&
			tr["annotations"][0].value.type == "removeReferenceMark"
		) {
			let index = value
				.map((x: any) => x.reference)
				.indexOf(tr["annotations"][0].value.reference);
			if (index != -1) {
				value.splice(index, 1);
				return value;
			}
		}
		return value;
	},
});

export const thatAnnotation = Annotation.define<any>();
export const hoverEffect = StateEffect.define<string>();
export const cursorEffect = StateEffect.define<string>();
export const referenceEffect = StateEffect.define<string>();
export const referenceMarksAnnotation = Annotation.define<any>();

export let state: any = EditorState.create({
	extensions: [that, references, hoverElement, cursorElement, referenceMarks],
});

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

export function getReferences() {
	return state.field(references);
}

export function updateReference(value: object) {
	state = state.update({
		effects: referenceEffect.of(
			JSON.stringify(Object.assign(value, { type: "reference" }))
		),
	}).state;
}

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
