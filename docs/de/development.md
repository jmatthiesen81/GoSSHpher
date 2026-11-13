# Entwicklung

Code-Struktur, Tests und Konventionen für die Arbeit an GoSSHpher.

## Aufbau des Repositorys

```
.
├── main.go, app.go, app_test.go   Wails-Einstiegspunkt und gebundene API
├── internal/sshconfig/            Kernbibliothek (ohne Oberfläche, ohne Wails-Abhängigkeit)
├── frontend/
│   ├── index.html                 statisches Layout, Dialoge
│   ├── src/*.js                   Oberflächenlogik als ES-Module (siehe unten)
│   ├── src/style.css              Styles, helles/dunkles Theme
│   ├── wailsjs/                   erzeugte Bindings (eingecheckt)
│   ├── test/                      Vitest unit tests
│   ├── vite.config.js             schreibt dist/.gitignore nach jedem Build neu
│   └── dist/                      Build-Ausgabe (nur ihre .gitignore ist eingecheckt)
├── build/                         Icons und Plattform-Dateien (bin/ wird ignoriert)
├── scripts/                       icons.py, install-linux.sh
└── config.example                 Beispielkonfiguration
```

## Go

- `internal/sshconfig` ist ein normales Go-Paket und lässt sich ohne Wails nutzen und testen.
- `app.go` ist die einzige Stelle, die für die bearbeitete Datei auf das Dateisystem zugreift; ein Mutex schützt den Zustand, weil Wails gebundene Methoden nebenläufig aufruft.
- Neue Keywords kommen in das Slice `keywords` in [keywords.go](../../internal/sshconfig/keywords.go): `Name`, `Multi` für kumulative Keywords, optional `Values` für die Wertvorschläge; die Beschreibung kommt in jeden Katalog als `kw.<Name>`. Veraltete Namen gehören in die Alias-Map darunter.
- Sprache: Code-Kommentare, Ausgaben von Skripten und Metadaten (z. B. die `.desktop`-Datei) sind englisch; Metadaten bekommen deutsche Übersetzungen (`[de]`-Schlüssel). Alle Texte der Oberfläche stammen aus den Übersetzungskatalogen (siehe unten).
- Formatierung: `gofmt`; `go vet ./...` meldet nichts.

## Frontend

- Kein Framework; Vite bündelt und liefert nur aus. Die Oberflächenlogik ist auf ES-Module in `frontend/src/` verteilt:

| Modul                          | Inhalt                                                                                             |
| ------------------------------ | -------------------------------------------------------------------------------------------------- |
| `main.js`                      | Initialisierung und Verdrahtung aller Event-Handler                                                |
| `state.js`                     | Gemeinsamer Zustand `S`, Hilfsfunktionen zu Blöcken, Speichern der Ansichtseinstellungen, Collator |
| `sync.js`                      | `Update`-Aufrufe an Go (entprellt), Statuszeile                                                    |
| `history.js`                   | Rückgängig/Wiederholen: Schnappschüsse vor jeder Änderung, Tippen in einem Feld zusammengefasst    |
| `editor.js`                    | Block-Editor und Block-Operationen (verschieben, duplizieren, löschen, hinzufügen)                 |
| `sidebar.js`                   | Host-Liste, Sortierung, Filter, Drag & Drop                                                        |
| `groups.js` / `groupDialog.js` | Gruppenlogik / Gruppen-Dialog mit Autovervollständigung und Änderungsvorschau                      |
| `inspector.js`                 | Hinweise und effektive Konfiguration                                                               |
| `effective.js`                 | Reine Hilfsfunktionen der effektiven Ansicht (exec-Liste, aufgelöste Werte, Labels)                |
| `files.js`                     | Speichern, Neu laden, Editor-/Textansicht, Speichern-Split-Button                                  |
| `settings.js`                  | Einstellungsdialog und Sprachwechsel                                                               |
| `splitters.js`                 | Veränderbare Bereiche                                                                              |
| `ui.js`                        | Modal, Toast, Texte für Keywords, Hinweise und Notizen                                             |
| `i18n.js`                      | `t()` / `th()` und Übersetzung des statischen Markups                                              |

