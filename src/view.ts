import { App, ItemView, Modal, Notice, Setting, WorkspaceLeaf } from "obsidian";
import type { ComponentProps, SvelteComponent } from "svelte";
import { createClassComponent } from "svelte/legacy";
import type { SortOrder } from "./deletion-history";
import { formatDeletionTime } from "./sorting";
import { Trash, type TrashItem } from "./models";
import TrashView from "./views/TrashView.svelte";

export type TrashExplorerViewNode = {
	item: TrashItem;
	nodes: TrashExplorerViewNode[];
};

export const VIEW_TYPE = "trash-explorer";

export class TrashExplorerView extends ItemView {
	icon = "trash";
	navigation = false;

	private component:
		| SvelteComponent<ComponentProps<typeof TrashView>>
		| undefined;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly trash: Trash,
		private readonly preferences: {
			getSortOrder: () => SortOrder;
			setSortOrder: (order: SortOrder) => Promise<void>;
		},
	) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Trash explorer";
	}

	async onOpen(): Promise<void> {
		this.component = createClassComponent({
			component: TrashView,
			target: this.contentEl,
			props: {
				trash: this.trash,
				initialSortOrder: this.preferences.getSortOrder(),
				changeSortOrder: (order: SortOrder) => {
					void this.preferences
						.setSortOrder(order)
						.catch(() => new Notice("排序偏好保存失败"));
				},
				refreshTrash: () => {
					void this.reloadTrash();
				},
				previewItem: (item: TrashItem) => {
					new PreviewModal(this.app, item, async () => {
						if (await this.restoreFile(item)) await this.refresh();
					}).open();
				},
				restoreItem: async (item: TrashItem) => {
					if (await this.restoreFile(item)) {
						await this.refresh();
					}
				},
				deleteItem: async (item: TrashItem) => {
					if (await this.deleteFile(item)) {
						await this.refresh();
					}
				},
			},
		});

		await this.refresh();
	}

	onClose(): Promise<void> {
		this.component?.$destroy();
		return Promise.resolve();
	}

	refresh(): Promise<void> {
		this.component?.$set({ trash: this.trash });
		return Promise.resolve();
	}

	private async reloadTrash(): Promise<void> {
		try {
			await this.trash.refresh();
			await this.refresh();
		} catch (error) {
			console.error("Trash Explorer: refresh failed", error);
			new Notice("回收站刷新失败，请重试。");
		}
	}

	private async restoreFile(item: TrashItem): Promise<boolean> {
		try {
			if (await item.restore()) {
				await this.trash.forget(item);
				new Notice(`已恢复到 ${item.restorePath}`);
				return true;
			}

			new Notice(
				`无法恢复：${item.restorePath} 已存在。现有文件和回收站文件均已保留，请先处理同名文件。`,
				10 * 1000,
			);
			return false;
		} catch (error) {
			console.error("Trash Explorer: restore failed", error);
			new Notice("恢复操作未完成，请刷新回收站并检查目标路径。", 8000);
			await this.reloadTrash();
			return false;
		}
	}

	private async deleteFile(item: TrashItem): Promise<boolean> {
		const title = item.kind === "folder" ? "Delete folder" : "Delete file";
		const message = `Are you sure you want to permanently delete "${item.basename}"?`;

		return new Promise<boolean>((resolve) => {
			const confirmModal = new ConfirmModal(
				this.app,
				title,
				message,
				"Delete",
				async () => {
					await item.remove();
					await this.trash.forget(item);

					new Notice(`Permanently deleted "${item.basename}"`);
					confirmModal.close();
					resolve(true);
				},
			);

			confirmModal.open();
		});
	}
}

export class ConfirmModal extends Modal {
	constructor(
		app: App,
		private readonly title: string,
		private readonly message: string,
		private readonly submitText: string,
		private readonly onSubmit: () => Promise<void>,
	) {
		super(app);
	}

