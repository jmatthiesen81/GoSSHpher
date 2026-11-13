# Bedienung

Eine Anleitung für das GoSSHpher-Fenster: Blöcke bearbeiten, Gruppen, effektive Konfiguration und Hinweise. Alles lässt sich mit [config.example](../../config.example) ausprobieren.

## Aufbau des Fensters

| Bereich           | Inhalt                                                                                                                                                                                               |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Werkzeugleiste    | Öffnen, *Speichern* mit ▾-Menü für *Speichern unter…*, ↶ ↷ (rückgängig/wiederholen), ↻ (neu laden), Dateipfad, Markierung für ungespeicherte Änderungen, Reiter *Editor* / *Text*, ⚙ (Einstellungen) |
| Links: Host-Liste | Alle Blöcke mit Positionsnummer, Aliasen, `user@hostname:port`; Filter, Sortierung, Gruppen; Buttons *+ Host*, *+ Match*, *+ Gruppe*                                                                 |
| Mitte: Editor     | Der ausgewählte Block: Muster, Gruppe, Kommentar, Optionen                                                                                                                                           |
| Rechts: Inspector | Reiter *Effektiv* (effektive Konfiguration) und Reiter *Hinweise*                                                                                                                                    |

Die Grenzen zwischen den Bereichen und die Spalte *Option* lassen sich ziehen; ein Doppelklick setzt die Breite zurück. Breiten, Sortierung und eingeklappte Gruppen landen in der [Einstellungsdatei](architecture.md#einstellungsdatei).

Die Oberfläche gibt es auf Englisch (Standard) und Deutsch; umgestellt wird sie in den [Einstellungen](#einstellungen). Die Beschriftungen in diesem Dokument beziehen sich auf die deutsche Oberfläche.

## Blöcke bearbeiten

- **Muster:** die Aliase eines `Host`-Blocks, durch Leerzeichen getrennt. Wildcards `*` und `?`, Negation mit `!muster`. Feste Aliase erscheinen als Chips; ein Klick zeigt ihre effektive Konfiguration.
- **Optionen:** Keyword mit Autovervollständigung und Beschreibung, Wert mit Vorschlägen für typische Werte. Kumulative Keywords sind mit *kumulativ* markiert. *+ Option*, *+ Kommentar* und die Schnell-Buttons (`Hostname`, `User`, `Port`, `IdentityFile`, `ProxyJump`, `RemoteCommand`, `RequestTTY`, `LocalForward`) fügen Zeilen hinzu. `Enter` im letzten Wert legt eine neue Zeile an.
- **Kommentar:** die Kommentarzeilen über dem Block.
- **Reihenfolge:** Block in der Liste ziehen (Ansicht „Wie in der Datei“), Pfeil-Buttons (an den Anfang, hoch, runter, ans Ende) oder `Alt+↑/↓`. Die Reihenfolge zählt, weil der erste Wert gewinnt.
- **Neuer Block:** *+ Host* fügt nach dem ausgewählten Block ein, aber nie hinter einen `Host *`-Block mit Standardwerten am Dateiende. *Duplizieren* kopiert den Block, *Löschen* entfernt ihn nach einer Rückfrage. Beides gibt es auch im Menü *⋮* jedes Eintrags der Host-Liste (erscheint beim Überfahren).
- **Im Terminal verbinden:** im Editor oder im Menü *⋮* eines Eintrags. Öffnet ein Terminalfenster mit `ssh <alias>`, wobei der erste Alias ohne Wildcard verwendet wird (für `Match`-Blöcke und reine Muster nicht verfügbar). Ist die bearbeitete Datei nicht `~/.ssh/config`, wird `ssh -F <datei> <alias>` aufgerufen. ssh liest die Datei von der Festplatte, daher fragt GoSSHpher bei ungespeicherten Änderungen, ob vorher gespeichert werden soll. Schlägt ssh fehl, bleibt das Fenster offen, bis `Enter` gedrückt wird. Das Terminal wird automatisch erkannt (Linux: `$TERMINAL`, `x-terminal-emulator`, gnome-terminal, ptyxis, konsole, xfce4-terminal, tilix, kitty, alacritty, wezterm, foot, xterm; macOS: Terminal.app; Windows: Windows Terminal, sonst `cmd`) und lässt sich in den Einstellungen festlegen, z. B. `kitty` oder `gnome-terminal --`; der Befehl wird angehängt.
- **Globale Optionen:** Optionen vor dem ersten `Host`/`Match` erscheinen als *global · Dateianfang*. Stehen am Dateianfang nur Kommentare, erscheint er als *Dateikopf* (ohne *global*-Markierung). `Host *`-Blöcke sind mit *global* markiert; der Editor erklärt, ob ihre Werte Vorrang haben (nicht am Ende) oder Standardwerte sind (am Ende).
- **Textansicht:** die Datei direkt bearbeiten; beim Wechsel zurück in den Editor oder mit *Übernehmen* wird sie neu eingelesen.

## Gruppen

Gruppen ordnen die Host-Liste und werden als Kommentar-Marker gespeichert (siehe [Architektur](architecture.md#gruppen)). Eine Gruppe ist in der Datei immer ein zusammenhängender Abschnitt.

**Gruppe anlegen oder bearbeiten:** *+ Gruppe*, *Neue Gruppe…* im Gruppenfeld des Editors, ✎ oder Doppelklick auf einen Gruppenkopf. Der Dialog enthält:

- ein Feld **Name**, das auf Eindeutigkeit (ohne Unterscheidung der Groß-/Kleinschreibung) und erlaubte Zeichen geprüft wird;
- ein Feld **Hosts** mit Chips: Tippen sucht in Aliasen, Hostname, User und Gruppe; `↓` zeigt alle Hosts; `Enter`/`Tab` fügt hinzu; `Backspace` entfernt den letzten Chip; Einfügen mehrerer Namen (`a b, c`) übernimmt alle bekannten und meldet unbekannte. Positionsnummern (`#24`) und die Schlüsseldatei unterscheiden Blöcke mit gleichen Aliasen.

**Mehrere Hosts auf einmal:** `Strg/⌘+Klick` in der Host-Liste markiert Hosts – ausgehend vom ausgewählten Host und nur direkt benachbarte derselben Gruppe (Gruppengrenzen und globale Blöcke unterbrechen die Reihe, damit nie Hosts aus mehreren Gruppen auf einmal herausgelöst werden); `Strg/⌘+Klick` auf das erste oder letzte markierte Element nimmt es wieder heraus. `Umschalt+Klick` markiert alle Hosts vom ausgewählten bis zum angeklickten Host. *+ Gruppe* übernimmt die markierten Hosts dann in das Feld **Hosts**. Ein normaler Klick oder `Esc` hebt die Markierung auf.

Beim Bestätigen werden die gewählten Hosts in ihrer bisherigen Datei-Reihenfolge an die Stelle des ersten zusammengeschoben. Hosts, die aus einer bestehenden Gruppe entfernt werden, landen direkt dahinter. **Vor dem Verschieben berechnet der Dialog die effektive Konfiguration jedes festen Alias vorher und nachher** und listet geänderte Werte auf; übernommen wird erst nach *Trotzdem übernehmen*. Werden alle Hosts entfernt, wird die Gruppe aufgelöst.

**Weitere Wege, die Zugehörigkeit zu ändern:**

| Aktion                                                       | Ergebnis                                                                                                                          |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Auswahlfeld *Gruppe* im Editor                               | Tritt der gewählten Gruppe bei (ans Ende verschoben) oder verlässt sie (hinter die Gruppe verschoben, wenn er in der Mitte steht) |
| Host auf einen Gruppenkopf ziehen                            | Tritt der Gruppe bei                                                                                                              |
| Host zwischen zwei Hosts ziehen (Ansicht „Wie in der Datei“) | Übernimmt die Gruppe der Nachbarn, wenn beide in derselben Gruppe sind                                                            |
| `↑`/`↓` am Rand einer Gruppe                                 | Der erste Druck verlässt oder betritt die Gruppe, ohne zu verschieben                                                             |
| Gruppenkopf ziehen (Ansicht „Wie in der Datei“)              | Verschiebt die ganze Gruppe; beim Ablegen auf einer anderen Gruppe rastet sie davor oder dahinter ein                             |
| ⊘ am Gruppenkopf                                             | Löst die Gruppe auf (die Hosts bleiben)                                                                                           |
| ▾/▸ am Gruppenkopf                                           | Ein-/Ausklappen                                                                                                                   |

## Templates

Templates füllen Hosts vor. Ein **Host-Template** ist eine Liste von Optionen, ein **Gruppen-Template** ein Gruppenname plus mehrere Host-Blöcke. Templates gehören zum Benutzer, nicht zu einer Datei: Sie liegen in `templates.json` neben der Einstellungsdatei und stehen für jede Config zur Verfügung (siehe [Architektur → Template-Datei](architecture.md#template-datei)).

**Anlegen:**

- Feld *Template* im Editor → *Als Template speichern…* oder ⋮ in der Host-Liste → *Als Template speichern…*: übernimmt die Optionen des Hosts (nicht seine Kommentare).
- ☆ am Gruppenkopf: übernimmt alle Host-Blöcke der Gruppe als Gruppen-Template.
- ⚙ → *Templates verwalten…* → *+ Host-Template* / *+ Gruppen-Template*.

**Bearbeiten:** Die Template-Verwaltung (⚙ → *Templates verwalten…* oder *Verwalten…* im Anwenden-Dialog) listet alle Templates; Name, Gruppenname und Inhalt lassen sich bearbeiten, duplizieren und löschen. Der Inhalt wird wie eine ssh-Config geschrieben: ein `Keyword Wert` pro Zeile, Gruppen-Templates mit `Host <Muster>`-Zeilen und den Optionen darunter. Fehler (z. B. eine Option vor der ersten `Host`-Zeile) und unbekannte Keywords werden darunter angezeigt; gespeichert wird erst mit *Speichern*.

**Platzhalter** in Werten (bei Gruppen-Templates auch im Gruppennamen und in den Mustern):

| Platzhalter                | Wert                                                     |
| -------------------------- | -------------------------------------------------------- |
| `{alias}`                  | Erster fester Alias des Hosts, z. B. `web1.acme.example` |
| `{short}`                  | Alias bis zum ersten Punkt, z. B. `web1`                 |
| `{domain}`                 | Alias ab dem ersten Punkt, z. B. `acme.example`          |
| `{group}`                  | Gruppe des Hosts                                         |
| `{name}`, `{name=Vorgabe}` | Wird beim Anwenden abgefragt, optional mit Vorgabewert   |

Die Tokens von ssh wie `%h` und `${HOME}` sind keine Platzhalter und bleiben unverändert; für Werte, die beim Verbinden dem Host folgen sollen (z. B. `IdentityFile ~/.ssh/%h`), sind sie oft die bessere Wahl, weil nichts kopiert wird.

**Anwenden:**

- **Host-Template:** Feld *Template* im Editor eines Host-Blocks oder ⋮ → *Template anwenden…*. Der Dialog fragt Aliase und Variablen ab und zeigt eine Vorschau. Ein Template ohne Platzhalter auf einem Host ohne Werte wird sofort angewendet. Hat der Host schon Werte, weist der Dialog darauf hin, dass seine Optionen **ersetzt** werden (der Button heißt dann *Überschreiben*); Aliase, Gruppe und der Kommentar über dem Block bleiben, Kommentarzeilen zwischen den Optionen gehen verloren.
- **Gruppen-Template:** *+ Gruppe* → *Aus Template*. Die Variablen werden einmal abgefragt und füllen alle Hosts; die Vorschau zeigt die Gruppe mit ihren Hosts. Die Gruppe kommt ans Ende der Datei (vor ein abschließendes `Host *`). Ungültige oder vorhandene Gruppennamen verhindern das Anlegen, vorhandene Aliase werden angezeigt, und wenn bestehende Hosts andere effektive Werte bekämen, werden diese aufgelistet und erfordern *Trotzdem übernehmen*.

Ein Template wird beim Anwenden kopiert: Spätere Änderungen am Template ändern bestehende Hosts nicht. Das Anwenden lässt sich mit `Strg/⌘+Z` rückgängig machen.

## Sortieren und Filtern

- **Sortierung:** *Wie in der Datei* (Datei-Reihenfolge, Drag & Drop möglich), *Alias A–Z*, *Hostname A–Z*. Die Sortierung betrifft nur die Anzeige. In sortierten Ansichten stehen globale Blöcke zuerst, dann die Gruppen alphabetisch, dann *Ohne Gruppe*; ein Host, der auf einen anderen Host gezogen wird, kommt in dessen Gruppe.
- *Hostname A–Z* nutzt den effektiven `Hostname`: `Host github-work` landet unter dem `ssh.github.com`, das es von einem gemeinsamen Block erbt; Blöcke nur mit Wildcard-Mustern werden nach ihrem Muster einsortiert.
- **Filter** (`Strg+F`): Alle Wörter müssen in Mustern, `Hostname`, `User` oder Kommentaren vorkommen; ein passender Gruppenname zeigt die ganze Gruppe. `Enter` wählt den ersten Treffer.

## Effektive Konfiguration

Der Reiter *Effektiv* zeigt, was ssh für einen Host verwenden würde, wie `ssh -G`:

- Host eingeben (vorbelegt mit dem ersten Alias des ausgewählten Blocks) und optional einen User für `ssh -l`;
- jede Option mit Wert(en) und Quell-Block (Klick springt dorthin); Werte, die gegen frühere verloren haben, sind durchgestrichen;
- bei Keywords mit %-Tokens, `${ENV}` oder `~` (z. B. `IdentityFile`, `ControlPath`, `RemoteCommand`, `ProxyCommand`) zeigt eine zweite Zeile `→ …` den Wert, den ssh beim Verbinden verwendet, z. B. `~/.ssh/sockets/%r@%h-%p` → `/home/me/.ssh/sockets/ci@ci.example.net-22`; ersetzt werden nur die Tokens, die das Keyword unterstützt;
- Werte aus eingebundenen Dateien nennen ihre Datei; ein Klick öffnet sie in einem neuen Fenster;
- die zutreffenden Blöcke in Reihenfolge und Hinweise zu `Match`-Kriterien, die offline nicht auswertbar sind.

Aufgeführt werden nur Optionen, die in der Datei gesetzt sind, nicht die eingebauten Standardwerte von ssh.

### Match exec

`Match exec "befehl"` lässt ssh beim Lesen der Konfiguration einen Befehl ausführen; der Block greift, wenn der Befehl erfolgreich ist (Exit-Code 0), bei `!exec`, wenn er fehlschlägt. Typisch ist eine Netzwerkerkennung, etwa einen Bastion-Host nur außerhalb des Büronetzes zu nutzen. GoSSHpher führt diese Befehle nie von selbst aus. Für jedes `exec`, das der Host erreicht, bietet der Abschnitt *Match exec*:

- *Annahme: schlägt fehl* (Standard) oder *Annahme: erfolgreich* – die Auswertung nutzt die Annahme, so lassen sich beide Situationen vergleichen, ohne etwas auszuführen;
- *Ausführen…* – nach einer Rückfrage mit dem genauen Befehl (Tokens ersetzt) läuft der Befehl einmal in deiner Shell, so wie ssh ihn ausführen würde (Zeitlimit 10 Sekunden); sein Ergebnis wird zur Annahme.

Ausführen lassen sich nur Befehle, die in der Konfiguration für den angezeigten Host vorkommen.

## Eingebundene Dateien

Zu jeder `Include`-Zeile listet der Editor die passenden Dateien (Globs aufgelöst, relative Pfade relativ zur bearbeiteten Datei). Ein Klick auf eine Datei oder auf einen eingebundenen Wert im Reiter *Effektiv* öffnet sie in einem **neuen GoSSHpher-Fenster** – einer zweiten Instanz mit eigenem Verlauf, Speichern und Backup. Das erste Fenster liest eingebundene Dateien bei jeder Auswertung neu, Änderungen aus dem zweiten Fenster sind also sofort sichtbar.

## Hinweise

Der Reiter *Hinweise* listet alle Befunde nach Schweregrad; ein Klick wählt Block und Zeile aus. Die Befunde erscheinen zusätzlich direkt im Editor und als Punkt in der Host-Liste. Die vollständige Liste steht unter [Architektur → Prüfungen](architecture.md#prüfungen-analyze).

## Speichern

- `Strg+S` speichert (in der Textansicht wird der Text vorher übernommen).
- Sind Backups aktiviert (Standard), entsteht beim ersten Speichern pro Sitzung `<datei>.bak-JJJJMMTT-hhmmss` neben der Datei; nur das neueste Backup bleibt erhalten, sofern nichts anderes eingestellt ist.
- Wurde die Datei seit dem Laden außerhalb von GoSSHpher geändert, bietet ein Dialog *Überschreiben*, *Neu laden* oder *Abbrechen* an.
- Beim Schließen mit ungespeicherten Änderungen fragt die App nach.

## Einstellungen

⚙ in der Werkzeugleiste öffnet die Einstellungen:

| Einstellung                                | Wirkung                                                                                          |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| *Sprache*                                  | Sprache der Oberfläche; wirkt sofort                                                             |
| *Vor dem Überschreiben ein Backup anlegen* | Schaltet Backups ein oder aus                                                                    |
| *Backups pro Datei behalten*               | Anzahl der Backups pro Datei; `0` behält alle                                                    |
| *Terminal*                                 | Programm für *Im Terminal verbinden*, z. B. `kitty` oder `gnome-terminal --`; leer = automatisch |
| *Beim Start nach Updates suchen*           | Fragt beim Start GitHub nach einem neueren Release (Standard: an)                                |
| *Templates verwalten…*                     | Öffnet die Template-Verwaltung (siehe [Templates](#templates))                                   |

Der Dialog zeigt außerdem, wo die Einstellungsdatei liegt. Details: [Architektur → Einstellungsdatei](architecture.md#einstellungsdatei).

## Update-Hinweis

Beim Start fragt GoSSHpher im Hintergrund bei GitHub (`api.github.com`) nach dem neuesten Release. Gibt es ein neueres, erscheint unten rechts ein Hinweis mit *Release ansehen* (öffnet die Release-Seite im Browser) und *Ausblenden* (blendet den Hinweis bis zum nächsten Release aus). Die Abfrage blockiert die Anwendung nicht; ohne Internetverbindung bricht sie nach spätestens 5 Sekunden still ab. Entwicklungs-Builds (`dev`, `0.0.0`) fragen nicht nach; abschalten lässt sich die Abfrage in den Einstellungen.

## Rückgängig und Wiederholen

Jede Änderung am Dokument lässt sich rückgängig machen: `Strg/⌘+Z` oder ↶ macht rückgängig, `Strg/⌘+Umschalt+Z`, `Strg/⌘+Y` oder ↷ stellt wieder her (bis zu 200 Schritte). Tippen im selben Feld zählt als ein Schritt, solange die Pausen kürzer als 1,5 Sekunden sind; Verschieben, Gruppieren, Hinzufügen oder Löschen von Blöcken sind eigene Schritte, ebenso das Übernehmen der Textansicht. Öffnen oder Neu laden einer Datei beginnt einen neuen Verlauf. In Dialogen und in der Textansicht behalten die Felder ihr eigenes Rückgängig.

## Tastenkürzel

| Taste                              | Aktion                                                                     |
| ---------------------------------- | -------------------------------------------------------------------------- |
| `Strg/⌘+S`                         | Speichern                                                                  |
| `Strg/⌘+F`                         | Host-Filter fokussieren                                                    |
| `Strg/⌘+Z`                         | Rückgängig                                                                 |
| `Strg/⌘+Umschalt+Z`, `Strg/⌘+Y`    | Wiederholen                                                                |
| `Alt+↑` / `Alt+↓`                  | Ausgewählten Block verschieben (am Gruppenrand: Gruppe betreten/verlassen) |
| `Enter` im letzten Wert            | Neue Optionszeile                                                          |
| `Strg/⌘+Klick` in der Host-Liste   | Benachbarten Host markieren / Markierung verkleinern (für *+ Gruppe*)      |
| `Umschalt+Klick` in der Host-Liste | Alle Hosts vom ausgewählten bis zum angeklickten markieren                 |
| `Esc`                              | Dialog / Vorschlagsliste schließen, Markierung aufheben                    |

## Beispieldatei

[config.example](../../config.example) nutzt fiktive Hosts und zeigt die typischen Konstellationen:

| Abschnitt         | Zeigt                                                                                                                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dateianfang       | `Include config.example.d/*.conf` – öffnet [config.example.d/team.conf](../../config.example.d/team.conf) mit Team-Hosts (`IdentityFile ~/.ssh/work/%h`)                                          |
| `[GitHub]`        | Zwei Accounts über Aliase auf Port 443: gemeinsamer Block plus Schlüssel pro Alias                                                                                                                |
| `[GitLab]`        | Selbst gehostetes GitLab auf Port 2222; ein zweiter Block mit gleichen Mustern ergänzt einen Schlüssel                                                                                            |
| `[Shop]`          | Ein Server für Produktion und Staging mit `RemoteCommand` pro Alias und `RequestTTY force`                                                                                                        |
| `[Datacenter]`    | Bastion-Host, `Hostname %h.internal…`, `LocalForward`, ein absichtlicher Fehler in `Host db02` und `Match … !exec "nc -z -w 1 %h 22"`: der Bastion-Host wird nur außerhalb des Büronetzes genutzt |
| Wildcard          | `*.example.org !test.example.org`                                                                                                                                                                 |
| `Match user root` | Admin-Schlüssel für `ssh -l root`                                                                                                                                                                 |
| `Host *` am Ende  | Überschreibbare Standardwerte, Verbindungs-Multiplexing mit `ControlPath ~/.ssh/sockets/%r@%h-%p`                                                                                                 |

Die Hinweise zu fehlenden Schlüsseldateien sind erwartet: Die Schlüsseldateien existieren nicht.

[Index](index.md) · [English](../en/usage.md)
