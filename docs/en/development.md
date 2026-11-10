# Development

Code structure, tests and conventions for working on GoSSHpher.

## Repository layout

```
.
├── main.go, app.go, app_test.go   Wails entry point and bound API
├── internal/sshconfig/            core library (no UI, no Wails dependency)
├── frontend/
│   ├── index.html                 static layout, dialogs
│   ├── src/*.js                   UI logic as ES modules (see below)
│   ├── src/style.css              styles, light/dark theme
│   ├── wailsjs/                   generated bindings (checked in)
│   ├── test/                      Vitest unit tests
│   ├── vite.config.js             rewrites dist/.gitignore after each build
│   └── dist/                      build output (only its .gitignore is tracked)
├── build/                         icons and platform files (bin/ is ignored)
├── scripts/                       icons.py, install-linux.sh
└── config.example                 sample configuration
```

## Go

- `internal/sshconfig` is a plain Go package and can be used and tested without Wails.
- `app.go` is the only place that touches the file system for the edited file; it guards state with a mutex because Wails calls bound methods concurrently.
- New keywords go into the `keywords` slice in [keywords.go](../../internal/sshconfig/keywords.go): `Name`, `Multi` for cumulative keywords, optional `Values` for the value suggestions; the description goes into every catalog as `kw.<Name>`. Deprecated names go into the alias map below it.
- Language: code comments, script output and metadata (e.g. the `.desktop` file) are in English; metadata gets German translations (`[de]` keys). All UI texts come from the translation catalogs (see below).
- Formatting: `gofmt`; `go vet ./...` is clean.

## Frontend

- No framework; Vite only bundles and serves. The UI logic is split into ES modules in `frontend/src/`:

| Module                         | Content                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------ |
| `main.js`                      | Initialisation and wiring of all event handlers                                |
| `state.js`                     | Shared state `S`, helpers about blocks, persistence of view settings, collator |
| `sync.js`                      | `Update` calls to Go (debounced), status line                                  |
| `history.js`                   | Undo/redo: snapshots before each change, typing in one field coalesced         |
| `editor.js`                    | Block editor and block operations (move, duplicate, delete, add)               |
| `sidebar.js`                   | Host list, sorting, filter, drag and drop                                      |
| `groups.js` / `groupDialog.js` | Group logic / group dialog with autocompletion and change preview              |
| `inspector.js`                 | Hints panel and effective configuration                                        |
| `effective.js`                 | Pure helpers of the effective view (exec list, expanded values, labels)        |
| `files.js`                     | Save, reload, editor/text views, save split button                             |
| `settings.js`                  | Settings dialog and language switch                                            |
| `splitters.js`                 | Resizable panes                                                                |
| `ui.js`                        | Modal, toast, texts for keywords, issues and notes                             |
| `i18n.js`                      | `t()` / `th()` and translation of the static markup                            |

