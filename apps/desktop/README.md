# Pocket Desktop Apps

The desktop apps load the existing Pocket website, so they use the same accounts,
permissions, backend, admin routes, POS terminal, delivery board, and live data as
the browser version. No API credentials are stored in the Windows installers.

## Run locally

```bash
npm run desktop:pos
npm run desktop:admin
```

Both commands open the deployed site at `https://pocketpakistan.com`. To use a
local or staging deployment, set `POCKET_DESKTOP_URL` before running the command.

## Publish downloadable installers

Do not build installers on each shop computer. In GitHub, open **Actions**,
select **Desktop release**, click **Run workflow**, and enter a release version
(for example `1.0.0`). GitHub builds the Windows and macOS installers and adds
them to the repository's latest release.

Staff can then visit `https://pocketpakistan.com/desktop` and click the POS or
Admin download for their computer. Windows installers are `.exe`, macOS
installers are `.dmg`, and Linux installers are `.AppImage` files.

## Local development

`npm run desktop:pos` and `npm run desktop:admin` are only for testing the app
on a developer computer. The Windows build commands require a Windows build
environment, so they should normally be run by GitHub Actions instead.

## 80mm receipt printers

Install the printer's Windows driver and configure its default paper size as 80mm.
In Pocket POS, use the floating **Printer** button to choose that printer. The
receipt buttons then print silently through the desktop app; the normal website
continues to use the browser print dialog.
