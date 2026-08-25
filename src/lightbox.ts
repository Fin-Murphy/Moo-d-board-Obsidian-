import { App, Modal } from "obsidian";
import { ImageEntry, toResourceUrl } from "./scan";

export class Lightbox extends Modal {
	private entries: ImageEntry[];
	private index: number;
	private imgEl: HTMLImageElement | null = null;

	constructor(app: App, entries: ImageEntry[], index: number) {
		super(app);
		this.entries = entries;
		this.index = index;
	}

	onOpen() {
		this.modalEl.addClass("moodboard-lightbox");
		this.imgEl = this.contentEl.createEl("img", { attr: { alt: "" } });
		this.render();

		this.scope.register([], "ArrowLeft", () => {
			this.step(-1);
			return false;
		});
		this.scope.register([], "ArrowRight", () => {
			this.step(1);
			return false;
		});
	}

	onClose() {
		this.contentEl.empty();
		this.imgEl = null;
	}

	private step(delta: number) {
		this.index = (this.index + delta + this.entries.length) % this.entries.length;
		this.render();
	}

	private render() {
		if (this.imgEl) this.imgEl.src = toResourceUrl(this.entries[this.index]);
	}
}
