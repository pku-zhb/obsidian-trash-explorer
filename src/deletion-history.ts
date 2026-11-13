import { FileSystemAdapter, type DataAdapter, type Stat } from "obsidian";
import { basename } from "./path";

const ROOT = ".trash";

export interface DeletionRecord {
	deletedAt: number;
	originalPath?: string;
	size: number;
	mtime: number;
	type: "file" | "folder";
}

export type DeletionRecords = Record<string, DeletionRecord>;
export type SortOrder = "deleted-desc" | "deleted-asc" | "name";
export interface RecoveryData {
	version: 1;
	sortOrder: SortOrder;
	records: DeletionRecords;
}

export function loadRecoveryData(value: unknown): RecoveryData {
	const data: RecoveryData = {
		version: 1,
		sortOrder: "deleted-desc",
		records: Object.create(null) as DeletionRecords,
	};
	if (!value || typeof value !== "object") return data;
	const input = value as Partial<RecoveryData>;
	if (
		["deleted-desc", "deleted-asc", "name"].includes(input.sortOrder ?? "")
	) {
		data.sortOrder = input.sortOrder!;
	}
	for (const [path, record] of Object.entries(input.records ?? {})) {
		if (!path.startsWith(`${ROOT}/`) || path.split("/").includes(".."))
			continue;
		if (
			record &&
			Number.isFinite(record.deletedAt) &&
			record.deletedAt > 0 &&
			Number.isFinite(record.size) &&
			Number.isFinite(record.mtime) &&
			(record.type === "file" || record.type === "folder")
		) {
			data.records[path] = {
				...record,
				originalPath: isSafeRestorePath(record.originalPath)
					? record.originalPath
					: undefined,
			};
		}
	}
	return data;
}

export function isSafeRestorePath(path: unknown): path is string {
	return (
		typeof path === "string" &&
		path.length > 0 &&
		!path.startsWith("/") &&
		!path.includes("\\") &&
		!/^[a-z]:/i.test(path) &&
		!path
			.split("/")
			.some((part) => part === ".." || part === "." || part === "") &&
		path !== ROOT &&
		!path.startsWith(`${ROOT}/`)
	);
}

export function recordMatches(
	record: DeletionRecord,
	stat: Stat | null,
): boolean {
	return (
		!!stat &&
		record.type === stat.type &&
		(record.type === "folder" ||
			(record.size === stat.size &&
				Math.abs(record.mtime - stat.mtime) < 1))
	);
}

export async function listTrash(adapter: DataAdapter): Promise<string[]> {
	if (!(await adapter.exists(ROOT))) return [];
	const { files, folders } = await adapter.list(ROOT);
	return [...files, ...folders];
}

/** Match Obsidian's collision names, but never guess when multiple entries appeared. */
export function findTrashedPath(
	before: string[],
	after: string[],
	source: string,
): string | undefined {
	const oldPaths = new Set(before);
	const added = after.filter((path) => !oldPaths.has(path));
	const name = basename(source);
	const dot = name.lastIndexOf(".");
	const stem = dot > 0 ? name.slice(0, dot) : name;
	const ext = dot > 0 ? name.slice(dot) : "";
	const candidates = added.filter((path) => {
		const candidate = basename(path);
		if (candidate === name) return true;
		if (!candidate.startsWith(`${stem} `) || !candidate.endsWith(ext))
			return false;
		const suffix = candidate.slice(
			stem.length + 1,
			ext ? -ext.length : undefined,
		);
		return /^[2-9]$|^[1-9]\d+$/.test(suffix);
	});
	return candidates.length === 1 ? candidates[0] : undefined;
}

/** ctime is a filesystem change time, explicitly an estimate rather than deletion evidence. */
export async function localChangeTime(
	adapter: DataAdapter,
	path: string,
): Promise<number | null> {
	if (!(adapter instanceof FileSystemAdapter)) return null;
	try {
		// Load Node only on desktop; mobile has no filesystem module.
		const fs =
			// eslint-disable-next-line @typescript-eslint/no-require-imports
			require("node:fs/promises") as typeof import("node:fs/promises");
		const stat = await fs.stat(`${adapter.getBasePath()}/${path}`);
		return stat.ctimeMs > 0 ? stat.ctimeMs : null;
	} catch {
		return null;
	}
}

/** Serialize local trash operations so collision names can be identified reliably. */
export function trackDeletions(
	adapter: DataAdapter,
	records: DeletionRecords,
	onRecord: () => Promise<void>,
	onError: (error: unknown) => void,
): () => void {
	// Keep the exact function for unloading; calls below explicitly bind the adapter.
	// eslint-disable-next-line @typescript-eslint/unbound-method
	const original = adapter.trashLocal;
	let queue = Promise.resolve();
	let active = true;
	const wrapped = (source: string): Promise<void> => {
		const operation = queue.then(async () => {
			// Metadata failures must never prevent the user's deletion operation.
			let before: string[] | undefined;
			try {
				before = await listTrash(adapter);
			} catch (error) {
				onError(error);
			}
			await original.call(adapter, source);
			const deletedAt = Date.now();
			if (!active || !before) return;
			try {
				const path = findTrashedPath(
					before,
					await listTrash(adapter),
					source,
				);
				if (!path) return;
				const stat = await adapter.stat(path);
				if (!stat) return;
				records[path] = {
					deletedAt,
					originalPath: isSafeRestorePath(source)
						? source
						: undefined,
					size: stat.size,
					mtime: stat.mtime,
					type: stat.type,
				};
				await onRecord();
			} catch (error) {
				onError(error);
			}
		});
		queue = operation.catch(() => undefined);
		return operation;
	};
	adapter.trashLocal = wrapped;
	return () => {
		active = false;
		if (adapter.trashLocal === wrapped) adapter.trashLocal = original;
	};
}
