# Build directory

Platform files and assets for the Wails v3 build. The build itself is defined in [Taskfile.yml](../Taskfile.yml) in the project root (`wails3 build`, `wails3 task <name>`).

| Path                         | Content                                                                                       |
| ---------------------------- | --------------------------------------------------------------------------------------------- |
| `bin/`                       | Build output (ignored by git)                                                                 |
| `config.yml`                 | Configuration of `wails3 dev` (watched files, commands)                                       |
| `appicon.svg`, `appicon.png` | Icon source; `scripts/icons.py` derives all other icon files from `appicon.png`               |
| `darwin/Info.plist`          | macOS bundle metadata; the version is set by `scripts/set-version.sh`                         |
| `darwin/icons.icns`          | macOS app icon                                                                                |
| `windows/icon.ico`           | Windows icon, linked into the `.exe` together with the manifest and version info              |
| `windows/info.json`          | Windows version resource (file properties → details); version set by `scripts/set-version.sh` |
| `windows/wails.exe.manifest` | Windows application manifest (DPI awareness, common controls)                                 |
| `linux/`                     | `.desktop` file and hicolor icons, installed by `scripts/install-linux.sh`                    |
