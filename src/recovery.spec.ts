import { describe, expect, test, vi } from "vitest";
import type { DataAdapter, Stat, Vault } from "obsidian";
import {
	findTrashedPath,
	isSafeRestorePath,
	loadRecoveryData,
	trackDeletions,
} from "./deletion-history";
import { compareItems } from "./sorting";
import { Trash } from "./models";

vi.mock("obsidian", () => ({
	FileSystemAdapter: class {},
	normalizePath: (path: string) => path,
}));

function fixture() {
	const entries = new Map<string, Stat>([
		[".", { type: "folder", size: 0, mtime: 1, ctime: 1 }],
	]);
	const add = (path: string, type: "file" | "folder" = "file", mtime = 1) => {
		entries.set(path, {
			type,
			size: type === "file" ? 10 : 0,
			mtime,
			ctime: 1,
		});
	};
	const adapter = {
		exists: vi.fn((path: string) => Promise.resolve(entries.has(path))),
		stat: vi.fn((path: string) =>
			Promise.resolve(entries.get(path) ?? null),
		),
		list: vi.fn((root: string) => {
			const paths = [...entries.keys()].filter(
				(path) =>
					path.startsWith(`${root}/`) &&
					!path.slice(root.length + 1).includes("/"),
			);
			return Promise.resolve({
				files: paths.filter(
					(path) => entries.get(path)?.type === "file",
				),
				folders: paths.filter(
					(path) => entries.get(path)?.type === "folder",
				),
			});
		}),
		mkdir: vi.fn((path: string) => {
			add(path, "folder");
			return Promise.resolve();
		}),
		rename: vi.fn((from: string, to: string) => {
			const stat = entries.get(from);
			if (!stat) return Promise.reject(new Error("Missing source"));
			entries.set(to, stat);
			entries.delete(from);
			for (const [path, stat] of [...entries]) {
				if (path.startsWith(`${from}/`)) {
					entries.set(`${to}${path.slice(from.length)}`, stat);
					entries.delete(path);
				}
			}
			return Promise.resolve();
		}),
		trashLocal: vi.fn(async (source: string) => {
			add(".trash", "folder");
			const name = source.split("/").pop()!;
			const dot = name.lastIndexOf(".");
			let target = `.trash/${name}`;
			for (let n = 2; entries.has(target); n++) {
				target =
					dot > 0
						? `.trash/${name.slice(0, dot)} ${n}${name.slice(dot)}`
						: `.trash/${name} ${n}`;
			}
			await adapter.rename(source, target);
		}),
	};
	return {
		entries,
		add,
		adapter: adapter as unknown as DataAdapter,
		vault: { adapter } as unknown as Vault,
	};
}

