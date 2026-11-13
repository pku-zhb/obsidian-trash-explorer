import test, {
	expect,
	type ElectronApplication,
	type Locator,
	type Page,
} from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { _electron as electron } from "playwright";

const appPath = path.resolve("./.obsidian-unpacked/main.js");
const vaultPath = path.resolve("./e2e-vault");

let app: ElectronApplication;
let page: Page;

test.beforeEach(async () => {
	// Restore .trash folder from template
	await fs.cp(
		path.join(vaultPath, "Trash template"),
		path.join(vaultPath, ".trash"),
		{ recursive: true, force: true }
	);
	await fs.rm(path.join(vaultPath, "Recipes"), {
		recursive: true,
		force: true,
	});

	app = await electron.launch({
		args: [
			appPath,
			"open",
			`obsidian://open?path=${encodeURIComponent(vaultPath)}`,
		],
	});

	page = await app.firstWindow();
});

test.afterEach(async () => {
	await app?.close();
});

test("can open trash explorer view from ribbon", async () => {
	const trashView = getTrashView(page);
	const filesView = getFilesView(page);

	await openFilesView(page);
	await expect(trashView).not.toBeVisible();
	await expect(filesView).toBeVisible();

	await openTrashView(page);
	await expect(trashView).toBeVisible();
	await expect(filesView).not.toBeVisible();
});

test("can empty the trash from command palette", async () => {
	const view = await openTrashView(page);

	const trashItems = getTrashItems(view);
	await expect(trashItems).toHaveCount(3);

	// Empty trash through the command palette
	await page.getByLabel("Open command palette", { exact: true }).click();
	await page.locator("input.prompt-input").pressSequentially("清空回收站");
	await expect(page.locator(".suggestion-item")).toHaveCount(1);
	await page.locator(".suggestion-item").click();
	await page.locator("button.mod-warning").getByText("Empty trash").click();

	await expect(page.locator(".notice")).toHaveText("Emptied the trash");
	await expect(trashItems).toHaveCount(0);
});

test("can restore items from trash explorer view", async () => {
	const view = await openTrashView(page);

	const trashItemName = "Recipes";
	const trashItem = getTrashItems(view).filter({ hasText: trashItemName });
	await expect(trashItem).toContainText("Recipes");

	await trashItem.hover();
	await trashItem.getByLabel("恢复", { exact: true }).click();
	await expect(trashItem).not.toBeVisible();

	const filesView = await openFilesView(page);
	const restoredItem = filesView.locator(".nav-folder-title-content", {
		hasText: trashItemName,
	});
	await expect(restoredItem).toBeVisible();
});

test("can delete items from trash explorer view", async () => {
	const view = await openTrashView(page);

	const trashItemName = "Recipes";
	const trashItem = getTrashItems(view).filter({ hasText: trashItemName });
	await expect(trashItem).toContainText("Recipes");

	await trashItem.hover();
	await trashItem.getByLabel("永久删除", { exact: true }).click();

	await page.locator("button.mod-warning").getByText("永久删除", { exact: true }).click();

	await expect(page.locator(".notice")).toHaveText(
		`Permanently deleted "${trashItemName}"`
	);
	await expect(trashItem).not.toBeVisible();
});

test("can filter trashed items by name", async () => {
	const view = await openTrashView(page);

	const trashItems = getTrashItems(view);
	await expect(trashItems).toHaveCount(3);

	const searchInput = view.getByPlaceholder("搜索", { exact: true });
	await searchInput.fill("fløde");

	await expect(trashItems).toHaveCount(2);
	await expect(trashItems.first()).toContainText("Recipes");
	await expect(trashItems.last()).toContainText("Rødgrød med fløde");

	await searchInput.clear();
	await expect(trashItems).toHaveCount(3);
});

function getTrashItems(locator: Locator) {
	return locator.locator(".trash-item");
}

function getTrashView(page: Page) {
	return page.locator(".workspace-leaf-content[data-type=trash-explorer]");
}

function getFilesView(page: Page) {
	return page.locator(".workspace-leaf-content[data-type=file-explorer]");
}

async function openTrashView(page: Page) {
	await page.getByLabel("回收站", { exact: true }).click();
	return getTrashView(page);
}

async function openFilesView(page: Page) {
	await page.getByLabel("Files", { exact: true }).click();
	return getFilesView(page);
}
