# Einrichtung

Wie GoSSHpher unter Linux, macOS und Windows aus dem Quellcode gebaut und installiert wird und wie die Icons gepflegt werden.

## Voraussetzungen

| Werkzeug      | Version                                                        | Bezugsquelle                                                |
| ------------- | -------------------------------------------------------------- | ----------------------------------------------------------- |
| Go            | ≥ 1.26 (`go 1.26.0` in [go.mod](../../go.mod))                 | <https://go.dev/dl/>                                        |
| Node.js + npm | eine von Vite 7 unterstützte Version (Node 20.19+ oder 22.12+) | <https://nodejs.org>                                        |
| Wails-CLI     | v2 (das Projekt nutzt `github.com/wailsapp/wails/v2 v2.17.1`)  | `go install github.com/wailsapp/wails/v2/cmd/wails@v2.17.1` |

Systempakete je Plattform:

| Plattform                       | Pakete                                                                           | Hinweise                            |
| ------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------- |
| Ubuntu 24.04+, Debian 13        | `sudo apt install build-essential pkg-config libgtk-3-dev libwebkit2gtk-4.1-dev` | Mit `-tags webkit2_41` bauen        |
| Älteres Linux mit WebKitGTK 4.0 | `libgtk-3-dev libwebkit2gtk-4.0-dev`                                             | Ohne das Tag bauen                  |
| macOS                           | `xcode-select --install`                                                         | Muss auf einem Mac gebaut werden    |
| Windows                         | WebView2-Runtime (bei Windows 10/11 vorinstalliert)                              | Kann auch unter Linux gebaut werden |

`wails doctor` prüft die installierten Abhängigkeiten.

## Build

```bash
wails build -tags webkit2_41            # Linux → build/bin/gosshpher
wails build                             # macOS (.app) / Windows (.exe) auf der jeweiligen Plattform
wails build -platform windows/amd64     # Windows-Binary unter Linux
wails build -platform darwin/universal  # auf einem Mac: Intel + Apple Silicon
```

Mit `-trimpath` landen keine lokalen Pfade (und damit auch nicht der Benutzername) im Binary. `wails build` installiert die Frontend-Abhängigkeiten (`npm install`), baut das Frontend (`npm run build` → `frontend/dist`), erzeugt die Bindings in `frontend/wailsjs/` neu und kompiliert das Go-Binary. Die Befehle stammen aus [wails.json](../../wails.json).

Entwicklungsmodus mit Hot Reload:

```bash
wails dev -tags webkit2_41
```

