import { App, FuzzySuggestModal, Notice, Plugin } from "obsidian";
import {
	BoardFolder,
	DEFAULT_SETTINGS,
	MoodBoardSettingTab,
	MoodBoardSettings,
} from "./settings";
import { MoodBoardView, VIEW_TYPE_MOODBOARD } from "./view";

export default class MoodBoardPlugin extends Plugin {
	settings: MoodBoardSettings = DEFAULT_SETTINGS;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.registerView(VIEW_TYPE_MOODBOARD, (leaf) => new MoodBoardView(leaf, this));

		this.addRibbonIcon("layout-grid", "Open mood board", () => void this.openBoard());

		this.addCommand({
			id: "open-mood-board",
			name: "Open mood board",
			callback: () => void this.openBoard(),
		});

		this.addCommand({
			id: "reshuffle-mood-board",
			name: "Reshuffle mood board",
			checkCallback: (checking) => {
				const view = this.app.workspace.getActiveViewOfType(MoodBoardView);
				if (!view) return false;
				if (!checking) view.reshuffle();
				return true;
			},
		});

		this.addSettingTab(new MoodBoardSettingTab(this.app, this));
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	async openBoard(): Promise<void> {
		const { folders } = this.settings;
		if (folders.length === 0) {
			new Notice("Add a folder in Settings → Mood board first.");
			return;
		}
		if (folders.length === 1) {
			await this.activateView(folders[0].id);
			return;
		}
		new BoardSuggestModal(this.app, folders, (folder) => void this.activateView(folder.id)).open();
	}

	promptForBoard(view: MoodBoardView): void {
		const { folders } = this.settings;
		if (folders.length === 0) {
			new Notice("Add a folder in Settings → Mood board first.");
			return;
		}
		new BoardSuggestModal(this.app, folders, (folder) => void view.setFolder(folder.id)).open();
	}

	// A mood board wants width, so it opens as a main-workspace tab rather than in a sidebar.
	private async activateView(folderId: string): Promise<void> {
		const { workspace } = this.app;
		const leaf = workspace.getLeavesOfType(VIEW_TYPE_MOODBOARD)[0] ?? workspace.getLeaf("tab");
		await leaf.setViewState({ type: VIEW_TYPE_MOODBOARD, state: { folderId }, active: true });
		workspace.revealLeaf(leaf);
	}
}

class BoardSuggestModal extends FuzzySuggestModal<BoardFolder> {
	private folders: BoardFolder[];
	private onChoose: (folder: BoardFolder) => void;

	constructor(app: App, folders: BoardFolder[], onChoose: (folder: BoardFolder) => void) {
		super(app);
		this.folders = folders;
		this.onChoose = onChoose;
		this.setPlaceholder("Pick a mood board");
	}

	getItems(): BoardFolder[] {
		return this.folders;
	}

	getItemText(folder: BoardFolder): string {
		return folder.name;
	}

	onChooseItem(folder: BoardFolder): void {
		this.onChoose(folder);
	}
}
