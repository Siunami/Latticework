import {
	EditorView,
	WidgetType,
	Decoration,
	DecorationSet,
	ViewPlugin,
	ViewUpdate,
	MatchDecorator,
	gutter,
	GutterMarker,
} from "@codemirror/view";

/* highlight */
class HighlighterWidget extends WidgetType {
	constructor(private name: string, private view: EditorView) {
		super();
	}

	eq(other: HighlighterWidget) {
		return this.name === other.name;
	}

	toDOM() {
		const span = document.createElement("fragment");
		// console.log(this);
		span.textContent = this.name;
		span.style.backgroundColor = "rgb(187, 215, 230)";
		span.style.color = "black";

		return span;
	}
}

const highlighterDecoration = (match: RegExpExecArray, view: EditorView) =>
	Decoration.replace({
		widget: new HighlighterWidget(match[1], view),
	});

const highlightMatcher = new MatchDecorator({
	// regexp: /\(\((\w+)\)\)/g,
	regexp: /\+\+\+(.*?)\+\+\+/g,
	// regexp: /\(\(([^|)]+)\|([^|)]+)\|([^|)]+)\|([^|)]+)\)\)/g,
	// regexp: /\(\(([^-*]+)-\*-([^-*]+)-\*-([^-*]+)-\*-([^-*]+)\)\)/g,
	decoration: (match, view, pos) => {
		return highlighterDecoration(match, view);
	},
});

export const highlights = ViewPlugin.fromClass(
	class {
		highlights: DecorationSet;
		constructor(view: EditorView) {
			this.highlights = highlightMatcher.createDeco(view);
		}
		update(update: ViewUpdate) {
			this.highlights = highlightMatcher.updateDeco(update, this.highlights);
		}
		destroy() {
			this.highlights = Decoration.none;
		}
	},
	{
		decorations: (instance) => instance.highlights,
		provide: (plugin) =>
			EditorView.atomicRanges.of((view) => {
				return view.plugin(plugin)?.highlights || Decoration.none;
			}),
	}
);
