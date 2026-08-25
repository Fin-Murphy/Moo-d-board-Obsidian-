import { promises as fs } from "fs";
import { extname, join } from "path";
import { pathToFileURL } from "url";
import { Platform } from "obsidian";

export interface ImageEntry {
	path: string;
	mtimeMs: number;
}

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".bmp", ".svg"]);

export async function scanFolder(root: string, recursive: boolean): Promise<ImageEntry[]> {
	const out: ImageEntry[] = [];

	const walk = async (dir: string) => {
		const entries = await fs.readdir(dir, { withFileTypes: true });
		for (const entry of entries) {
			if (entry.name.startsWith(".")) continue;
			const full = join(dir, entry.name);
			if (entry.isDirectory()) {
				if (recursive) await walk(full);
			} else if (IMAGE_EXTS.has(extname(entry.name).toLowerCase())) {
				const stat = await fs.stat(full);
				out.push({ path: full, mtimeMs: stat.mtimeMs });
			}
		}
	};

	await walk(root);
	return out;
}

// Obsidian's desktop adapter serves local files through a privileged scheme whose prefix is
// swapped in at startup (Platform.resourcePathPrefix, "file:///" until then). Reproducing that
// transform is what lets us render images living outside the vault. Not in obsidian.d.ts, hence
// the cast. The ?mtime suffix busts the cache when a file is replaced on disk.
export function toResourceUrl(entry: ImageEntry): string {
	const prefix = (Platform as unknown as { resourcePathPrefix: string }).resourcePathPrefix;
	return prefix + pathToFileURL(entry.path).href.slice("file:///".length) + "?" + entry.mtimeMs;
}
