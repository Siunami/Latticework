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

import { openReference, createReferenceIcon } from "../references";

/* new placeholder */
class ReferenceWidget extends WidgetType {
	constructor(private name: string, private view: EditorView) {
		super();
	}

	eq(other: ReferenceWidget) {
		return this.name === other.name;
	}

	toDOM() {
		// if (this.name.split("|").length != 4) {
		// 	console.log("invalid placeholder");
		// 	const regex = /\[↗\]\(urn:([^)]*)\)/g;
		// 	let match = regex.exec(this.name);
		// 	const content = match[1];
		// 	console.log(content); // Output: 'example'
		// 	console.log(content.split(":"));
		// }
		const span = createReferenceIcon();

		// span.style.backgroundColor = "rgb(187, 215, 230)";
		span.style.color = "black";
		span.setAttribute("class", "block");
		const regex = /\[↗\]\(urn:([^)]*)\)/g;
		let match = regex.exec(this.name);
		if (match) {
			const content = match[1];
			span.setAttribute("data", content);
		}

		span.addEventListener("mouseenter", async () => {
			span.style.backgroundColor = "rgb(187, 215, 230)";
		});

		span.addEventListener("mouseleave", async () => {
			span.style.backgroundColor = "rgba(0, 0, 0, 0)";
		});

		span.addEventListener("click", openReference);
		return span;
	}
}

const referenceDecoration = (match: RegExpExecArray, view: EditorView) =>
	Decoration.replace({
		widget: new ReferenceWidget(match[0], view),
	});

const referenceMatcher = new MatchDecorator({
	regexp: /\[\u2197\]\(urn:[\s\S^\)]*\)/g,
	decoration: (match, view, pos) => {
		return referenceDecoration(match, view);
	},
});

export const referenceResources = ViewPlugin.fromClass(
	class {
		referenceResources: DecorationSet;
		constructor(view: EditorView) {
			this.referenceResources = referenceMatcher.createDeco(view);
		}
		update(update: ViewUpdate) {
			this.referenceResources = referenceMatcher.updateDeco(
				update,
				this.referenceResources
			);
		}
		destroy() {
			this.referenceResources = Decoration.none;
		}
	},
	{
		decorations: (instance) => instance.referenceResources,
		provide: (plugin) =>
			EditorView.atomicRanges.of((view) => {
				return view.plugin(plugin)?.referenceResources || Decoration.none;
			}),
	}
);
