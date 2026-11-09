# Changelog

## 0.2.0

- Target Pi 1.5.x; install Pi 1.5.0 on machines without Pi.
- Upgrade pi-cc-extensions to 1.0.16 and disable its competing editor/footer.
- Vendor the MIT Comfy 0.3.1 UI modules to maintain compatibility without the upstream 0.84 peer restriction; skip non-UI sessions.
- Write pi-cc-extensions.json and preserve legacy configuration files/options.
- Upgrade 0.1.x in place while retaining the first backup and later user edits/plugins.
- Validate the Pi 1.5 theme schema and test the real TUI in a disposable PTY.

## 0.1.2

- Preserve all upstream transitive lockfile versions while updating this package version.
- Verify dependency installation with an empty npm cache before release.

## 0.1.1

- Fix CLI entrypoint detection when macOS temporary paths resolve through `/var` → `/private/var`, or when source is invoked through a symlink.
- Add a regression test and isolated full installer checks on macOS/Linux CI.

## 0.1.0

- Initial warm theme, pinned UI renderer/input stack, footer, backup and restore installer.
- Superseded by 0.1.1; the shell installer could exit silently on macOS temporary paths.
