# GoSSHpher

A desktop editor for OpenSSH client configuration files (`~/.ssh/config`). It edits the file without losing formatting, organises hosts in groups and shows for every host which values ssh will actually use, because in ssh the first value found wins.

## Quick facts

|              |                                                                                                                                                               |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Language     | Go 1.26 (core and backend), vanilla JavaScript (UI)                                                                                                           |
| Framework    | [Wails v2.17](https://wails.io) with the system WebView, Vite 7 for the frontend                                                                              |
| Platforms    | Linux (WebKitGTK 4.1), macOS, Windows (WebView2)                                                                                                              |
| Key features | Lossless editing, effective configuration like `ssh -G`, shadowed-option checks, groups as comment markers, host and group templates, safe saving with backup |
| UI language  | English (default), German; switchable in the settings                                                                                                         |
| App id       | `de.netinventors.gosshpher` (macOS bundle id, settings folder, Linux app id)                                                                                  |
| Settings     | `~/.config/de.netinventors.gosshpher/settings.json` (Linux; per-platform paths in [architecture](docs/en/architecture.md#settings-file))                      |
| Releases     | GitHub Actions build Linux, Windows and macOS archives for every version tag (`1.2.3`, no `v` prefix)                                                         |

## Quick start

```bash
# Linux (Ubuntu 24.04+): system packages and Wails CLI
sudo apt install build-essential pkg-config libgtk-3-dev libwebkit2gtk-4.1-dev
go install github.com/wailsapp/wails/v2/cmd/wails@v2.17.1

wails build -tags webkit2_41
build/bin/gosshpher ./config.example   # try it with the sample file
build/bin/gosshpher                    # edit ~/.ssh/config

scripts/install-linux.sh               # optional: install with menu entry to ~/.local
go test ./...                          # Go tests, incl. comparison with ssh -G
(cd frontend && npm test)              # frontend tests (Vitest)
```

macOS and Windows: see [Setup](docs/en/setup.md).

## Project structure

| Path                  | Content                                                                              |
| --------------------- | ------------------------------------------------------------------------------------ |
| `main.go`, `app.go`   | Wails entry point and the API bound to the frontend (load, save, resolve)            |
| `internal/sshconfig/` | Core library: parser, writer, evaluation, checks, groups                             |
| `frontend/`           | User interface (`index.html`, `src/main.js`, `src/style.css`) and generated bindings |
| `build/`              | Icons and platform files (macOS, Windows, Linux `.desktop`)                          |
| `scripts/`            | `icons.py` (derive icon sizes), `install-linux.sh` (install for the current user)    |
| `config.example`      | Sample configuration with fictitious hosts                                           |
| `config.example.d/`   | File included by the sample (demonstrates `Include`)                                 |
| `docs/`               | Documentation in English and German                                                  |

## Documentation

| Topic           | English                                       | Deutsch                                      |
| --------------- | --------------------------------------------- | -------------------------------------------- |
| Index           | [index](docs/en/index.md)                     | [Index](docs/de/index.md)                    |
| Overview        | [overview](docs/en/overview.md)               | [Überblick](docs/de/overview.md)             |
| Architecture    | [architecture](docs/en/architecture.md)       | [Architektur](docs/de/architecture.md)       |
| Setup           | [setup](docs/en/setup.md)                     | [Einrichtung](docs/de/setup.md)              |
| Usage           | [usage](docs/en/usage.md)                     | [Bedienung](docs/de/usage.md)                |
| Development     | [development](docs/en/development.md)         | [Entwicklung](docs/de/development.md)        |
| Troubleshooting | [troubleshooting](docs/en/troubleshooting.md) | [Fehlerbehebung](docs/de/troubleshooting.md) |
| Limitations     | [limitations](docs/en/limitations.md)         | [Einschränkungen](docs/de/limitations.md)    |

## Important notes

- Code signing for macOS (notarization) and Windows (Azure Artifact Signing) is prepared in the release workflow and runs once the secrets are configured; until then release builds are unsigned ([setup](docs/en/setup.md#code-signing)).
- `Match exec` commands are never run automatically: their result is assumed or run once after a confirmation; `localnetwork`/`canonical` are not evaluated ([limitations](docs/en/limitations.md#functional-limitations)).
- `config.*` files other than `config.example` are git-ignored because they may contain real server data.

## License

[Mozilla Public License 2.0](LICENSE)
