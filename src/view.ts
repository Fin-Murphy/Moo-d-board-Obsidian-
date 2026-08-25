import { ItemView, ViewStateResult, WorkspaceLeaf } from "obsidian";
import type MoodBoardPlugin from "./main";
import type { BoardFolder } from "./settings";
import { ImageEntry, scanFolder, toResourceUrl } from "./scan";
import { Lightbox } from "./lightbox";

export const VIEW_TYPE_MOODBOARD = "moodboard-view";

function shuffle<T>(arr: T[]): T[] {
	const a = [...arr];
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
}

// Same thresholds as the web version, but measured against the pane rather than the window --
// an Obsidian pane is arbitrarily narrower than the window it lives in.
function columnCount(width: number): number {
	if (width >= 1024) return 5;
	if (width >= 768) return 4;
	if (width >= 640) return 3;
	return 2;
}

function preloadImage(src: string): Promise<void> {
	return new Promise((resolve) => {
		const img = new Image();
		img.onload = () => resolve();
		img.onerror = () => resolve();
		img.src = src;
	});
}

export class MoodBoardView extends ItemView {
	private plugin: MoodBoardPlugin;
	private folderId: string | null = null;

	private gridEl: HTMLElement | null = null;
	private columnEls: HTMLElement[] = [];

	private tiles: ImageEntry[] = [];
	// Tiles are only appended once their image is fully cached, so nothing ever paints
	// half-loaded; they appear top-down as the sequential preload runs. They are dealt
	// round-robin into fixed flex columns rather than CSS `columns`, which re-balances
	// (and visibly shifts) every tile on append.
	private loadedCount = 0;
	private cols = 2;
	// Stands in for the web version's `cancelled` flag: every reload/reshuffle invalidates
	// the preload loop still running against the previous tile list.
	private generation = 0;

	private observer: ResizeObserver | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: MoodBoardPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_MOODBOARD;
	}

	getDisplayText(): string {
		return this.currentFolder()?.name ?? "Mood board";
	}

	getIcon(): string {
		return "layout-grid";
	}

	getState(): Record<string, unknown> {
		return { folderId: this.folderId };
	}

	async setState(state: unknown, result: ViewStateResult): Promise<void> {
		const next = (state as { folderId?: string } | null)?.folderId ?? null;
		await super.setState(state, result);
		if (next === this.folderId) return;
		this.folderId = next;
		// setState can land either side of onOpen depending on how the leaf was created;
		// onOpen does the first load when the DOM isn't up yet.
		if (this.gridEl) await this.reload();
	}

	async onOpen(): Promise<void> {
		const container = this.contentEl;
		container.empty();
		container.addClass("moodboard-view");

		this.addAction("shuffle", "Reshuffle", () => this.reshuffle());
		this.addAction("refresh-cw", "Rescan folder", () => void this.reload());
		this.addAction("folder-open", "Switch board", () => this.plugin.promptForBoard(this));

		this.gridEl = container.createDiv({ cls: "moodboard-grid" });

		this.observer = new ResizeObserver(() => this.syncColumns());
		this.observer.observe(this.gridEl);

		await this.reload();
	}

	async onClose(): Promise<void> {
		this.generation++;
		this.observer?.disconnect();
		this.observer = null;
		this.gridEl = null;
	}

	async setFolder(id: string): Promise<void> {
		this.folderId = id;
		await this.reload();
		this.app.workspace.requestSaveLayout();
		(this.leaf as unknown as { updateHeader?: () => void }).updateHeader?.();
	}

	async reload(): Promise<void> {
		const grid = this.gridEl;
		if (!grid) return;

		const gen = ++this.generation;
		this.tiles = [];
		this.loadedCount = 0;
		this.columnEls = [];
		grid.empty();

		const folder = this.currentFolder();
		if (!folder) {
			this.renderEmpty("No folder configured yet. Add one in Settings → Mood board.");
			return;
		}

		let entries: ImageEntry[];
		try {
			entries = await scanFolder(folder.path, this.plugin.settings.recursive);
		} catch (err) {
			console.error("Mood board: could not read folder", folder.path, err);
			this.renderEmpty(`Could not read ${folder.path}`);
			return;
		}
		if (gen !== this.generation) return;

		if (entries.length === 0) {
			this.renderEmpty(`No images in ${folder.path}`);
			return;
		}

		this.tiles = shuffle(entries);
		this.cols = columnCount(grid.clientWidth || window.innerWidth);
		this.buildColumns();
		void this.preload(gen);
	}

	reshuffle(): void {
		if (this.tiles.length === 0) return;
		const gen = ++this.generation;
		this.tiles = shuffle(this.tiles);
		this.loadedCount = 0;
		this.buildColumns();
		void this.preload(gen);
	}

	private currentFolder(): BoardFolder | null {
		const { folders } = this.plugin.settings;
		if (this.folderId) return folders.find((f) => f.id === this.folderId) ?? null;
		return folders[0] ?? null;
	}

	private async preload(gen: number): Promise<void> {
		for (let i = 0; i < this.tiles.length; i++) {
			await preloadImage(toResourceUrl(this.tiles[i]));
			if (gen !== this.generation) return;
			this.loadedCount = i + 1;
			this.appendTile(i);
		}
	}

	private buildColumns(): void {
		const grid = this.gridEl;
		if (!grid) return;
		grid.empty();
		this.columnEls = [];
		for (let c = 0; c < this.cols; c++) {
			this.columnEls.push(grid.createDiv({ cls: "moodboard-col" }));
		}
		// Images already loaded once are in cache, so re-dealing them repaints without a flash.
		for (let i = 0; i < this.loadedCount; i++) this.appendTile(i);
	}

	// O(1): appending to a fixed column never disturbs the tiles already placed.
	private appendTile(i: number): void {
		const entry = this.tiles[i];
		const img = this.columnEls[i % this.cols].createEl("img", {
			cls: "moodboard-tile",
			attr: { src: toResourceUrl(entry), alt: "" },
		});
		img.addEventListener("click", () => new Lightbox(this.app, this.tiles, i).open());
	}

	private syncColumns(): void {
		const grid = this.gridEl;
		if (!grid || this.tiles.length === 0) return;
		const next = columnCount(grid.clientWidth);
		if (next === this.cols) return;
		this.cols = next;
		this.buildColumns();
	}

	private renderEmpty(message: string): void {
		this.gridEl?.createDiv({ cls: "moodboard-empty", text: message });
	}
}
