import {
	App,
	MarkdownView,
	Modal,
	TFile,
	WorkspaceLeaf,
	MarkdownRenderer,
	Component,
	TAbstractFile,
} from "obsidian";
import {
	collectLeavesByTabHelper,
	getAdjacentTabs,
	getCurrentTabIndex,
} from "./workspace";
import { createClipboardText } from "./clipboard";
import {
	generateBacklinks,
	getContainerElement,
	getFilename,
	updateBacklinkMarkPositions,
} from "./references";

function createSelection(view: MarkdownView): HTMLSelectElement {
	// get backlink leaf
	let leavesByTab: [WorkspaceLeaf[]] | [] = collectLeavesByTabHelper();

	let currTabIdx = getCurrentTabIndex(leavesByTab, view.containerEl);

	const { rightAdjacentTab, leftAdjacentTab } = getAdjacentTabs(
		leavesByTab,
		currTabIdx,
		""
	);

	let rightFiles = rightAdjacentTab
		.filter((leaf) => {
			// console.log(leaf);
			return leaf.view instanceof MarkdownView;
		})
		.map((leaf) => {
			return [
				getFilename(leaf),
				getContainerElement(leaf).style.display != "none",
			];
		});

	let leftFiles = leftAdjacentTab
		.filter((leaf) => {
			// console.log(leaf);
			return leaf.view instanceof MarkdownView;
		})
		.map((leaf) => {
			return [
				getFilename(leaf),
				getContainerElement(leaf).style.display != "none",
			];
		});

	let activeFile: string;
	if (rightFiles.length > 0 || leftFiles.length > 0) {
		if (rightFiles.length > 0) {
			activeFile = rightFiles.filter(
				(file) => file[1] === true
			)[0][0] as string;
		} else if (leftFiles.length > 0) {
			activeFile = leftFiles.filter((file) => file[1] === true)[0][0] as string;
		}

		// write to document at the bottom
		let allFilenames: string[] = [...rightFiles, ...leftFiles].map(
			(file) => file[0] as string
		);
		let uniqueFilenames = Array.from(
			// @ts-ignore
			new Set([...allFilenames, view.file.path])
		);

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
	} else {
		// @ts-ignore
		activeFile = view.file.path;

		let select: HTMLSelectElement = document.createElement("select");

		let option = document.createElement("option");
		option.value = activeFile;
		option.text = activeFile;
		option.selected = true;
		select.appendChild(option);

		return select;
	}
}

export async function createAnnotation(
	selection: string,
	fileSelection: string,
	input: string = ""
) {
	const view = this.app.workspace.getActiveViewOfType(MarkdownView);

	// get backlink leaf
	let leavesByTab: [WorkspaceLeaf[]] | [] = collectLeavesByTabHelper();

	let currTabIdx = getCurrentTabIndex(leavesByTab, view.containerEl);

	const { rightAdjacentTab, leftAdjacentTab } = getAdjacentTabs(
		leavesByTab,
		currTabIdx,
		""
	);

	let reference = createClipboardText(view, selection);

	if ([...rightAdjacentTab, ...leftAdjacentTab].length != 0) {
		let allFiles = this.app.vault.getAllLoadedFiles();
		let filePath: TFile = allFiles.filter(
			(file: TAbstractFile) =>
				file.path === fileSelection ||
				file.path.split("/")[file.path.split("/").length - 1] === fileSelection
		)[0] as TFile;

		if (!filePath) {
			console.error("file not found");
			return;
		}

		let fileData = await this.app.vault.read(filePath);
		let results = await this.app.vault.modify(
			filePath,
			fileData + "\n" + reference + " " + input
		);
	} else {
		let currentFilePath: TFile = this.app.workspace.getActiveFile() as TFile;

		let currentFileData = await this.app.vault.read(currentFilePath);
		let currentResults = await this.app.vault.modify(
			currentFilePath,
			currentFileData + "\n" + reference + " " + input
		);
	}
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
				await createAnnotation(selection, fileSelection.value, input.value);
				this.close();
			}
		});
	}

	onClose() {
		let { contentEl } = this;
		setTimeout(async () => {
			await generateBacklinks();
			await updateBacklinkMarkPositions([this.app.workspace.getLeaf()]);
		}, 400);

		contentEl.empty();
	}
}
