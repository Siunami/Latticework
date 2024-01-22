import { EditorView, Decoration, DecorationSet } from "@codemirror/view";
import { StateField, StateEffect } from "@codemirror/state";
import { SVG_HOVER_COLOR } from "./constants";

const addHighlight = StateEffect.define<{ from: number; to: number }>({
	map: ({ from, to }, change) => ({
		from: change.mapPos(from),
		to: change.mapPos(to),
	}),
});

const addDefaultHighlight = StateEffect.define<{ from: number; to: number }>({
	map: ({ from, to }, change) => ({
		from: change.mapPos(from),
		to: change.mapPos(to),
	}),
});

const resetHighlight = StateEffect.define<{ from: number; to: number }>({
	map: ({ from, to }, change) => ({
		from: change.mapPos(from),
		to: change.mapPos(to),
	}),
});

const highlightField = StateField.define<DecorationSet>({
	create() {
		return Decoration.none;
	},
	update(higlights, tr) {
		higlights = higlights.map(tr.changes);
		for (let e of tr.effects)
			if (e.is(addDefaultHighlight)) {
				higlights = higlights.update({
					add: [defaultHighlightMark.range(e.value.from, e.value.to)],
				});
			} else if (e.is(addHighlight)) {
				higlights = higlights.update({
					add: [highlightMark.range(e.value.from, e.value.to)],
				});
			} else if (e.is(resetHighlight)) {
				higlights = higlights.update({
					filter: (from, to) => {
						return !(from === e.value.from && to === e.value.to);
					},
				});
			}
		return higlights;
	},
	provide: (f) => EditorView.decorations.from(f),
});

const highlightMark = Decoration.mark({ class: "highlight" });
const defaultHighlightMark = Decoration.mark({ class: "default-highlight" });
const theme = EditorView.baseTheme({});
const highlightTheme = EditorView.baseTheme({
	".highlight": {
		"background-color":
			"hsl(calc(var(--accent-h) - 3), calc(var(--accent-s) * 1.02), calc(var(--accent-l) * 1.3))",
		color: "black",
	},
});
// const defaultHighlightTheme = EditorView.baseTheme({
// 	".highlight": {
// 		"background-color":
// 			"hsl(calc(var(--accent-h) - 3), calc(var(--accent-s) * 1.02), calc(var(--accent-l) * 1.43))",
// 		color: "black",
// 	},
// });
const defaultHighlightTheme = EditorView.baseTheme({
	".default-highlight": {
		"background-color":
			"hsl(calc(var(--accent-h) - 3), calc(var(--accent-s) * 1.02), calc(var(--accent-l) * 1.43))",
		color: "black",
	},
});

export function highlightSelection(view: EditorView, from: number, to: number) {
	let effects: StateEffect<unknown>[] = [addHighlight.of({ from, to })];

	if (!effects.length) return false;

	if (!view.state.field(highlightField, false))
		effects.push(StateEffect.appendConfig.of([highlightField, theme]));

	view.dispatch({ effects });
	return true;
}

// have a function that adds subtle highlights to state
export function defaultHighlightSelection(
	view: EditorView,
	from: number,
	to: number
) {
	let effects: StateEffect<unknown>[] = [addDefaultHighlight.of({ from, to })];

	if (!effects.length) return false;

	// let filteredEffects: StateEffect<unknown>[] =
	// 	view.state.selection.ranges.filter(
	// 		({ from, to }) => !effects.includes(addDefaultHighlight.of({ from, to }))
	// 	);

	console.log("DEFAULT HIGHLIGHT SELECTION RANGES");
	console.log(view.state.selection.ranges);
	console.log(from, to);

	// effects = [...effects, ...filteredEffects];

	if (!view.state.field(highlightField, false))
		effects.push(StateEffect.appendConfig.of([highlightField, theme]));

	view.dispatch({ effects });

	return true;
}

export function removeHighlight(view: EditorView, from: number, to: number) {
	let effects: StateEffect<unknown>[] = [resetHighlight.of({ from, to })];

	if (!effects.length) return false;

	view.dispatch({ effects });
	return true;
}

// update remove highlights so that
export function removeHighlights(view: EditorView) {
	if (!view) return;

	let effects: StateEffect<unknown>[] = view.state.selection.ranges.map(
		({ from, to }) => resetHighlight.of({ from, to })
	);
	if (effects.length) {
		view.dispatch({ effects });
		return true;
	}
	return false;
}

// I want to add a bunch of highlights to the state that use some lighter highlight theme
// And then remove them and update the highlights on each generation of backlinkMarkPositions
