import { Vault, normalizePath, type ListedFiles, type Stat } from "obsidian";
import { basename, dirname } from "./path";
import {
	localChangeTime,
	recordMatches,
	type DeletionRecords,
} from "./deletion-history";

type RecoveryInfo = { deletedAt: number; originalPath?: string };

export const TRASH_ROOT = normalizePath(".trash");

export type TrashItem = TrashedFile | TrashedFolder;

export class Trash {
	private refreshVersion = 0;
	private readonly root = new TrashedFolder(
		this.vault,
		TRASH_ROOT,
		null,
		null,
	);

	constructor(
		private readonly vault: Vault,
		private readonly records: DeletionRecords = {},
		private readonly onChanged: () => Promise<void> = () =>
			Promise.resolve(),
	) {}

	async forget(item: TrashItem): Promise<void> {
		for (const path of Object.keys(this.records)) {
			if (path === item.path || path.startsWith(`${item.path}/`))
				delete this.records[path];
		}
		await this.onChanged();
	}

	get items(): TrashItem[] {
		return this.root.children;
	}

	get isEmpty(): boolean {
		return this.root.isEmpty;
	}

	async refresh(): Promise<void> {
		const version = ++this.refreshVersion;
		if (await this.vault.adapter.exists(this.root.path)) {
			const trashedFiles = await this.vault.adapter.list(this.root.path);
			const items = await this.buildItems(trashedFiles, this.root);
			if (version === this.refreshVersion) this.root.children = items;
		} else {
			if (version === this.refreshVersion) this.root.children = [];
		}
	}

	async empty(): Promise<void> {
		if (await this.vault.adapter.exists(this.root.path)) {
			await this.root.remove();
		}

		this.root.children = [];
		await this.forget(this.root);
	}

	private recoveryInfo(
		path: string,
		stat: Stat | null,
		parent: TrashedFolder | null,
	): RecoveryInfo | undefined {
		const record = this.records[path];
		if (record && recordMatches(record, stat)) return record;
		if (parent?.deletedAt)
			return {
				deletedAt: parent.deletedAt,
				originalPath: parent.originalPath
					? `${parent.originalPath}/${basename(path)}`
					: undefined,
			};
		return undefined;
	}

	private async buildItems(
		trashedFiles: ListedFiles,
		parent: TrashedFolder | null,
	): Promise<TrashItem[]> {
		const items = [];

		for (const path of trashedFiles.folders.sort(this.compareName)) {
			const files = await this.vault.adapter.list(path);

			const stat = await this.vault.adapter.stat(path);
			const trashedFolder = new TrashedFolder(
				this.vault,
				path,
				stat,
				parent,
				this.recoveryInfo(path, stat, parent),
				await localChangeTime(this.vault.adapter, path),
			);
			items.push(trashedFolder);

			trashedFolder.children = await this.buildItems(
				files,
				trashedFolder,
			);
		}

		for (const path of trashedFiles.files.sort(this.compareName)) {
			const stat = await this.vault.adapter.stat(path);
			const trashedFile = new TrashedFile(
				this.vault,
				path,
				stat,
				parent,
				this.recoveryInfo(path, stat, parent),
				await localChangeTime(this.vault.adapter, path),
			);
			items.push(trashedFile);
		}

		return items;
	}

	private readonly collator = new Intl.Collator(undefined, {
		sensitivity: "base",
	});
	private readonly compareName = (a: string, b: string) =>
		this.collator.compare(a, b);
}

abstract class TrashedBase {
	readonly path: string;
	readonly basename: string;
	readonly size: number;
	readonly deletedAt: number | null;
	readonly originalPath?: string;
	readonly estimatedAt: number | null;

	constructor(
		readonly vault: Vault,
		path: string,
		stat: Stat | null,
		readonly parent: TrashedFolder | null,
		recovery?: RecoveryInfo,
		estimatedAt: number | null = null,
	) {
		this.path = normalizePath(path);
		this.basename = basename(this.path);
		this.size = stat?.size || 0;
		this.deletedAt = recovery?.deletedAt ?? null;
		this.originalPath = recovery?.originalPath;
		this.estimatedAt = estimatedAt;
	}

	get restorePath(): string {
		return normalizePath(
			this.originalPath ?? this.path.replace(`${TRASH_ROOT}/`, ""),
		);
	}

	protected async restore(): Promise<boolean> {
		const restorePath = this.restorePath;

		if (await this.vault.adapter.exists(restorePath)) {
			return false;
		}

		const restoreParentDir = dirname(restorePath);

		if (!(await this.vault.adapter.exists(restoreParentDir))) {
			await this.vault.adapter.mkdir(restoreParentDir);
		}

		await this.vault.adapter.rename(this.path, restorePath);

		return true;
	}

	abstract remove(): Promise<void>;
}

class TrashedFile extends TrashedBase {
	readonly kind = "file";

	async restore(): Promise<boolean> {
		const restored = await super.restore();

		if (restored) {
			this.parent?.removeChild(this);
		}

		return restored;
	}

	async remove(): Promise<void> {
		await this.vault.adapter.remove(this.path);
		this.parent?.removeChild(this);
	}
}

class TrashedFolder extends TrashedBase {
	readonly kind = "folder";

	children: TrashItem[] = [];

	get isEmpty(): boolean {
		return this.children.length === 0;
	}

	async restore(): Promise<boolean> {
		const restored = await super.restore();

		if (restored) {
			this.parent?.removeChild(this);
		}

		return restored;
	}

	async remove(): Promise<void> {
		await this.vault.adapter.rmdir(this.path, true);
		this.parent?.removeChild(this);
	}

	removeChild(child: TrashItem): void {
		const index = this.children.indexOf(child);

		if (index !== -1) {
			this.children.splice(index, 1);
		}
	}
}