Fertige Archive für alle Plattformen hängen an den GitHub-Releases (siehe [Entwicklung → CI und Releases](development.md#ci-und-releases)). Das Linux-Archiv enthält `scripts/install-linux.sh`.

## Starten

```bash
build/bin/gosshpher                    # bearbeitet ~/.ssh/config
build/bin/gosshpher ./config.example   # bearbeitet eine andere Datei
```

Das erste Argument ist die zu bearbeitende Datei, sofern es nicht mit `-` beginnt. Eine fehlende Datei startet ein leeres Dokument; beim Speichern wird sie angelegt (samt Verzeichnis mit Rechten `0700`).

## Installation unter Linux

[scripts/install-linux.sh](../../scripts/install-linux.sh) installiert das gebaute Binary, die Icons und einen Menüeintrag für den aktuellen Benutzer:

```bash
wails build -tags webkit2_41 && scripts/install-linux.sh
scripts/install-linux.sh --uninstall
```

| Was         | Ziel                                                                                                                                                                                                                                                  |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Binary      | `${XDG_BIN_HOME:-~/.local/bin}/gosshpher`                                                                                                                                                                                                             |
| Icons       | `${XDG_DATA_HOME:-~/.local/share}/icons/hicolor/<größe>/apps/gosshpher.png` und `scalable/apps/gosshpher.svg`                                                                                                                                         |
| Menüeintrag | `${XDG_DATA_HOME:-~/.local/share}/applications/de.netinventors.gosshpher.desktop` (aus [build/linux/de.netinventors.gosshpher.desktop](../../build/linux/de.netinventors.gosshpher.desktop), `Exec` auf den absoluten Pfad des Binarys umgeschrieben) |

Das Skript aktualisiert Desktop-Datenbank und Icon-Cache, wenn die Werkzeuge vorhanden sind. Nach jedem neuen Build muss es erneut laufen. Das Fenster setzt die App-ID `de.netinventors.gosshpher` als Programmnamen (WM-Klasse / Wayland-App-ID); sie entspricht dem Namen der `.desktop`-Datei und deren `StartupWMClass`, sodass der Desktop Fenster, Menüeintrag und Icon zusammenbringt. Binary und Icon behalten den kurzen Namen `gosshpher`.

## Code-Signing

Release-Builds werden in [release.yml](../../.github/workflows/release.yml) signiert, sobald die nötigen Secrets eingerichtet sind; ohne sie baut der Workflow wie bisher unsignierte Binaries. Unsignierte Apps funktionieren, aber Gatekeeper unter macOS blockiert sie beim ersten Start (für den Eigenbedarf: Rechtsklick → *Öffnen*), und Windows zeigt eine SmartScreen-Warnung.

### macOS: Developer ID und Notarisierung

Voraussetzung ist eine Mitgliedschaft im Apple Developer Program.

1. Ein Zertifikat **Developer ID Application** erstellen (Xcode → Einstellungen → Accounts oder developer.apple.com) und mit privatem Schlüssel als `.p12` samt Passwort exportieren.
2. Einen **App-Store-Connect-API-Schlüssel** anlegen (App Store Connect → Benutzer und Zugriff → Integrationen → Schlüssel, Rolle *Entwickler*) und die `.p8`-Datei herunterladen.
3. Die Repository-Secrets anlegen:

| Secret                       | Inhalt                      |
| ---------------------------- | --------------------------- |
| `MACOS_CERTIFICATE`          | `base64 -i certificate.p12` |
| `MACOS_CERTIFICATE_PASSWORD` | Passwort der `.p12`-Datei   |
| `APPLE_API_KEY`              | Inhalt der `.p8`-Datei      |
| `APPLE_API_KEY_ID`           | Key ID                      |
| `APPLE_API_ISSUER_ID`        | Issuer ID                   |

Der Workflow importiert das Zertifikat in einen temporären Schlüsselbund, signiert die `.app` mit Hardened Runtime (`codesign --options runtime --timestamp`), lässt sie mit `notarytool` notarisieren, heftet das Ticket an (`stapler`) und prüft das Ergebnis mit `spctl`. Die Bundle-ID ist `de.netinventors.gosshpher` ([build/darwin/Info.plist](../../build/darwin/Info.plist)). Die App läuft ohne Sandbox, weil sie `~/.ssh/config` lesen und schreiben muss.

### Windows: Azure Artifact Signing

Code-Signing-Schlüssel müssen seit 2023 auf Hardware liegen; eine `.pfx`-Datei als Secret ist für neue Zertifikate daher keine Option mehr. Der Workflow nutzt [Azure Artifact Signing](https://azure.microsoft.com/products/artifact-signing) (früher Trusted Signing) mit der offiziellen Action `azure/artifact-signing-action`.

1. Ein Artifact-Signing-Konto anlegen und die Identitätsprüfung im Azure-Portal abschließen; ein Zertifikatsprofil (*Public Trust*) erstellen.
2. Eine App-Registrierung mit föderierten Anmeldeinformationen für dieses GitHub-Repository anlegen (OIDC, kein Client-Secret) und ihr die Rolle *Artifact Signing Certificate Profile Signer* geben.
3. Die Repository-Secrets `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID` und die Repository-Variablen anlegen:

| Variable                    | Beispiel                                                 |
| --------------------------- | -------------------------------------------------------- |
| `AZURE_SIGNING_ENDPOINT`    | `https://weu.codesigning.azure.net/` (Region des Kontos) |
| `AZURE_SIGNING_ACCOUNT`     | Name des Artifact-Signing-Kontos                         |
| `AZURE_CERTIFICATE_PROFILE` | Name des Zertifikatsprofils                              |

Der Workflow signiert `gosshpher.exe` mit SHA-256 und RFC-3161-Zeitstempel und prüft die Signatur mit `Get-AuthenticodeSignature`. Eine kostenlose Alternative für Open-Source-Projekte ist die [SignPath Foundation](https://signpath.org/); deren Zertifikat nennt die Stiftung als Herausgeber, und sie setzt eine Bewerbung voraus.

Einen NSIS-Installer erzeugt zusätzlich `wails build -nsis` (benötigt `nsis`; Vorlagen in [build/windows/installer/](../../build/windows/installer/)); der Workflow baut ihn noch nicht.

## Icons

| Datei                                                          | Rolle                                                                          |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| [build/appicon.svg](../../build/appicon.svg)                   | Vorlage (Terminal-Prompt und Schlüssel auf abgerundetem Quadrat)               |
| [build/appicon.png](../../build/appicon.png)                   | Export in 1024×1024; Wails erzeugt daraus das macOS-`.icns`                    |
| [build/windows/icon.ico](../../build/windows/icon.ico)         | Windows-Icon, 16–256 px                                                        |
| [build/linux/icons/hicolor/](../../build/linux/icons/hicolor/) | Linux-Icons 16–512 px und SVG; das 256-px-PNG ist als Fenster-Icon eingebettet |

Icon ändern:

```bash
# 1. build/appicon.svg nach build/appicon.png exportieren (1024×1024), z. B.
rsvg-convert -w 1024 -h 1024 build/appicon.svg -o build/appicon.png
# 2. alle Größen ableiten (benötigt Pillow)
python3 scripts/icons.py
# 3. neu bauen
wails build -tags webkit2_41
```

[Index](index.md) · [English](../en/setup.md)
