import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: {
			obsidian: new URL("./src/test-support/obsidian.ts", import.meta.url)
				.pathname,
		},
	},
	test: {
		dir: "./src",
	},
});
