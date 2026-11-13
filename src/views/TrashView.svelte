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
		<select aria-label="回收站排序" bind:value={sortOrder} onchange={() => changeSortOrder(sortOrder)}>
			<option value="deleted-desc">删除时间：最新在前</option>
			<option value="deleted-asc">删除时间：最早在前</option>
			<option value="name">名称</option>
		</select>
		<button aria-label="刷新回收站" onclick={refreshTrash}>刷新</button>
	</div>
	<p class="time-help">历史文件按文件系统变更时间估算；删除时间未知的排最后。</p>
	{#if trash.isEmpty}
		<div class="pane-empty">回收站为空。</div>
	{:else}
		<div>
			<SearchInput
				placeholder="搜索文件名或原路径…"
				bind:query={searchQuery}
			/>
		</div>

		<div class="node-list">
			{#each viewNodes as viewNode (viewNode.item.path)}
				<TrashItemView {viewNode} {restoreItem} {deleteItem} {previewItem} />
			{:else}
				<div class="pane-empty">没有匹配的文件。</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.container {
		height: 100%;
		display: flex;
		flex-direction: column;
	}

	.toolbar { display: flex; gap: 6px; align-items: center; margin-bottom: 8px; }
	.toolbar select { flex: 1; min-width: 0; }
	.time-help { color: var(--text-muted); font-size: var(--font-ui-smaller); margin: 0 0 8px; }

	.node-list {
		margin-top: 1em;
		overflow-y: auto;
	}
</style>
