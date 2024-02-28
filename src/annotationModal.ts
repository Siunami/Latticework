import {
	App,
	MarkdownView,
	Modal,
	TAbstractFile,
	TFile,
	WorkspaceLeaf,
	MarkdownRenderer,
	Component,
} from "obsidian";
import {
	collectLeavesByTabHelper,
	getAdjacentTabs,
	getCurrentTabIndex,
} from "./workspace";
import { createClipboardText } from "./clipboard";
import {
	addReferencesToLeaf,
	generateBacklinks,
	getContainerElement,
	getFilename,
	updateBacklinkMarkPositions,
} from "./references";
import { delay } from "./effects";

function createSelection(view: MarkdownView): HTMLSelectElement {
	// get backlink leaf
	let leavesByTab: [WorkspaceLeaf[]] | [] = collectLeavesByTabHelper();

	let currTabIdx = getCurrentTabIndex(leavesByTab, view.containerEl);

	const { rightAdjacentTab, leftAdjacentTab } = getAdjacentTabs(
		leavesByTab,
		currTabIdx,
		""
	);

	let rightFiles = rightAdjacentTab.map((leaf) => {
		return [
			getFilename(leaf),
			getContainerElement(leaf).style.display != "none",
		];
	});

	let leftFiles = leftAdjacentTab.map((leaf) => {
		console.log(getContainerElement(leaf));
		return [
			getFilename(leaf),
			getContainerElement(leaf).style.display != "none",
		];
	});

	let activeFile: string;
	if (rightFiles.length > 0) {
		activeFile = rightFiles.filter((file) => file[1] === true)[0][0] as string;
	} else {
		activeFile = leftFiles.filter((file) => file[1] === true)[0][0] as string;
	}

	// write to document at the bottom
	let allFilenames: string[] = [...rightFiles, ...leftFiles].map(
		(file) => file[0] as string
	);
	let uniqueFilenames = Array.from(new Set(allFilenames));

	// Create a select element
	let select: HTMLSelectElement = document.createElement("select");

	// For each unique filename, create an option element and append it to the select element
	uniqueFilenames.forEach((filename) => {
		let option = document.createElement("option");
		option.value = filename;
		option.text = filename;
		if (filename === activeFile) option.selected = true;
		select.appendChild(option);
	});

	return select;
}

export default class AnnotationModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) return;
		let selection: string = view.editor.getSelection();

		// Create a div element
		const div = document.createElement("div");
		// div.textContent = selection;
		MarkdownRenderer.render(
			this.app,
			'"' + view.editor.getSelection() + '"',
			div,
			// @ts-ignore
			view.file.path,
			new Component()
		);

		// Append the div element to the modal
		this.contentEl.appendChild(div);

		// Create an input element
		const input = document.createElement("textarea");
		input.style.width = "100%";
		input.placeholder = "annotation";

		// Append the input element to the modal
		this.contentEl.appendChild(input);

		let settings = document.createElement("div");
		let fileSelection: HTMLSelectElement = createSelection(view);
		fileSelection.style.width = "fit-content";

		settings.appendChild(fileSelection);

		// Append the select element to the document
		this.contentEl.appendChild(settings);

		input.addEventListener("keydown", async (evt) => {
			if (evt.key === "Enter") {
				evt.preventDefault();
				let reference = createClipboardText(view, selection);

				console.log(reference);

				let allFiles = this.app.vault.getAllLoadedFiles();
				let filePath: TFile = allFiles.filter(
					(file) => file.path === fileSelection.value
				)[0] as TFile;
				console.log(filePath);
				console.log(allFiles);

				// @ts-ignore
				console.log(view.file.path);

				// let fileTFile: TFile = this.app.vault.getAbstractFileByPath(
				// 	// @ts-ignore
				// 	view.file.path
				// ) as TFile;
				if (!filePath) return;
				let fileData = await this.app.vault.read(filePath);

				let results = await this.app.vault.modify(
					filePath,
					fileData + "\n" + reference + " " + input.value
				);

				// console.log(results);
				console.log(this.app.workspace.getLeaf());

				this.close();

				// const transaction = view.state.update({
				// 	changes: { from: results.from, to: results.to, insert: reference },
				// });

				// view.dispatch(transaction);
			}
		});
	}

	onClose() {
		let { contentEl } = this;
		setTimeout(async () => {
			console.log("process again");
			await generateBacklinks();
			await updateBacklinkMarkPositions([this.app.workspace.getLeaf()]);
		}, 400);

		contentEl.empty();
	}
}
