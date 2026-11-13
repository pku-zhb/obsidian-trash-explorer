import type { SortOrder } from "./deletion-history";

export interface TimedItem {
	path: string;
	basename: string;
	deletedAt: number | null;
	estimatedAt: number | null;
}

const collator = new Intl.Collator(undefined, {
	sensitivity: "base",
	numeric: true,
});

export function compareItems(
	a: TimedItem,
	b: TimedItem,
	order: SortOrder,
): number {
	const byName = () =>
		collator.compare(a.basename, b.basename) ||
		collator.compare(a.path, b.path);
	if (order === "name") return byName();
	const aTime = a.deletedAt ?? a.estimatedAt;
	const bTime = b.deletedAt ?? b.estimatedAt;
	if (aTime === null) return bTime === null ? byName() : 1;
	if (bTime === null) return -1;
	return (
		(order === "deleted-desc" ? bTime - aTime : aTime - bTime) || byName()
	);
}

export function formatDeletionTime(item: TimedItem): string {
	const time = item.deletedAt ?? item.estimatedAt;
	if (time === null) return "删除时间未知";
	const formatted = new Date(time).toLocaleString(undefined, {
		hour12: false,
	});
	return item.deletedAt !== null
		? `删除于 ${formatted}`
		: `估算 ${formatted}`;
}