- Das Frontend hält die bearbeitete Config in `S.config` und ruft `Update` entprellt auf (`scheduleSync`). Strukturelle Änderungen (Verschieben, Gruppieren, Löschen) laufen über `afterStructureChange()`, das vor verschobenen Blöcken eine Leerzeile sicherstellt (`ensureSeparators`) und neu zeichnet.
- Invariante für Gruppen: Eine Gruppe ist ein zusammenhängender Abschnitt. Statt `block.group` direkt zu setzen, `setBlockGroup`, `moveBlockTo` (mit `inferGroup`), `moveGroupTo` oder `planGroup` verwenden.
- Ansichtseinstellungen (`sort`, `collapsed`, `widths`) laufen über `store.get/set`, das sie in `S.ui` hält und entprellt per `SaveUISettings` in die [Einstellungsdatei](architecture.md#einstellungsdatei) schreibt.
- Markieren von Text ist außerhalb von Eingabefeldern und kopierbaren Werten abgeschaltet (CSS `user-select`).

### Bindings

`frontend/wailsjs/go/main/App.js` und `models.ts` werden aus den exportierten Methoden von `App` erzeugt. Nach dem Hinzufügen oder Ändern einer gebundenen Methode:

```bash
wails generate module
```

(`wails build` und `wails dev` erledigen das ebenfalls.)

### Oberfläche testen

`wails dev -tags webkit2_41` öffnet das App-Fenster und liefert das Frontend zusätzlich mit funktionierenden Bindings unter <http://localhost:34115> aus, sodass die Entwicklerwerkzeuge des Browsers nutzbar sind.

## Übersetzungen

- Kataloge: [internal/i18n/locales/](../../internal/i18n/locales/), eine flache JSON-Datei pro Sprache (`Schlüssel → Text`, Platzhalter als `{name}`). Sie sind in das Binary eingebettet.
- Go übersetzt nur seine eigenen Texte (native Dialoge, Fehlermeldungen) mit `i18n.T`. Alles andere übersetzt das Frontend mit `t(key, params)` / `th(key, params)` aus [frontend/src/i18n.js](../../frontend/src/i18n.js); statisches Markup nutzt `data-i18n`, `data-i18n-html`, `data-i18n-placeholder` und `data-i18n-title`. Schlüssel mit der Endung `_html` dürfen Markup enthalten.
- `internal/sshconfig` liefert Codes statt Texten (`Issue.Code`, `Note.Code`); für jeden neuen Code einen Katalogeintrag `issue.<code>` / `note.<code>` anlegen.
- Eine Sprache hinzufügen: `en.json` nach `<code>.json` kopieren, die Werte übersetzen und `meta.name` auf den Namen der Sprache in ihr selbst setzen. Sie erscheint dann automatisch in den Einstellungen.
- Tests prüfen, dass alle Kataloge dieselben Schlüssel und Platzhalter haben und dass jeder Hinweis-Code, jede Notiz und jedes Keyword einen Text hat.

## Tests

```bash
go test ./...
```

| Test                                                                                       | Prüft                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `TestRoundTrip`, `TestGroupsRoundTrip`, `TestGroupsHandFormatted`                          | Byte-identisches Einlesen → Ausgeben für Testdaten, Sonderfälle (leer, CRLF, ohne abschließenden Zeilenumbruch), `config.example` und eine lokale `config.template`, falls vorhanden |
| `TestStructure`, `TestEditKeepsUnchangedLines`, `TestGroupsEdit`                           | Blockstruktur, Zuordnung von Kommentaren, neu erzeugte Zeilen, Verschieben von Blöcken, Gruppen-Marker                                                                               |
| `TestMatchPattern`, `TestResolve`                                                          | Wildcards, Negation, erster Wert gewinnt, kumulative Keywords, `Match host/user`                                                                                                     |
| `TestAgainstOpenSSH`                                                                       | Vergleicht `hostname`, `port`, `user`, `identityfile`, `remotecommand`, `requesttty`, `identitiesonly` mit `ssh -G` für jeden festen Alias (übersprungen, wenn `ssh` fehlt)          |
| `TestAnalyzeShadowing`, `TestGroupsDuplicateAndBroken`                                     | Hinweise: überdeckte und doppelte Optionen, unbekannte Keywords, `RequestTTY`, defekte/doppelte Gruppen-Marker                                                                       |
| `TestDiffEffective`                                                                        | Vorschau geänderter effektiver Werte                                                                                                                                                 |
| `TestExpandTokensPerKeyword`, `TestTokensAgainstOpenSSH`, `TestResolveExpanded`            | Token-Mengen je Keyword, `${ENV}`, `~`, `%C`; Vergleich mit `ssh -G`                                                                                                                 |
| `TestMatchExec`, `TestMatchExecAgainstOpenSSH`, `TestMatchExecSkippedAfterFailedCriterion` | Annahmen, Negation, Tokens im Befehl, ssh führt echte Befehle aus                                                                                                                    |
| `TestIncludeFiles`, `TestKeyFileCheckWithTokens`, `TestConfigExample`                      | Suche eingebundener Dateien und Quellen, token-abhängige Prüfung der Schlüsseldateien, die Funktionen von `config.example`                                                           |
| `TestOpenWindow`, `TestRunMatchExec` (Paket main)                                          | Zweites Fenster nur für reguläre Dateien; nur konfigurierte Befehle laufen, Exit-Code, Ausgabe, Zeitlimit                                                                            |
| `TestCatalogsComplete`, `TestT`, `TestCodesTranslated`                                     | Kataloge vollständig und konsistent, Fallback auf Englisch, Texte für alle Codes und Keywords                                                                                        |
| `TestSaveBackupConflictAndSymlink` (Paket main)                                            | Backup, Erhalt der Rechte, Symlink-Ziel, Konflikterkennung, ein Backup pro Sitzung                                                                                                   |
| `TestPruneBackups` (Paket main)                                                            | Rotation behält die neuesten fünf Backups und ignoriert fremde Dateien                                                                                                               |
| `TestSettings`, `TestSaveWithoutBackup` (Paket main)                                       | Standardwerte, unvollständige und defekte Einstellungsdateien, Rechte `0600`, abgeschaltete Backups                                                                                  |

Das Frontend hat Unit-Tests mit [Vitest](https://vitest.dev) in [frontend/test/](../../frontend/test/) (jsdom; Go-Bindings und Rendering-Module sind gemockt) und wird mit ESLint geprüft ([eslint.config.js](../../frontend/eslint.config.js): undefinierte Namen, ungenutzter Code, Zuweisungen an importierte Bindings):

```bash
cd frontend && npm test && npm run lint
```

| Testdatei           | Prüft                                                                                                                                                                                        |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `groups.test.js`    | Gruppenabschnitte, Namensprüfung, `inferGroup`, `setBlockGroup`, `moveGroupTo`, `planGroup` (zusammenhängende Gruppen, keine Aufspaltung anderer Gruppen, Plan verändert das Dokument nicht) |
| `history.test.js`   | Rückgängig/Wiederholen, Zusammenfassen von Tippen nach Feld und Zeit, Redo wird durch neue Änderungen geleert, Auswahl, unabhängige Schnappschüsse                                           |
| `i18n.test.js`      | Platzhalter und Escaping, Texte von Hinweisen und Notizen aus Codes, Sprachwechsel, und dass jeder in `src/` und `index.html` verwendete Schlüssel in allen Katalogen existiert              |
| `effective.test.js` | `Match exec`-Liste, aufgelöste Werte, Labels, Texte der neuen Funktionen                                                                                                                     |

## CI und Releases

| Workflow                                           | Auslöser                                       | Macht                                                                                                                                                    |
| -------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [ci.yml](../../.github/workflows/ci.yml)           | Push auf jeden Branch, Pull Request            | `go vet`, `go test`, `gofmt`-Prüfung; ESLint und Vitest für das Frontend                                                                                 |
| [release.yml](../../.github/workflows/release.yml) | Tag `1.2.3` (ohne `v`-Präfix), manueller Start | Tests, dann Builds für Linux (amd64), Windows (amd64) und macOS (universal); bei einem Tag entsteht ein GitHub-Release mit den Archiven und `SHA256SUMS` |

Ein Release erstellen:

1. Änderungen während der Arbeit in [CHANGELOG.md](../../CHANGELOG.md) unter `## [Unreleased]` sammeln.
2. [scripts/release.sh](../../scripts/release.sh) mit sauberem Arbeitsverzeichnis aufrufen. Es macht aus `## [Unreleased]` ein `## [1.2.0] - <heute>`, legt darüber ein neues leeres `## [Unreleased]` an, passt die Vergleichs-Links am Ende an, committet (`chore(release): 1.2.0`) und legt einen annotierten Tag an. Ein von Hand vorbereiteter Abschnitt `## [1.2.0]` wird unverändert verwendet. Vorabversionen (`1.2.0-rc.1`) bekommen nur den Tag. Gepusht wird nichts.
3. Branch und Tag pushen; der Tag startet den Release-Workflow:

```bash
scripts/release.sh 1.2.0 --dry-run   # optional: CHANGELOG-Diff und Release-Notes anzeigen
scripts/release.sh 1.2.0
git push origin 1.2
git push origin 1.2.0
```

Das Skript lehnt ungültige Versionen (`v1.2.0`), vorhandene Tags, uncommittete Änderungen und einen leeren Abschnitt `[Unreleased]` ab und weist darauf hin, wenn der Branch-Name (`1.1`) nicht zur Version passt. Vor dem Pushen macht `git tag -d 1.2.0` (und `git reset --hard HEAD~1`, falls committet wurde) alles rückgängig.

- Die Version ist der Tag-Name selbst (`1.0.0`, auch Vorabversionen wie `1.0.0-rc.1`, die auf GitHub als Pre-Release markiert werden) und wird nur während des Builds in `wails.json` (`info.productVersion`) geschrieben; manuelle Läufe nutzen `0.0.0` und behalten die Archive als Workflow-Artefakte.
- Die Release-Notes sind der CHANGELOG-Abschnitt der Version ([scripts/changelog-section.sh](../../scripts/changelog-section.sh)), gefolgt von den Notes, die GitHub erzeugt (gemergte Pull Requests, Link *Full Changelog*). Ein Tag ohne eigenen Abschnitt stoppt den Workflow schon im Test-Job, vor den Builds; Vorabversionen greifen auf den Abschnitt der Basisversion (`1.2.0` für `1.2.0-rc.1`) und dann auf `[Unreleased]` zurück. Lokal prüfen mit `scripts/changelog-section.sh 1.2.0`.
- Die Version der Wails-CLI wird aus `go.mod` gelesen; gebaut wird mit `-trimpath`, damit keine lokalen Pfade in den Binaries landen.
- Archive: `gosshpher-<version>-linux-amd64.tar.gz` (Binary, Icons, `.desktop`-Datei und `scripts/install-linux.sh` in der Struktur des Repositorys), `…-windows-amd64.zip`, `…-macos-universal.zip` (`.app`), jeweils mit `LICENSE`, `README.md`, `CHANGELOG.md` und `config.example`.
- Die Builds sind nicht signiert (siehe [Einrichtung](setup.md#code-signing)).

## Icons

Siehe [Einrichtung → Icons](setup.md#icons).

[Index](index.md) · [English](../en/development.md)
