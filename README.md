# Obsidian Trash Explorer

A plugin for [Obsidian](https://obsidian.md) that makes it possible to list, restore, and delete files in the _.trash_ folder in your Obsidian vault. This is useful if you're having trouble accessing hidden folders, such as on iOS.

[Install Trash Explorer from Obsidian community plugins.](https://obsidian.md/plugins?id=obsidian-trash-explorer)

![Screenshot of the trash explorer view](https://github.com/proog/obsidian-trash-explorer/raw/main/screenshot.png)

## Usage

> **Important:** this plugin works only with Obsidian's own _.trash_ folder. It does not work with the system trash.
>
> To enable this, open the settings and go to _File & Links_, then set _Deleted files_ to _Move to Obsidian trash_.

Click the trash explorer icon in the ribbon or use _Show trash explorer_ from the command palette. Then you can restore or delete files and folders with the buttons in the trash explorer view. It's also possible to delete all trashed files with the _Empty trash_ command.

## Harbor fork recovery features

- The default order is newest deletion first, mixing files and folders at each tree level. Choose oldest first or name order in the toolbar; the choice survives restarts.
- Local deletions made while this plugin is enabled record the deletion time and original path in the plugin's `data.json`. Original directories and filenames are used when restoring, including individual children of a deleted folder. Existing targets block restoration; both copies remain intact.
- Historical entries have no trustworthy deletion record. Desktop filesystem change time is shown as an explicitly labeled estimate; other entries show an unknown deletion time and sort last. Modification time is never presented as deletion time.
- Click an item name to preview its contents and recovery destination. Text/Markdown previews are read-only plain text (up to 512 KiB), raster images up to 10 MiB, and folders show up to 200 immediate children. Other formats show metadata without content.
- Search matches trash paths and recorded original paths. Refresh rescans the trash without reopening the panel.

Only Obsidian's local `.trash` is covered. Deletions made while the plugin is disabled, outside Obsidian, or on a device without this fork cannot acquire a true deletion timestamp or original path retroactively. Old entries retain the upstream fallback destination matching their location under `.trash`. Keep `data.json` together with the trash when synchronizing; it contains user recovery metadata, not file contents. Independent simultaneous deletions on different devices are not a transactional shared history.

The fork wraps the documented adapter `trashLocal` operation and restores the original method on unload. Tracking failures report a notice without blocking deletion. Filesystem estimates can change after syncing or other metadata changes, so they remain estimates.

## Development

### UI testing

```sh
# tl;dr
npm install
./e2e-setup.sh /path/to/obsidian.app
npm run e2e
```

Running `npm run e2e` tests the plugin in an actual Obsidian app using [Playwright](https://playwright.dev). Each Playwright test restores a test vault, launches Obsidian, and performs automated actions to smoke-test the plugin in a real environment.

Before running `npm run e2e`, it's necessary to run `e2e-setup.sh` in a terminal and follow its instructions. The purpose of this script is to create a copy of Obsidian's files that are usable by Playwright as well as to configure Obsidian itself. The script has currently only been tested on macOS - it may or may not work on other operating systems (please make a PR!).

> As for why the setup script is necessary:
>
> It used to be possible to automate the regular Obsidian executable from Playwright, but starting with an Obsidian update in 2024 the app could no longer be launched without timing out. This is likely due to the [EnableNodeCliInspectArguments](https://www.electronjs.org/docs/latest/tutorial/fuses#nodecliinspect) fuse being disabled, a known issue that's also mentioned in the [Playwright documentation](https://playwright.dev/docs/api/class-electron). Flipping Electron fuses in a packaged app changes the app's signature which makes the OS refuse to launch it. This project tries to work around it by extracting the JavaScript source files from the Obsidian app using Electron's ASAR tool, then launch those with Electron itself.
>
> Additionally, the E2E tests rely on a known test vault as the tests do manipulate real files in a real folder. As it's not currently possible to open a vault from the CLI unless Obsidian has previously opened it, it's necessary to manually open the `e2e-vault` in the unpacked Obsidian app before tests can be run against it.
