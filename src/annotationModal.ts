import { App, MarkdownView, Modal, View, WorkspaceLeaf } from "obsidian";
import {
	collectLeavesByTabHelper,
	getAdjacentTabs,
	getCurrentTabIndex,
} from "./workspace";
import { createClipboardText } from "./clipboard";
import { getContainerElement, getFilename } from "./references";

export default class AnnotationModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		// let { contentEl } = this;
		// let modal = new Modal(this.app);

		// console.log(modal);

		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) return;
		let selection: string = view.editor.getSelection();
		console.log(selection);

		// Create a div element
		const div = document.createElement("div");
		div.textContent = selection;

		// Append the div element to the modal
		this.contentEl.appendChild(div);

		// Create an input element
		const input = document.createElement("input");
		input.type = "text";
		input.placeholder = "Enter your annotation";

		// Append the input element to the modal
		this.contentEl.appendChild(input);

		input.addEventListener("keydown", async (evt) => {
			console.log(evt);
			console.log(evt.key);
			if (evt.key === "Enter") {
				evt.preventDefault();
				console.log(input.value);
				let reference = createClipboardText(view, selection);
				console.log(reference);

				// get backlink leaf
				let leavesByTab: [WorkspaceLeaf[]] | [] = collectLeavesByTabHelper();

				let currTabIdx = getCurrentTabIndex(leavesByTab, view.containerEl);

				console.log(currTabIdx);
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
				console.log(rightFiles);
				console.log(leftFiles);

				let activeFile: any;
				if (rightFiles.length > 0) {
					activeFile = rightFiles.filter((file) => file[1] === true)[0];
				} else {
					activeFile = leftFiles.filter((file) => file[1] === true)[0];
				}

				console.log(activeFile);
				// write to document at the bottom
			}
		});
	}

	onClose() {
		let { contentEl } = this;
		contentEl.empty();
	}
}
