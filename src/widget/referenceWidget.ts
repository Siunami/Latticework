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
	generateReferences,
	createReferenceMark,
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
		console.log(content);

		// // const content = match[1];
		// let decoration = Decoration.replace({
		// 	widget: new ReferenceWidget(content ? content[1] : "", view),
		// });
		// console.log(content);

		// const regex = /\[\u2197\]\(urn:([^)]*)\)/g;
		// let content = this.name;
		console.log("content !!!!!");
		console.log(content);
		console.log(this.view);
		// let workspaceTabs = this.view.contentDOM.closest(".workspace-tabs");

		// console.log(workspaceTabs);
		// let title =
		// 	workspaceTabs.containerEl.querySelector(".view-header-title")?.innerHTML +
		// 	".md";
		// console.log(content[1].split(":"));
		// let [prefix, text, suffix, file, from, to] = content.split(":");
		// prefix = decodeURIComponentString(prefix);
		// text = decodeURIComponentString(text);
		// suffix = decodeURIComponentString(suffix);
		// file = decodeURIComponentString(file);
		// from = decodeURIComponentString(from);
		// to = decodeURIComponentString(to);

		// createReferenceMark({
		// 	prefix,
		// 	text,
		// 	suffix,
		// 	file,
		// 	from,
		// 	to,
		// 	sourceFile: title,
		// 	dataString: content,
		// });

		console.log(this.view);
		console.log("new reference");

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
		// const regex = /\[↗\]\(urn:([^)]*)\)/g;
		// let match = regex.exec(this.name);
		// if (match) {
		// 	const content = match[1];
		// 	span.setAttribute("data", content);
		// }
		span.setAttribute("data", this.name);

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

function test(match: RegExpExecArray, view: EditorView) {
	console.log(match);
	console.log(view);
	// const regex = /\[↗\]\(urn:([^)]*)\)/g;
	// let content = regex.exec(match[0]) != null ? regex.exec(match[0]) : "";

	// // const content = match[1];
	// let decoration = Decoration.replace({
	// 	widget: new ReferenceWidget(content ? content[1] : "", view),
	// });
	// console.log(content);

	const regex = /\[\u2197\]\(urn:([^)]*)\)/g;
	let content = regex.exec(match[0]);
	console.log("content !!!!!");
	console.log(content);
	let workspaceTabs = view.contentDOM.closest(".workspace-tabs");
	if (workspaceTabs != null && content) {
		let title =
			workspaceTabs.querySelector(".view-header-title")?.innerHTML + ".md";
		let dataString = content[1];
		let [prefix, text, suffix, file, from, to] = dataString.split(":");

		createReferenceMark({
			prefix,
			text,
			suffix,
			file,
			from,
			to,
			sourceFile: title,
			dataString: regex.exec(match[0]),
		});
	}
}

const referenceDecoration = (match: RegExpExecArray, view: EditorView) => {
	let decoration = Decoration.replace({
		widget: new ReferenceWidget(match[0], view),
	});
	return decoration;
};

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
