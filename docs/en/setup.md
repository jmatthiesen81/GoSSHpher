# Setup

How to build GoSSHpher from source on Linux, macOS and Windows, install it and maintain the icons.

## Requirements

| Tool          | Version                                                      | Source                                                      |
| ------------- | ------------------------------------------------------------ | ----------------------------------------------------------- |
| Go            | ≥ 1.26 (`go 1.26.0` in [go.mod](../../go.mod))               | <https://go.dev/dl/>                                        |
| Node.js + npm | a version supported by Vite 7 (Node 20.19+ or 22.12+)        | <https://nodejs.org>                                        |
| Wails CLI     | v2 (the project uses `github.com/wailsapp/wails/v2 v2.17.1`) | `go install github.com/wailsapp/wails/v2/cmd/wails@v2.17.1` |

System packages per platform:

| Platform                       | Packages                                                                         | Notes                              |
| ------------------------------ | -------------------------------------------------------------------------------- | ---------------------------------- |
| Ubuntu 24.04+, Debian 13       | `sudo apt install build-essential pkg-config libgtk-3-dev libwebkit2gtk-4.1-dev` | Build with `-tags webkit2_41`      |
| Older Linux with WebKitGTK 4.0 | `libgtk-3-dev libwebkit2gtk-4.0-dev`                                             | Build without the tag              |
| macOS                          | `xcode-select --install`                                                         | Must be built on a Mac             |
| Windows                        | WebView2 runtime (preinstalled on Windows 10/11)                                 | Can also be cross-built from Linux |

`wails doctor` checks the installed dependencies.

## Build

```bash
wails build -tags webkit2_41            # Linux → build/bin/gosshpher
wails build                             # macOS (.app) / Windows (.exe) on that platform
wails build -platform windows/amd64     # Windows binary from Linux
wails build -platform darwin/universal  # on a Mac: Intel + Apple Silicon
```

Add `-trimpath` to keep local paths (and your user name) out of the binary. `wails build` installs the frontend dependencies (`npm install`), builds the frontend (`npm run build` → `frontend/dist`), regenerates the bindings in `frontend/wailsjs/` and compiles the Go binary. The commands come from [wails.json](../../wails.json).

Development mode with hot reload:

```bash
wails dev -tags webkit2_41
```

