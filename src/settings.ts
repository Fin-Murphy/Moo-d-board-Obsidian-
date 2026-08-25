import { App, PluginSettingTab, Setting } from "obsidian";
import { basename } from "path";
import type MoodBoardPlugin from "./main";

export interface BoardFolder {
	id: string;
	name: string;
	path: string;
}

export interface MoodBoardSettings {
	folders: BoardFolder[];
	recursive: boolean;
}

export const DEFAULT_SETTINGS: MoodBoardSettings = {
	folders: [],
	recursive: true,
};

interface ElectronRemote {
	remote: {
		dialog: {
			showOpenDialogSync(options: Record<string, unknown>): string[] | undefined;
		};
	};
}

// Obsidian assigns electron.remote itself in the renderer and uses exactly this call for its own
// vault picker, so we mirror it. Returns null when the user cancels.
export function pickFolder(): string | null {
	const electron = require("electron") as ElectronRemote;
	const picked = electron.remote.dialog.showOpenDialogSync({
		title: "Choose mood board folder",
		properties: ["openDirectory", "dontAddToRecent"],
	});
	return picked && picked.length > 0 ? picked[0] : null;
}

export class MoodBoardSettingTab extends PluginSettingTab {
	private plugin: MoodBoardPlugin;

	constructor(app: App, plugin: MoodBoardPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Folders")
			.setDesc("Each folder is its own board. Folders can live anywhere on disk.")
			.addButton((button) =>
				button
					.setButtonText("Add folder")
					.setCta()
					.onClick(async () => {
						const path = pickFolder();
						if (!path) return;
						this.plugin.settings.folders.push({
							id: crypto.randomUUID(),
							name: basename(path),
							path,
						});
						await this.plugin.saveSettings();
						this.display();
					})
			);

		this.plugin.settings.folders.forEach((folder, i) => {
			new Setting(containerEl)
				.setClass("moodboard-folder-row")
				.addText((text) =>
					text
						.setPlaceholder("Board name")
						.setValue(folder.name)
						.onChange(async (value) => {
							folder.name = value;
							await this.plugin.saveSettings();
						})
				)
				.addText((text) => {
					text.setPlaceholder("/absolute/path/to/folder")
						.setValue(folder.path)
						.onChange(async (value) => {
							folder.path = value;
							await this.plugin.saveSettings();
						});
					text.inputEl.addClass("moodboard-path-input");
				})
				.addExtraButton((button) =>
					button
						.setIcon("folder-open")
						.setTooltip("Browse")
						.onClick(async () => {
							const path = pickFolder();
							if (!path) return;
							folder.path = path;
							await this.plugin.saveSettings();
							this.display();
						})
				)
				.addExtraButton((button) =>
					button
						.setIcon("trash-2")
						.setTooltip("Remove")
						.onClick(async () => {
							this.plugin.settings.folders.splice(i, 1);
							await this.plugin.saveSettings();
							this.display();
						})
				);
		});

		new Setting(containerEl)
			.setName("Include subfolders")
			.setDesc("Scan nested folders so their images appear on the same board.")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.recursive).onChange(async (value) => {
					this.plugin.settings.recursive = value;
					await this.plugin.saveSettings();
				})
			);
	}
}
