<script lang="ts">
	import type { SortOrder } from "../deletion-history";
	import { compareItems } from "../sorting";
	import type { Trash, TrashItem } from "../models";
	import type { TrashExplorerViewNode } from "../view";
	import SearchInput from "./SearchInput.svelte";
	import TrashItemView from "./TrashItemView.svelte";

	interface Props {
		trash: Trash;
		restoreItem: (item: TrashItem) => void;
		deleteItem: (item: TrashItem) => void;
		previewItem: (item: TrashItem) => void;
		initialSortOrder: SortOrder;
		changeSortOrder: (order: SortOrder) => void;
		refreshTrash: () => void;
	}

	let { trash, restoreItem, deleteItem, previewItem, initialSortOrder, changeSortOrder, refreshTrash }: Props = $props();
	// The saved order initializes this view; later edits are persisted explicitly.
	// svelte-ignore state_referenced_locally
	let sortOrder = $state<SortOrder>(initialSortOrder);
	let searchQuery = $state("");

	const viewNodes = $derived(
		buildViewNodes(trash.items, searchQuery.trim().toLocaleUpperCase()),
	);

	function buildViewNodes(
		items: TrashItem[],
		filter: string,
	): TrashExplorerViewNode[] {
		const nodes: TrashExplorerViewNode[] = [];

		for (const item of [...items].sort((a, b) => compareItems(a, b, sortOrder))) {
			const childNodes =
				item.kind === "folder"
					? buildViewNodes(item.children, filter)
					: [];

			if (childNodes.length || matchesFilter(item, filter)) {
				nodes.push({ item, nodes: childNodes });
			}
		}

		return nodes;
	}

	function matchesFilter(item: TrashItem, filter: string): boolean {
		return !filter || `${item.path} ${item.originalPath ?? ""}`.toLocaleUpperCase().includes(filter);
	}
</script>

<div class="container">
	<div class="toolbar">
		<SearchInput placeholder="搜索" bind:query={searchQuery} />
		<select class="sort-select" aria-label="排序" bind:value={sortOrder} onchange={() => changeSortOrder(sortOrder)}>
			<option value="deleted-desc">最新</option>
			<option value="deleted-asc">最早</option>
			<option value="name">名称</option>
		</select>
		<button class="refresh" aria-label="刷新" title="刷新" onclick={refreshTrash}>
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 7a9 9 0 1 0 1 9M20 3v5h-5" /></svg>
		</button>
	</div>
	{#if trash.isEmpty}
		<div class="pane-empty">回收站为空。</div>
	{:else}

		<div class="node-list">
			{#each viewNodes as viewNode (viewNode.item.path)}
				<TrashItemView {viewNode} {restoreItem} {deleteItem} {previewItem} forceExpand={!!searchQuery.trim()} />
			{:else}
				<div class="pane-empty">没有匹配的文件。</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.container { height: 100%; display: flex; flex-direction: column; min-width: 0; }
	.toolbar { display: flex; gap: 8px; align-items: center; flex: 0 0 auto; padding: 0 4px 10px; }
	.toolbar :global(.search-input-container) { min-width: 0; flex: 1; }
	.toolbar :global(input[type="search"]) { font-size: var(--font-ui-small); }
	.toolbar .sort-select, .toolbar .refresh { all: unset !important; box-sizing: border-box !important; cursor: pointer !important; color: var(--text-muted) !important; font-size: var(--font-ui-small) !important; }
	.toolbar .sort-select { width: 54px !important; height: 28px !important; appearance: auto !important; text-align: center !important; }
	.toolbar .refresh { display: flex !important; align-items: center !important; justify-content: center !important; width: 26px !important; height: 26px !important; border-radius: 4px !important; }
	.toolbar .refresh:hover { background: var(--background-modifier-hover) !important; }
	.toolbar .refresh:focus-visible, .toolbar .sort-select:focus-visible { outline: 2px solid var(--interactive-accent) !important; }
	.refresh svg { width: 15px; height: 15px; }
	.node-list { overflow-y: auto; min-height: 0; flex: 1; }
</style>
