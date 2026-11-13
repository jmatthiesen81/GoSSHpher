# Usage

A guide to the GoSSHpher window: editing blocks, groups, the effective configuration and the hints. Try everything with [config.example](../../config.example).

## Window layout

| Area             | Content                                                                                                                                 |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Toolbar          | Open, *Save* with a ▾ menu for *Save as…*, ↶ ↷ (undo/redo), ↻ (reload), file path, unsaved marker, tabs *Editor* / *Text*, ⚙ (settings) |
| Left: host list  | All blocks with position number, aliases, `user@hostname:port`; filter, sorting, groups; buttons *+ Host*, *+ Match*, *+ Group*         |
| Middle: editor   | The selected block: patterns, group, comment, options                                                                                   |
| Right: inspector | Tab *Effective* (effective configuration) and tab *Hints*                                                                               |

The pane borders and the *Option* column can be dragged; a double click resets the width. Widths, sorting and collapsed groups are stored in the [settings file](architecture.md#settings-file).

The UI is available in English (default) and German; switch it in the [settings](#settings). The labels in this document refer to the English UI.

## Editing blocks

- **Patterns:** the aliases of a `Host` block, separated by spaces. Wildcards `*` and `?`, negation with `!pattern`. Literal aliases are shown as chips; clicking one shows its effective configuration.
- **Options:** keyword with autocompletion and description, value with suggestions for typical values. Cumulative keywords are marked *cumulative*. *+ Option*, *+ Comment* and quick buttons (`Hostname`, `User`, `Port`, `IdentityFile`, `ProxyJump`, `RemoteCommand`, `RequestTTY`, `LocalForward`) add lines. `Enter` in the last value adds a new row.
- **Comment:** the comment lines above the block.
- **Order:** drag a block in the list (file order view), use the arrow buttons (to top, up, down, to bottom) or `Alt+↑/↓`. Order matters because the first value wins.
- **New block:** *+ Host* inserts after the selected block, but never behind a trailing `Host *` defaults block. *Duplicate* copies the block, *Delete* removes it after a confirmation. Both are also in the *⋮* menu of every entry in the host list (shown on hover).
- **Connect in terminal:** in the editor or in the *⋮* menu of an entry. Opens a terminal window running `ssh <alias>` with the first alias without wildcards (not available for `Match` blocks and pure patterns). When the edited file is not `~/.ssh/config`, `ssh -F <file> <alias>` is run. ssh reads the file from disk, so GoSSHpher asks whether to save unsaved changes first. If ssh fails, the window stays open until `Enter` is pressed. The terminal is detected automatically (Linux: `$TERMINAL`, `x-terminal-emulator`, gnome-terminal, ptyxis, konsole, xfce4-terminal, tilix, kitty, alacritty, wezterm, foot, xterm; macOS: Terminal.app; Windows: Windows Terminal, otherwise `cmd`) and can be set in the settings, e.g. `kitty` or `gnome-terminal --`; the command is appended.
- **Global options:** options before the first `Host`/`Match` are shown as *global · Start of file*. If the start of the file only holds comments, it is listed as *File header* (without the *global* tag). `Host *` blocks are tagged *global*; the editor explains whether their values take precedence (not at the end) or are defaults (at the end).
- **Text view:** edit the raw file; switching back to the editor or *Apply* parses it again.

## Groups

Groups organise the host list and are stored as comment markers (see [Architecture](architecture.md#groups)). A group is always one contiguous run of blocks in the file.

**Create or edit a group:** *+ Group*, *New group…* in the editor's group field, ✎ or double click on a group header. The dialog has:

- a **name** field, checked for uniqueness (case-insensitive) and allowed characters;
- a **hosts** field with chips: typing searches aliases, hostname, user and group; `↓` lists all hosts; `Enter`/`Tab` adds; `Backspace` removes the last chip; pasting several names (`a b, c`) adds all known ones and reports unknown ones. Position numbers (`#24`) and the key file distinguish blocks with identical aliases.

**Several hosts at once:** `Ctrl/⌘+click` in the host list marks hosts – starting from the selected host and only directly adjacent ones (global blocks and collapsed groups interrupt the run); `Ctrl/⌘+click` on the first or last marked entry unmarks it. `Shift+click` marks all hosts from the selected one to the clicked one. *+ Group* then fills the **hosts** field with the marked hosts. A plain click or `Esc` clears the marks.

On confirmation the selected hosts are moved together, in their current file order, to the position of the first one. Hosts removed from an existing group are placed directly after it. **Before moving, the dialog computes the effective configuration of every literal alias before and after** and lists changed values; the change is only applied after *Apply anyway*. Removing all hosts dissolves the group.

**Other ways to change membership:**

| Action                                          | Result                                                                                    |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------- |
| *Group* select field in the editor              | Joins the chosen group (moved to its end) or leaves it (moved behind it if in the middle) |
| Drag a host onto a group header                 | Joins the group                                                                           |
| Drag a host between two hosts (file order view) | Takes the group of its neighbours if both are in the same group                           |
| `↑`/`↓` at the edge of a group                  | First press leaves or enters the group without moving                                     |
| Drag a group header (file order view)           | Moves the whole group; dropping onto another group snaps before/after it                  |
| ⊘ on a group header                             | Dissolves the group (hosts stay)                                                          |
| ▾/▸ on a group header                           | Collapse/expand                                                                           |

## Sorting and filtering

- **Sort:** *File order* (drag and drop enabled), *Alias A–Z*, *Hostname A–Z*. Sorting only affects the display. In sorted views global blocks come first, then groups alphabetically, then *No group*; dropping a host onto another host puts it into that host's group.
- *Hostname A–Z* uses the effective `Hostname`, so `Host github-work` sorts under the `ssh.github.com` it inherits from a shared block; blocks with only wildcard patterns sort by their pattern.
- **Filter** (`Ctrl+F`): all words must appear in patterns, `Hostname`, `User` or comments; a matching group name shows the whole group. `Enter` selects the first match.

## Effective configuration

The *Effective* tab shows what ssh would use for a host, like `ssh -G`:

- enter a host (pre-filled with the first alias of the selected block) and optionally a user for `ssh -l`;
- every option with its value(s) and the source block (click to jump); values that lost against earlier ones are struck through;
- for keywords with %-tokens, `${ENV}` or `~` (e.g. `IdentityFile`, `ControlPath`, `RemoteCommand`, `ProxyCommand`) a second line `→ …` shows the value ssh uses when connecting, e.g. `~/.ssh/sockets/%r@%h-%p` → `/home/me/.ssh/sockets/ci@ci.example.net-22`; only the tokens the keyword accepts are substituted;
- values from included files name their file; a click opens it in a new window;
- the matched blocks in order, and notes for `Match` criteria that cannot be evaluated offline.

Only options set in the file are listed, not ssh's built-in defaults.

### Match exec

`Match exec "command"` lets ssh run a command while reading the configuration; the block applies if the command succeeds (exit status 0), with `!exec` if it fails. A typical use is network detection, e.g. using a bastion host only outside the office network. GoSSHpher never runs these commands on its own. For each `exec` the host reaches, the *Match exec* section offers:

- *assume: fails* (default) or *assume: succeeds* – the evaluation uses the assumption, so both situations can be compared without running anything;
- *Run…* – after a confirmation that shows the exact command (with tokens substituted), the command runs once in your shell like ssh would run it (time limit 10 seconds); its result becomes the assumption.

Only commands that occur in the configuration for the displayed host can be run.

## Included files

For every `Include` line the editor lists the matching files (globs resolved, relative paths relative to the edited file). A click on a file, or on an included value in the *Effective* tab, opens it in a **new GoSSHpher window** – a second instance with its own history, saving and backup. The first window reads included files freshly for every evaluation, so changes saved in the second window are visible immediately.

## Hints

The *Hints* tab lists all findings, sorted by severity; clicking one selects the block and the line. Findings also appear inline in the editor and as a dot in the host list. See [Architecture → Checks](architecture.md#checks-analyze) for the full list.

## Saving

- `Ctrl+S` saves (in the text view the text is applied first).
- If backups are enabled (default), the first save per session creates `<file>.bak-YYYYMMDD-HHMMSS` next to the file; only the newest backup is kept unless configured otherwise.
- If the file was changed outside GoSSHpher since loading, a dialog offers *Overwrite*, *Reload* or *Cancel*.
- Closing the window with unsaved changes asks for confirmation.

## Settings

⚙ in the toolbar opens the settings:

| Setting                              | Effect                                                                                    |
| ------------------------------------ | ----------------------------------------------------------------------------------------- |
| *Language*                           | UI language; takes effect immediately                                                     |
| *Create a backup before overwriting* | Enables or disables backups                                                               |
| *Backups kept per file*              | Number of backups kept per file; `0` keeps all                                            |
| *Terminal*                           | Program for *Connect in terminal*, e.g. `kitty` or `gnome-terminal --`; empty = automatic |
| *Check for updates at start*         | Asks GitHub for a newer release at start (default: on)                                    |

The dialog also shows where the settings file is stored. Details: [Architecture → Settings file](architecture.md#settings-file).

## Update notice

At start GoSSHpher asks GitHub (`api.github.com`) in the background for the latest release. If there is a newer one, a notice appears in the bottom right corner with *View release* (opens the release page in the browser) and *Dismiss* (hides the notice until the next release). The check never blocks the application; without network it gives up silently after 5 seconds at the latest. Development builds (`dev`, `0.0.0`) do not check; the check can be switched off in the settings.

## Undo and redo

Every change of the document can be undone: `Ctrl/⌘+Z` or ↶ undoes, `Ctrl/⌘+Shift+Z`, `Ctrl/⌘+Y` or ↷ redoes (up to 200 steps). Typing in the same field counts as one step as long as the pauses are shorter than 1.5 seconds; moving, grouping, adding or deleting blocks are separate steps, and so is applying the text view. Opening or reloading a file starts a new history. In dialogs and in the text view the fields keep their own undo.

## Keyboard shortcuts

| Key                             | Action                                                       |
| ------------------------------- | ------------------------------------------------------------ |
| `Ctrl/⌘+S`                      | Save                                                         |
| `Ctrl/⌘+F`                      | Focus the host filter                                        |
| `Ctrl/⌘+Z`                      | Undo                                                         |
| `Ctrl/⌘+Shift+Z`, `Ctrl/⌘+Y`    | Redo                                                         |
| `Alt+↑` / `Alt+↓`               | Move the selected block (enters/leaves groups at their edge) |
| `Enter` in the last value       | Add an option row                                            |
| `Ctrl/⌘+click` in the host list | Mark an adjacent host / shrink the marks (for *+ Group*)     |
| `Shift+click` in the host list  | Mark all hosts from the selected one to the clicked one      |
| `Esc`                           | Close dialog / suggestion list, clear the marks              |

## Example file

[config.example](../../config.example) uses fictitious hosts and shows the typical constellations:

| Section             | Shows                                                                                                                                                                                   |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Start of file       | `Include config.example.d/*.conf` – opens [config.example.d/team.conf](../../config.example.d/team.conf) with team hosts (`IdentityFile ~/.ssh/work/%h`)                                |
| `[GitHub]`          | Two accounts via aliases on port 443: shared block plus per-alias key                                                                                                                   |
| `[GitLab]`          | Self-hosted GitLab on port 2222; a second block with identical patterns adds a key                                                                                                      |
| `[Shop]`            | One server for production and staging with per-alias `RemoteCommand` and `RequestTTY force`                                                                                             |
| `[Datacenter]`      | Bastion host, `Hostname %h.internal…`, `LocalForward`, a deliberate mistake in `Host db02`, and `Match … !exec "nc -z -w 1 %h 22"`: the bastion is only used outside the office network |
| Wildcard            | `*.example.org !test.example.org`                                                                                                                                                       |
| `Match user root`   | Admin key for `ssh -l root`                                                                                                                                                             |
| `Host *` at the end | Overridable defaults, connection sharing with `ControlPath ~/.ssh/sockets/%r@%h-%p`                                                                                                     |

The missing-key-file hints are expected: the key files do not exist.

[Index](index.md) · [Deutsch](../de/usage.md)