Prebuilt archives for all platforms are attached to the GitHub releases (see [Development → CI and releases](development.md#ci-and-releases)). The Linux archive contains `scripts/install-linux.sh`.

## Run

```bash
build/bin/gosshpher                    # edits ~/.ssh/config
build/bin/gosshpher ./config.example   # edits another file
```

The first argument is the file to edit if it does not start with `-`. A missing file starts an empty document; saving creates it (and its directory with mode `0700`).

## Install on Linux

[scripts/install-linux.sh](../../scripts/install-linux.sh) installs the built binary, the icons and a menu entry for the current user:

```bash
wails build -tags webkit2_41 && scripts/install-linux.sh
scripts/install-linux.sh --uninstall
```

| What       | Target                                                                                                                                                                                                                                      |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Binary     | `${XDG_BIN_HOME:-~/.local/bin}/gosshpher`                                                                                                                                                                                                   |
| Icons      | `${XDG_DATA_HOME:-~/.local/share}/icons/hicolor/<size>/apps/gosshpher.png` and `scalable/apps/gosshpher.svg`                                                                                                                                |
| Menu entry | `${XDG_DATA_HOME:-~/.local/share}/applications/de.netinventors.gosshpher.desktop` (from [build/linux/de.netinventors.gosshpher.desktop](../../build/linux/de.netinventors.gosshpher.desktop), `Exec` rewritten to the absolute binary path) |

The script refreshes the desktop database and icon cache if the tools exist. Run it again after every new build. The window sets the app id `de.netinventors.gosshpher` as program name (WM class / Wayland app id); it matches the name of the `.desktop` file and its `StartupWMClass`, so the desktop links the window to the menu entry and icon. Binary and icon keep the short name `gosshpher`.

## Code signing

Release builds are signed in [release.yml](../../.github/workflows/release.yml) when the required secrets are configured; without them the workflow builds unsigned binaries as before. Unsigned apps work, but macOS Gatekeeper blocks them on first start (right-click → *Open* for own use) and Windows shows a SmartScreen warning.

### macOS: Developer ID and notarization

Requires a membership in the Apple Developer Program.

1. Create a **Developer ID Application** certificate (Xcode → Settings → Accounts, or developer.apple.com), export it with its private key as `.p12` and a password.
2. Create an **App Store Connect API key** (App Store Connect → Users and Access → Integrations → Keys, role *Developer*) and download the `.p8` file.
3. Add the repository secrets:

| Secret                       | Content                     |
| ---------------------------- | --------------------------- |
| `MACOS_CERTIFICATE`          | `base64 -i certificate.p12` |
| `MACOS_CERTIFICATE_PASSWORD` | Password of the `.p12` file |
| `APPLE_API_KEY`              | Content of the `.p8` file   |
| `APPLE_API_KEY_ID`           | Key ID                      |
| `APPLE_API_ISSUER_ID`        | Issuer ID                   |

The workflow imports the certificate into a temporary keychain, signs the `.app` with hardened runtime (`codesign --options runtime --timestamp`), notarizes it with `notarytool`, staples the ticket and checks the result with `spctl`. The bundle id is `de.netinventors.gosshpher` ([build/darwin/Info.plist](../../build/darwin/Info.plist)). The app is not sandboxed, because it must read and write `~/.ssh/config`.

### Windows: Azure Artifact Signing

Code signing keys must be stored on hardware since 2023, so a `.pfx` file in a secret is no longer an option for new certificates. The workflow uses [Azure Artifact Signing](https://azure.microsoft.com/products/artifact-signing) (formerly Trusted Signing) with the official action `azure/artifact-signing-action`.

1. Create an Artifact Signing account and complete the identity validation in the Azure portal; create a certificate profile (*Public Trust*).
2. Create an app registration with a federated credential for this GitHub repository (OIDC, no client secret) and give it the role *Artifact Signing Certificate Profile Signer*.
3. Add the repository secrets `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID` and the repository variables:

| Variable                    | Example                                                      |
| --------------------------- | ------------------------------------------------------------ |
| `AZURE_SIGNING_ENDPOINT`    | `https://weu.codesigning.azure.net/` (region of the account) |
| `AZURE_SIGNING_ACCOUNT`     | Name of the Artifact Signing account                         |
| `AZURE_CERTIFICATE_PROFILE` | Name of the certificate profile                              |

The workflow signs `gosshpher.exe` with SHA-256 and an RFC 3161 timestamp and checks the signature with `Get-AuthenticodeSignature`. A free alternative for open-source projects is the [SignPath Foundation](https://signpath.org/); its certificate names the foundation as publisher, and it requires an application.

An NSIS installer can additionally be built with `wails build -nsis` (requires `nsis`; templates in [build/windows/installer/](../../build/windows/installer/)); the workflow does not build it yet.

## Icons

| File                                                           | Role                                                                     |
| -------------------------------------------------------------- | ------------------------------------------------------------------------ |
| [build/appicon.svg](../../build/appicon.svg)                   | Source design (terminal prompt and key on a rounded square)              |
| [build/appicon.png](../../build/appicon.png)                   | 1024×1024 export; Wails creates the macOS `.icns` from it                |
| [build/windows/icon.ico](../../build/windows/icon.ico)         | Windows icon, 16–256 px                                                  |
| [build/linux/icons/hicolor/](../../build/linux/icons/hicolor/) | Linux icons 16–512 px and SVG; the 256 px PNG is embedded as window icon |

To change the icon:

```bash
# 1. export build/appicon.svg to build/appicon.png (1024×1024), e.g.
rsvg-convert -w 1024 -h 1024 build/appicon.svg -o build/appicon.png
# 2. derive all sizes (needs Pillow)
python3 scripts/icons.py
# 3. rebuild
wails build -tags webkit2_41
```

[Index](index.md) · [Deutsch](../de/setup.md)
