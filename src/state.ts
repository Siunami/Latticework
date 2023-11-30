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
		return tr["annotations"].length == 2 ? tr["annotations"][0].value : value;
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
					return Object.assign(value, data.references);
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

export const thatAnnotation = Annotation.define<any>();
export const hoverEffect = StateEffect.define<string>();
export const cursorEffect = StateEffect.define<string>();
export const referenceEffect = StateEffect.define<string>();

export let state: any = EditorState.create({
	extensions: [that, references, hoverElement, cursorElement],
});

export function updateThat(that: any) {
	state = state.update({
		annotations: thatAnnotation.of(that),
	}).state;
}

export function updateHover(value: object) {
	state = state.update({
		effects: hoverEffect.of(
			JSON.stringify(Object.assign(value, { type: "hover" }))
		),
	}).state;
}

export function updateCursor(value: object) {
	state = state.update({
		effects: cursorEffect.of(
			JSON.stringify(Object.assign(value, { type: "cursor" }))
		),
	}).state;
}

export function updateReference(value: object) {
	state = state.update({
		effects: referenceEffect.of(
			JSON.stringify(Object.assign(value, { type: "reference" }))
		),
	}).state;
}