	onOpen(): void {
		this.titleEl.setText(this.title);

		this.contentEl.createEl("p", {
			text: this.message,
		});

		new Setting(this.contentEl)
			.addButton((button) =>
				button
					.setButtonText(this.submitText)
					.setWarning()
					.onClick(async () => {
						await this.onSubmit();
						this.close();
					}),
			)
			.addButton((button) =>
				button.setButtonText("Cancel").onClick(() => {
					this.close();
				}),
			);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

class PreviewModal extends Modal {
	private objectUrl?: string;
	private closed = false;

	constructor(
		app: App,
		private readonly item: TrashItem,
		private readonly restore: () => Promise<void>,
	) {
		super(app);
	}

	async onOpen(): Promise<void> {
		this.modalEl.style.width = "min(800px, 90vw)";
		this.titleEl.setText(this.item.basename);
		this.contentEl.createEl("p", { text: formatDeletionTime(this.item) });
		this.contentEl.createEl("p", {
			text: `恢复位置：${this.item.restorePath}${this.item.originalPath ? "" : "（历史原路径未知）"}`,
		});
		const preview = this.contentEl.createDiv();
		preview.style.maxHeight = "55vh";
		preview.style.overflow = "auto";
		new Setting(this.contentEl)
			.addButton((button) =>
				button
					.setButtonText("恢复文件")
					.setCta()
					.onClick(async () => {
						button.setDisabled(true);
						await this.restore();
						this.close();
					}),
			)
			.addButton((button) =>
				button.setButtonText("关闭").onClick(() => this.close()),
			);
		try {
			if (this.item.kind === "folder") {
				preview.createEl("p", {
					text: `文件夹包含 ${this.item.children.length} 个直接子项：`,
				});
				const list = preview.createEl("ul");
				for (const child of this.item.children.slice(0, 200))
					list.createEl("li", { text: child.basename });
				if (this.item.children.length > 200)
					preview.createEl("p", { text: "仅显示前 200 项。" });
				return;
			}
			const stat = await this.app.vault.adapter.stat(this.item.path);
			if (this.closed) return;
			if (!stat) throw new Error("Trashed file no longer exists");
			const ext =
				this.item.basename.split(".").pop()?.toLowerCase() ?? "";
			const mime: Record<string, string> = {
				png: "image/png",
				jpg: "image/jpeg",
				jpeg: "image/jpeg",
				gif: "image/gif",
				webp: "image/webp",
				bmp: "image/bmp",
			};
			if (mime[ext] && stat.size <= 10 * 1024 * 1024) {
				const bytes = await this.app.vault.adapter.readBinary(
					this.item.path,
				);
				if (this.closed) return;
				this.objectUrl = URL.createObjectURL(
					new Blob([bytes], { type: mime[ext] }),
				);
				const image = preview.createEl("img", {
					attr: { src: this.objectUrl, alt: this.item.basename },
				});
				image.style.maxWidth = "100%";
			} else if (
				[
					"md",
					"txt",
					"json",
					"csv",
					"tsv",
					"yaml",
					"yml",
					"log",
					"canvas",
				].includes(ext) &&
				stat.size <= 512 * 1024
			) {
				const text = await this.app.vault.adapter.read(this.item.path);
				if (this.closed) return;
				const pre = preview.createEl("pre", { text });
				pre.style.whiteSpace = "pre-wrap";
				pre.style.overflowWrap = "anywhere";
			} else {
				preview.createEl("p", {
					text: "此文件类型或大小暂不支持内容预览。可核对名称和恢复位置后恢复。",
				});
			}
		} catch (error) {
			console.error("Trash Explorer: preview failed", error);
			if (!this.closed)
				preview.createEl("p", {
					text: "无法读取预览，文件可能已被移动。请刷新回收站。",
				});
		}
	}

	onClose(): void {
		this.closed = true;
		if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
		this.contentEl.empty();
	}
}
