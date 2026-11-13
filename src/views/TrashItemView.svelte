<script lang="ts">
	import { compactDeletionTime, formatDeletionTime } from "../sorting";
	import type { TrashItem } from "../models";
	import type { TrashExplorerViewNode } from "../view";
	import TrashItemView from "./TrashItemView.svelte";

	interface Props {
		viewNode: TrashExplorerViewNode;
		restoreItem: (item: TrashItem) => void;
		deleteItem: (item: TrashItem) => void;
		previewItem: (item: TrashItem) => void;
		forceExpand?: boolean;
	}

	let { viewNode, restoreItem, deleteItem, previewItem, forceExpand = false }: Props = $props();
	let expanded = $state(false);
	const item = $derived(viewNode.item);
	const isOpen = $derived(expanded || forceExpand);
	const name = $derived(item.kind === "file" ? item.basename.replace(/\.md$/i, "") : item.basename);
</script>

<div class="trash-item" data-trash-path={item.path}>
	{#if item.kind === "folder"}
		<button class="trash-control twisty" aria-label={isOpen ? "收起文件夹" : "展开文件夹"} aria-expanded={isOpen} onclick={() => expanded = !expanded}>
			<svg class:expanded={isOpen} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
		</button>
	{:else}
		<span class="twisty-spacer"></span>
	{/if}
	<button class="trash-name" title={item.basename} onclick={() => previewItem(item)}>{name}</button>
	<div class="trash-tail">
		<time title={formatDeletionTime(item)}>{compactDeletionTime(item)}</time>
		<div class="trash-actions">
			<button class="trash-control" aria-label="恢复" title="恢复" onclick={() => restoreItem(item)}>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 10a9 9 0 1 1 1.8 8M3 4v6h6" /></svg>
			</button>
			<button class="trash-control delete" aria-label="永久删除" title="永久删除" onclick={() => deleteItem(item)}>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6" /></svg>
			</button>
		</div>
	</div>
</div>

{#if isOpen && viewNode.nodes.length}
	<div class="trash-children">
		{#each viewNode.nodes as childNode (childNode.item.path)}
			<TrashItemView viewNode={childNode} {restoreItem} {deleteItem} {previewItem} {forceExpand} />
		{/each}
	</div>
{/if}

<style>
	.trash-item { display: flex; align-items: center; gap: 5px; min-height: 34px; padding: 3px 6px; border-radius: var(--radius-s); color: var(--text-normal); }
	.trash-item:hover, .trash-item:focus-within { background: var(--background-modifier-hover); }
	/* Reset theme button paint, including themes that apply !important rules. */
	.trash-item button { all: unset !important; box-sizing: border-box !important; cursor: pointer !important; color: inherit !important; }
	.trash-item button:focus-visible { outline: 2px solid var(--interactive-accent) !important; outline-offset: 1px !important; border-radius: 3px !important; }
	.trash-item .trash-name { display: block !important; flex: 1 !important; min-width: 0 !important; overflow: hidden !important; text-overflow: ellipsis !important; white-space: nowrap !important; text-align: left !important; font: inherit !important; font-size: var(--font-ui-small) !important; line-height: 1.5 !important; }
	.trash-item .trash-control { display: flex !important; align-items: center !important; justify-content: center !important; width: 26px !important; height: 26px !important; border-radius: 4px !important; color: var(--text-muted) !important; }
	.trash-item .trash-control:hover { background: var(--background-modifier-hover) !important; color: var(--text-normal) !important; }
	.trash-item .delete:hover { color: var(--text-error) !important; }
	.trash-item .twisty, .twisty-spacer { flex: 0 0 14px !important; width: 14px !important; }
	svg { display: block; width: 15px; height: 15px; }
	.twisty svg { width: 13px; height: 13px; }
	.expanded { transform: rotate(90deg); }
	.trash-tail { display: grid; align-items: center; justify-items: end; flex: 0 0 92px; }
	time, .trash-actions { grid-area: 1 / 1; }
	time { color: var(--text-faint); font-size: 11px; white-space: nowrap; font-variant-numeric: tabular-nums; }
	.trash-actions { display: flex; gap: 2px; opacity: 0; pointer-events: none; }
	.trash-item:hover .trash-actions, .trash-item:focus-within .trash-actions { opacity: 1; pointer-events: auto; }
	.trash-item:hover time, .trash-item:focus-within time { visibility: hidden; }
	.trash-children { padding-left: 16px; }
	@media (hover: none) {
		.trash-tail { flex-basis: auto; gap: 6px; display: flex; }
		.trash-actions { opacity: 1; pointer-events: auto; }
		.trash-item:hover time, .trash-item:focus-within time { visibility: visible; }
	}
</style>
