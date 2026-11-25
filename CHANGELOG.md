# Changelog

All notable changes to GoSSHpher are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **Wails v3.1** replaces Wails v2. The Go backend is now a Wails service, the frontend uses the generated bindings in `frontend/bindings/` and the `@wailsio/runtime` package.
- Linux builds use GTK4 and WebKitGTK 6.0 (`libgtk-4-dev libwebkitgtk-6.0-dev`). For distributions without WebKitGTK 6.0, releases additionally contain `gosshpher-<version>-linux-amd64-gtk3.tar.gz`, built against GTK3 / WebKit2GTK 4.1 (locally: `wails3 build EXTRA_TAGS=gtk3`).
- macOS 12 (Monterey) or later is required; macOS 10.13 to 11 are no longer supported.
- Building: `wails3 build` with the tasks in `Taskfile.yml` replaces `wails build` and `wails.json`; `wails3 dev` replaces `wails dev`. `scripts/set-version.sh` writes the release version into the macOS and Windows build files, and `scripts/icons.py` also creates the macOS icon.
- The question about unsaved changes on closing or quitting uses the dialog buttons on all platforms (*Discard and quit* / *Cancel*), no longer Yes/No on Linux and Windows.
- CI checks that the checked-in bindings are up to date.
- Development moves to a single trunk branch `main`; releases are tags on `main` instead of version branches (`1.0`, `1.1`, `1.2`). `scripts/release.sh` notes when it does not run on `main`.

### Removed

- The unused Wails v2 NSIS installer templates (`build/windows/installer/`).

## [1.2.1] - 2026-11-23

### Added

- `scripts/release.sh` prepares a release: it turns `[Unreleased]` into the new version, updates the compare links, commits and creates the tag.
- Dependabot keeps the GitHub Actions, Go modules and frontend npm dependencies up to date with weekly update pull requests.

### Fixed

- macOS: the window could not be closed with unsaved changes, because the close dialog had no buttons and always returned an empty answer. It now offers *Discard and quit* and *Cancel*.
- Opening a terminal only accepts host names made of letters, digits and `.-_:@`. On Windows, characters such as `&`, `|` or `^` in a host alias (e.g. from a shared include) were interpreted by `cmd.exe`.
- Windows: a config file path containing `& | ^ < > % " ;` now gives a clear error instead of a terminal command that `cmd.exe` or `wt.exe` would misinterpret.
- A custom terminal command may quote paths with spaces, e.g. `"C:\Program Files\…\term.exe" -e`; an unclosed quote gives an error instead of a crash.
- *Save as*: if writing the new file fails, the editor stays on the previous file instead of pointing at a file that was never written.

## [1.2.0] - 2026-11-13

### Added

- **Host and group templates.** A host template is a list of options, a group template a group name plus several Host blocks.
  - Placeholders are filled from the host (`{alias}`, `{short}`, `{domain}`, `{group}`) or asked for when applying (`{name}`, `{name=default}`); ssh's own `%h` and `${ENV}` tokens stay untouched.
  - Apply a template to a new or existing host with a preview; overwriting existing options asks first.
  - Create a whole group from a group template via *+ Group* → *From template*; changed effective values of existing hosts are listed before anything is applied.
  - Save a host (⋮ menu, *Template ▾*) or a group (☆ on the group header) as a template.
  - Template manager in the settings to create, edit, duplicate and delete templates in a small ssh-config-like text format.
  - Stored per user in `templates.json` next to `settings.json`, not in the ssh config; a file that cannot be parsed is never overwritten.
- **Marking several hosts for a new group:** `Ctrl/⌘+click` extends or shrinks a contiguous run starting at the selected host, `Shift+click` marks everything up to the clicked host. *+ Group* prefills the dialog with the marked hosts. Marks never span group boundaries or global blocks, so a new group cannot pull hosts out of several groups at once. `Esc` or a plain click clears the marks.

### Changed

- The editor's header row is now a compact toolbar: *Template ▾*, ▶ connect, duplicate, the move buttons ⇈ ↑ ↓ ⇊ and, set apart at the end, delete. Icons replace the former text buttons; every icon names its action in a tooltip.

### Fixed

- On Linux with several monitors the window could not grow beyond the size of the monitor it opened on.

## [1.1.0] - 2026-11-11

### Added

- **Connect in terminal:** opens a terminal running `ssh <alias>` (or `ssh -F <file> <alias>` for other config files) for the first alias without wildcards. Unsaved changes can be saved first, because ssh reads the file from disk; the window stays open if ssh fails.
- Terminal detection for Linux, macOS and Windows, with a *Terminal* setting to choose the program.
- ⋮ menu on every entry of the host list (shown on hover) with *Connect*, *Duplicate* and *Delete*.
- **Update notice:** a background check against the GitHub releases at start-up shows a dismissible notice with a link to a newer release. It can be turned off with the *Check for updates at start* setting; development builds never check.

## [1.0.1] - 2026-11-10

### Changed

- Undo and redo come before the reload button in the toolbar.
- CI and release workflows use the latest major versions of the GitHub Actions.

## [1.0.0] - 2026-11-10

### Added

- First release: a desktop editor for OpenSSH client configs (`~/.ssh/config`) for Linux, macOS and Windows.
- Lossless editing that keeps comments, blank lines, indentation, `Key=Value` syntax, CRLF line endings and the final newline.
- Effective configuration per host, similar to `ssh -G`, with the source block of every value; `Match` and `Include` are evaluated.
- Checks for shadowed and duplicate options, unknown keywords, upper-case patterns, missing key files and `RemoteCommand … $SHELL` without `RequestTTY`.
- Groups stored as comment markers, a group dialog with host autocompletion and a preview of changed effective values.
- Reordering by drag and drop, buttons or `Alt+↑/↓`; sorting of the host list by file order, alias or hostname.
- Text view for the raw file, undo and redo, resizable panes.
- Safe saving with configurable backups, atomic writes and a conflict check against external changes.
- User interface in English and German.

[Unreleased]: https://github.com/jmatthiesen81/GoSSHpher/compare/1.2.1...HEAD
[1.2.1]: https://github.com/jmatthiesen81/GoSSHpher/compare/1.2.0...1.2.1
[1.2.0]: https://github.com/jmatthiesen81/GoSSHpher/compare/1.1.0...1.2.0
[1.1.0]: https://github.com/jmatthiesen81/GoSSHpher/compare/1.0.1...1.1.0
[1.0.1]: https://github.com/jmatthiesen81/GoSSHpher/compare/1.0.0...1.0.1
[1.0.0]: https://github.com/jmatthiesen81/GoSSHpher/releases/tag/1.0.0
