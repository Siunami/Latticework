import {
	EditorState,
	StateField,
	Annotation,
	StateEffect,
} from "@codemirror/state";
import { Backlink } from "./types";
import { App } from "obsidian";
import { isEqual } from "lodash";

export let that = StateField.define<App | null>({
	create() {
		return null;
	},
	update(value, tr: any) {
		if (
			tr["annotations"].length == 2 &&
			tr["annotations"][0].value.type == "that"
		) {
			return tr["annotations"][0].value.that.app;
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

export let backlinkHoverElement = StateField.define<object | null>({
	create() {
		return null;
	},
	update(value, tr) {
		if (tr.effects.length > 0) {
			try {
				let data = JSON.parse(tr.effects[0].value);
				if (data.type == "backlink-start") {
					return Object.assign({}, data);
				} else if (data.type == "backlink-update") {
					if (value) return Object.assign(value, data);
					return data;
				} else if (data.type == "backlink-off") {
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

export let backlinks = StateField.define<Backlink[]>({
	create() {
		return [];
	},
	update(value, tr) {
		if (tr.effects.length > 0) {
			try {
				let data: { type: string; backlinks: Backlink[] } = JSON.parse(
					tr.effects[0].value
				);
				if (data.type == "backlink") {
					console.log(data.backlinks);
					if (data.backlinks.length == 0) return value;
					let referencingLocations = data.backlinks.map(
						(backlink) => backlink.referencingLocation
					);
					let location = referencingLocations[0].filename;
					let referencedLocations = data.backlinks.map(
						(backlink) => backlink.referencedLocation
					);
					let filteredBacklinks = value.filter((backlink) => {
						return backlink.referencingLocation.filename != location;
						return !(
							referencedLocations.includes(backlink.referencedLocation) &&
							referencingLocations.includes(backlink.referencingLocation)
						);
					});
					console.log(filteredBacklinks);
					return [...filteredBacklinks, ...data.backlinks];
				} else if (data.type == "remove-backlink") {
					const obj1 = { foo: "bar" };
					const obj2 = { foo: "bar" };
					const removeBacklink = data.backlinks[0];
					let filteredBacklinks = value.filter((backlink) => {
						return !isEqual(removeBacklink, backlink);
					});

					return filteredBacklinks;
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
export const backlinkHoverEffect = StateEffect.define<string>();
export const backlinkEffect = StateEffect.define<string>();

export let state: any = EditorState.create({
	extensions: [that, backlinks, hoverElement, backlinkHoverElement],
});

// OBSIDIAN THAT

export function getThat(): App {
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

// MOUSE HOVER
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

// BACKLINK HOVER

export function getBacklinkHover() {
	return state.field(backlinkHoverElement);
}

export function updateBacklinkHover(value: object) {
	state = state.update({
		effects: backlinkHoverEffect.of(
			JSON.stringify(Object.assign(value, { type: "backlink-update" }))
		),
	}).state;
}

export function resetBacklinkHover() {
	state = state.update({
		effects: backlinkHoverEffect.of(
			JSON.stringify({
				type: "backlink-off",
			})
		),
	}).state;
}

// BACKLINKS

export function getBacklinks(): Backlink[] {
	return state.field(backlinks);
}

export function updateBacklinks(value: Backlink[]) {
	state = state.update({
		effects: backlinkEffect.of(
			JSON.stringify(Object.assign({ backlinks: value }, { type: "backlink" }))
		),
	}).state;
}

export function removeBacklinks(value: Backlink[]) {
	state = state.update({
		effects: backlinkEffect.of(
			JSON.stringify(
				Object.assign({ backlinks: value }, { type: "remove-backlink" })
			)
		),
	}).state;
}
