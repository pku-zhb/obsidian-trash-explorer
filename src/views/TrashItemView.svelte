<script lang="ts">
	import { formatDeletionTime } from "../sorting";
	import { formatItemStats } from "../formatting";
	import type { TrashItem } from "../models";
	import type { TrashExplorerViewNode } from "../view";
	import TrashItemView from "./TrashItemView.svelte";

	interface Props {
		viewNode: TrashExplorerViewNode;
		restoreItem: (item: TrashItem) => void;
		deleteItem: (item: TrashItem) => void;
		previewItem: (item: TrashItem) => void;
	}

	let { viewNode, restoreItem, deleteItem, previewItem }: Props = $props();

	const item = $derived(viewNode.item);
	const itemStats = $derived(formatItemStats(item));
</script>

<div class="trash-item" data-trash-path={item.path}>
	<div class="textcontainer">
		<button class="name" title="预览内容和恢复位置" onclick={() => previewItem(item)}>{item.basename}</button>
		<div class="info">{itemStats} · {formatDeletionTime(item)}</div>
		<div class="info" title={item.restorePath}>{item.originalPath ? "原路径" : "恢复到（原路径未知）"}：{item.restorePath}</div>
	</div>
	<div class="buttons">
		<button aria-label="Restore" title={`恢复到 ${item.restorePath}`} onclick={() => restoreItem(item)}>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="24"
				height="24"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				class="svg-icon lucide-rotate-ccw"
			>
				<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
				<path d="M3 3v5h5" />
			</svg>
		</button>
		<button
			aria-label="Delete permanently"
			class="mod-warning"
			onclick={() => deleteItem(item)}
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="24"
				height="24"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				class="svg-icon lucide-trash-2"
			>
				<path d="M3 6h18" />
				<path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
				<path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
				<line x1="10" x2="10" y1="11" y2="17" />
				<line x1="14" x2="14" y1="11" y2="17" />
			</svg>
		</button>
	</div>
</div>

{#if viewNode.nodes.length}
	<div style="padding-left: 1em;">
		{#each viewNode.nodes as childNode (childNode.item.path)}
			<TrashItemView viewNode={childNode} {restoreItem} {deleteItem} {previewItem} />
		{/each}
	</div>
{/if}

<style>
	.trash-item {
		margin-bottom: var(--size-2-1);
		border-radius: var(--radius-s);
		cursor: var(--cursor);
		color: var(--nav-item-color);
		font-size: var(--nav-item-size);
		font-weight: var(--nav-item-weight);
		line-height: var(--line-height-tight);
		padding: var(--nav-item-padding);
		padding-left: 0;
		padding-right: 0;
		display: flex;
		align-items: center;
	}

	.textcontainer {
		min-width: 0; flex: 1;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.name {
		border: 0; background: none; box-shadow: none; text-align: left; padding: 0; height: auto; color: inherit; font: inherit; display: block; width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.info {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--text-faint);
		font-size: var(--font-ui-small);
	}

	.buttons {
		margin-left: auto;
		display: flex;
		gap: 3px;
		padding-left: 3px;
	}
</style>
