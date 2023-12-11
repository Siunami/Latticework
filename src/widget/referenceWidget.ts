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

import {
	openReference,
	createReferenceIcon,
	generateBacklinks,
	createBacklinkMark,
} from "../references";

import { decodeURIComponentString } from "src/utils";

/* new placeholder */
class ReferenceWidget extends WidgetType {
	constructor(private name: string, private view: EditorView) {
		super();
	}

	eq(other: ReferenceWidget) {
		return this.name === other.name;
	}

	toDOM() {
		const regex = /\[↗\]\(urn:([^)]*)\)/g;
		let content = regex.exec(this.name);

		// let workspaceTabs = this.view.contentDOM.closest(".workspace-tabs");

		// if (workspaceTabs && content) {
		// 	let title =
		// 		workspaceTabs.querySelector(".view-header-title")?.innerHTML + ".md";
		// 	let [prefix, text, suffix, file, from, to] = content[1].split(":");
		// 	prefix = decodeURIComponentString(prefix);
		// 	text = decodeURIComponentString(text);
		// 	suffix = decodeURIComponentString(suffix);
		// 	file = decodeURIComponentString(file);
		// 	from = decodeURIComponentString(from);
		// 	to = decodeURIComponentString(to);

		// 	// createReferenceMark({
		// 	// 	prefix,
		// 	// 	text,
		// 	// 	suffix,
		// 	// 	file,
		// 	// 	from,
		// 	// 	to,
		// 	// 	sourceFile: title,
		// 	// 	dataString: content[1],
		// 	// });
		// }

		const { span, svg } = createReferenceIcon();

		if (content) span.setAttribute("data", content[1]);

		span.addEventListener("click", openReference);
		return span;
	}
}

const referenceDecoration = (match: RegExpExecArray, view: EditorView) => {
	let decoration = Decoration.replace({
		widget: new ReferenceWidget(match[0], view),
	});
	return decoration;
};

const referenceMatcher = new MatchDecorator({
	// regexp: /\[\u2197\]\(urn:[\s\S^\)]*\)/g,
	regexp: /\[\u2197\]\(urn:([^:]*:){5}[^:]*\)/g,
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
