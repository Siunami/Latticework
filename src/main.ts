import {
	App,
	Plugin,
	PluginSettingTab,
	Setting,
	MarkdownView,
	Editor,
	EditorRange,
	Menu,
	Notice,
	ItemView,
	WorkspaceLeaf,
	WorkspaceSplit,
	TFile,
} from "obsidian";

import { updateHover, updateThat, state } from "./state";
import { highlights, referenceResources } from "./widget";
import { updateClipboard } from "./clipboard";
import { generateReferences } from "./references";

export default class ReferencePlugin extends Plugin {
	onload() {
		// that = this;
		setTimeout(() => {
			generateReferences();
		}, 2000);

		updateThat(this);
		this.registerEditorExtension([
			// emptyLineGutter,
			// placeholders,
			highlights,
			referenceResources,
		]);

		this.registerDomEvent(document, "keydown", async (evt) => {
			if (evt.key == "c" && evt.metaKey && evt.shiftKey) {
				console.log("c");
				updateClipboard();
			} else if (evt.key == "d" && evt.metaKey && evt.shiftKey) {
				console.log("d");
				updateClipboard(true);
			}
		});
	}

	onunload() {}
}