- The frontend keeps the edited config in `S.config` and calls `Update` debounced (`scheduleSync`). Structural changes (move, group, delete) go through `afterStructureChange()`, which keeps a blank line in front of moved blocks (`ensureSeparators`) and re-renders.
- Group invariant: a group is one contiguous run. Use `setBlockGroup`, `moveBlockTo` (with `inferGroup`), `moveGroupTo` or `planGroup` instead of setting `block.group` directly.
- View settings (`sort`, `collapsed`, `widths`) go through `store.get/set`, which keeps them in `S.ui` and saves them debounced via `SaveUISettings` into the [settings file](architecture.md#settings-file).
- Text selection is disabled outside inputs and copyable values (CSS `user-select`).

### Bindings

`frontend/wailsjs/go/main/App.js` and `models.ts` are generated from the exported methods of `App`. After adding or changing a bound method run:

```bash
wails generate module
```

(`wails build` and `wails dev` do this too.)

### Testing the UI

`wails dev -tags webkit2_41` opens the app window and also serves the frontend with working bindings at <http://localhost:34115>, so browser developer tools can be used.

## Translations

- Catalogs: [internal/i18n/locales/](../../internal/i18n/locales/), one flat JSON file per language (`key → text`, placeholders as `{name}`). They are embedded into the binary.
- Go renders only its own texts (native dialogs, error messages) with `i18n.T`. Everything else is translated in the frontend with `t(key, params)` / `th(key, params)` from [frontend/src/i18n.js](../../frontend/src/i18n.js); static markup uses `data-i18n`, `data-i18n-html`, `data-i18n-placeholder` and `data-i18n-title`. Keys ending in `_html` may contain markup.
- `internal/sshconfig` returns codes instead of texts (`Issue.Code`, `Note.Code`); add a catalog entry `issue.<code>` / `note.<code>` for every new code.
- Adding a language: copy `en.json` to `<code>.json`, translate the values and set `meta.name` to the language's own name. It then appears in the settings automatically.
- Tests check that all catalogs have the same keys and placeholders and that every issue code, note code and keyword has a text.

## Tests

```bash
go test ./...
```

| Test                                                                                       | Covers                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `TestRoundTrip`, `TestGroupsRoundTrip`, `TestGroupsHandFormatted`                          | Byte-identical parse → render for sample data, edge cases (empty, CRLF, no final newline), `config.example` and a local `config.template` if present                     |
| `TestStructure`, `TestEditKeepsUnchangedLines`, `TestGroupsEdit`                           | Block structure, comment attachment, regenerated lines, moving blocks, group markers                                                                                     |
| `TestMatchPattern`, `TestResolve`                                                          | Wildcards, negation, first value wins, cumulative keys, `Match host/user`                                                                                                |
| `TestAgainstOpenSSH`                                                                       | Compares `hostname`, `port`, `user`, `identityfile`, `remotecommand`, `requesttty`, `identitiesonly` with `ssh -G` for every literal alias (skipped if `ssh` is missing) |
| `TestAnalyzeShadowing`, `TestGroupsDuplicateAndBroken`                                     | Hints: shadowed and duplicate options, unknown keywords, `RequestTTY`, broken/duplicate group markers                                                                    |
| `TestDiffEffective`                                                                        | Effective-change preview                                                                                                                                                 |
| `TestExpandTokensPerKeyword`, `TestTokensAgainstOpenSSH`, `TestResolveExpanded`            | Token sets per keyword, `${ENV}`, `~`, `%C`; comparison with `ssh -G`                                                                                                    |
| `TestMatchExec`, `TestMatchExecAgainstOpenSSH`, `TestMatchExecSkippedAfterFailedCriterion` | Assumptions, negation, token expansion of the command, ssh running real commands                                                                                         |
| `TestIncludeFiles`, `TestKeyFileCheckWithTokens`, `TestConfigExample`                      | Include lookup and sources, token-aware key file checks, the features of `config.example`                                                                                |
| `TestOpenWindow`, `TestRunMatchExec` (main package)                                        | Second window only for regular files; only configured commands run, exit code, output, timeout                                                                           |
| `TestCatalogsComplete`, `TestT`, `TestCodesTranslated`                                     | Catalogs complete and consistent, fallback to English, texts for all codes and keywords                                                                                  |
| `TestSaveBackupConflictAndSymlink` (main package)                                          | Backup, mode preservation, symlink target, conflict detection, one backup per session                                                                                    |
| `TestPruneBackups` (main package)                                                          | Backup rotation keeps the newest five and ignores foreign files                                                                                                          |
| `TestSettings`, `TestSaveWithoutBackup` (main package)                                     | Settings defaults, partial and broken files, mode `0600`, disabled backups                                                                                               |

The frontend has unit tests with [Vitest](https://vitest.dev) in [frontend/test/](../../frontend/test/) (jsdom; the Go bindings and the rendering modules are mocked) and is linted with ESLint ([eslint.config.js](../../frontend/eslint.config.js): undefined names, unused code, writes to imported bindings):

```bash
cd frontend && npm test && npm run lint
```

| Test file           | Covers                                                                                                                                                               |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `groups.test.js`    | Group runs, name validation, `inferGroup`, `setBlockGroup`, `moveGroupTo`, `planGroup` (contiguous groups, no split of other groups, document untouched by the plan) |
| `history.test.js`   | Undo/redo steps, coalescing of typing per field and time, redo cleared by new changes, selection, independent snapshots                                              |
| `i18n.test.js`      | Placeholders and escaping, issue and note texts from codes, language switch, and that every literal key used in `src/` and `index.html` exists in all catalogs       |
| `effective.test.js` | `Match exec` list, expanded values, labels, texts of the new features                                                                                                |

## CI and releases

| Workflow                                           | Trigger                                 | Does                                                                                                                                             |
| -------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| [ci.yml](../../.github/workflows/ci.yml)           | Push to any branch, pull request        | `go vet`, `go test`, `gofmt` check; ESLint and Vitest for the frontend                                                                           |
| [release.yml](../../.github/workflows/release.yml) | Tag `1.2.3` (no `v` prefix), manual run | Tests, then builds Linux (amd64), Windows (amd64) and macOS (universal); on a tag it creates a GitHub release with the archives and `SHA256SUMS` |

Release steps:

```bash
git tag 1.0.0
git push origin 1.0.0
```

- The version is the tag name itself (`1.0.0`, pre-releases like `1.0.0-rc.1` also work and are marked as pre-release on GitHub) and written into `wails.json` (`info.productVersion`) during the build only; manual runs use `0.0.0` and keep the archives as workflow artifacts.
- The Wails CLI version is read from `go.mod`; builds use `-trimpath`, so no local paths end up in the binaries.
- Archives: `gosshpher-<version>-linux-amd64.tar.gz` (binary, icons, `.desktop` file and `scripts/install-linux.sh` in the repository layout), `…-windows-amd64.zip`, `…-macos-universal.zip` (`.app`), each with `LICENSE`, `README.md` and `config.example`.
- Builds are not signed (see [Setup](setup.md#code-signing)).

## Icons

See [Setup → Icons](setup.md#icons).

[Index](index.md) · [Deutsch](../de/development.md)