describe("deletion tracking and recovery", () => {
	test("records concurrent same-name deletions separately and restores original directories", async () => {
		const f = fixture();
		f.add("A/note.md", "file", 1);
		f.add("B/note.md", "file", 2);
		const data = loadRecoveryData(null);
		const persist = vi.fn(() => Promise.resolve());
		const errors = vi.fn();
		const stop = trackDeletions(f.adapter, data.records, persist, errors);
		await Promise.all([
			f.adapter.trashLocal("A/note.md"),
			f.adapter.trashLocal("B/note.md"),
		]);
		expect(data.records[".trash/note.md"].originalPath).toBe("A/note.md");
		expect(data.records[".trash/note 2.md"].originalPath).toBe("B/note.md");
		expect(data.records[".trash/note.md"].deletedAt).toBeGreaterThan(0);
		const reloaded = loadRecoveryData(
			JSON.parse(JSON.stringify(data)) as unknown,
		);
		const trash = new Trash(f.vault, reloaded.records, persist);
		await trash.refresh();
		expect(trash.items.map((item) => item.restorePath)).toEqual([
			"B/note.md",
			"A/note.md",
		]);
		for (const item of [...trash.items]) {
			expect(await item.restore()).toBe(true);
			await trash.forget(item);
		}
		expect(f.entries.has("A/note.md")).toBe(true);
		expect(f.entries.has("B/note.md")).toBe(true);
		expect(Object.keys(reloaded.records)).toEqual([]);
		expect(errors).not.toHaveBeenCalled();
		stop();
		const count = persist.mock.calls.length;
		f.add("C/new.md");
		await f.adapter.trashLocal("C/new.md");
		expect(persist).toHaveBeenCalledTimes(count);
	});

	test("preserves both existing and trashed files when restore target conflicts", async () => {
		const f = fixture();
		f.add("A/note.md");
		const data = loadRecoveryData(null);
		const stop = trackDeletions(
			f.adapter,
			data.records,
			() => Promise.resolve(),
			vi.fn(),
		);
		await f.adapter.trashLocal("A/note.md");
		f.add("A/note.md", "file", 9);
		const trash = new Trash(f.vault, data.records);
		await trash.refresh();
		expect(await trash.items[0].restore()).toBe(false);
		expect(f.entries.get("A/note.md")?.mtime).toBe(9);
		expect(f.entries.has(".trash/note.md")).toBe(true);
		stop();
	});

	test("folder descendants inherit deletion time and original relative paths", async () => {
		const f = fixture();
		f.add("Projects/folder", "folder");
		f.add("Projects/folder/child.md");
		const data = loadRecoveryData(null);
		const stop = trackDeletions(
			f.adapter,
			data.records,
			() => Promise.resolve(),
			vi.fn(),
		);
		await f.adapter.trashLocal("Projects/folder");
		const trash = new Trash(f.vault, data.records);
		await trash.refresh();
		const folder = trash.items[0];
		if (folder.kind !== "folder") throw new Error("Expected folder");
		expect(folder.children[0].restorePath).toBe("Projects/folder/child.md");
		expect(folder.children[0].deletedAt).toBe(folder.deletedAt);
		expect(await folder.children[0].restore()).toBe(true);
		stop();
	});

	test("metadata failures do not block deletion and rejected deletions do not stall the queue", async () => {
		const f = fixture();
		f.add("A/note.md");
		const errors = vi.fn();
		const stop = trackDeletions(
			f.adapter,
			{},
			() => Promise.reject(new Error("Disk error")),
			errors,
		);
		await expect(f.adapter.trashLocal("missing.md")).rejects.toThrow(
			"Missing source",
		);
		await expect(
			f.adapter.trashLocal("A/note.md"),
		).resolves.toBeUndefined();
		expect(f.entries.has(".trash/note.md")).toBe(true);
		expect(errors).toHaveBeenCalledOnce();
		stop();
	});

	test("legacy entries never present modification time as deletion time", async () => {
		const f = fixture();
		f.add(".trash", "folder");
		f.add(".trash/old.md");
		const trash = new Trash(f.vault);
		await trash.refresh();
		expect(trash.items[0].deletedAt).toBeNull();
		expect(trash.items[0].restorePath).toBe("old.md");
	});
});

test("sorts all item kinds by time, handles estimates, and keeps unknown times last", () => {
	const item = (
		path: string,
		deletedAt: number | null,
		estimatedAt: number | null = null,
	) => ({ path, basename: path, deletedAt, estimatedAt });
	const items = [
		item("unknown", null),
		item("old", 10),
		item("folder", 30),
		item("estimated", null, 20),
	];
	const sorted = (order: "deleted-desc" | "deleted-asc" | "name") =>
		[...items]
			.sort((a, b) => compareItems(a, b, order))
			.map((item) => item.path);
	expect(sorted("deleted-desc")).toEqual([
		"folder",
		"estimated",
		"old",
		"unknown",
	]);
	expect(sorted("deleted-asc")).toEqual([
		"old",
		"estimated",
		"folder",
		"unknown",
	]);
	expect(sorted("name")).toEqual(["estimated", "folder", "old", "unknown"]);
});

test("matches collision suffixes without guessing ambiguous new paths", () => {
	expect(
		findTrashedPath(
			[".trash/note.md"],
			[".trash/note.md", ".trash/note 2.md"],
			"P/note.md",
		),
	).toBe(".trash/note 2.md");
	expect(
		findTrashedPath(
			[],
			[".trash/note.md", ".trash/note 2.md"],
			"P/note.md",
		),
	).toBeUndefined();
	expect(findTrashedPath([], [".trash/.hidden 2"], ".hidden")).toBe(
		".trash/.hidden 2",
	);
});

test.each([
	"../outside.md",
	"/outside.md",
	"C:/outside.md",
	".trash/again.md",
	"a/../b",
	"a\\b",
	"",
])("rejects unsafe recovery path %s", (path) => {
	expect(isSafeRestorePath(path)).toBe(false);
});
