# Changelog

## 0.1.1

- Fix CLI entrypoint detection when macOS temporary paths resolve through `/var` → `/private/var`, or when source is invoked through a symlink.
- Add a regression test and isolated full installer checks on macOS/Linux CI.

## 0.1.0

- Initial warm theme, pinned UI renderer/input stack, footer, backup and restore installer.
- Superseded by 0.1.1; the shell installer could exit silently on macOS temporary paths.
