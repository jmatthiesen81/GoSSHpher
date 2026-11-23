package main

import (
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// fakeStart records started processes and returns a restore function.
func fakeStart(t *testing.T, found ...string) *[]string {
	t.Helper()
	var started []string
	origStart, origLook := startProcess, lookPath
	startProcess = func(name string, args ...string) error {
		started = append([]string{name}, args...)
		return nil
	}
	lookPath = func(name string) (string, error) {
		for _, f := range found {
			if f == name {
				return "/usr/bin/" + name, nil
			}
		}
		return "", exec.ErrNotFound
	}
	t.Cleanup(func() { startProcess, lookPath = origStart, origLook })
	return &started
}

func TestSSHCommand(t *testing.T) {
	if got := sshCommand(DefaultConfigPath(), "web"); strings.Join(got, " ") != "ssh web" {
		t.Errorf("default config: %q", got)
	}
	if got := sshCommand("/tmp/x config", "web"); len(got) != 4 || got[1] != "-F" || got[2] != "/tmp/x config" || got[3] != "web" {
		t.Errorf("other config: %q", got)
	}
}

func TestOpenTerminalRejectsPatterns(t *testing.T) {
	started := fakeStart(t, "xterm")
	app := NewApp(DefaultConfigPath())
	for _, host := range []string{"", "-oProxyCommand=x", "a b", "web*", "!web",
		"web&calc", "web|calc", "web^x", "web>out", "%PATH%", `we"b`, "web;id", "$(id)", "`id`", "web\nid"} {
		if err := app.OpenTerminal(host); err == nil {
			t.Errorf("%q: expected an error", host)
		}
	}
	if *started != nil {
		t.Errorf("started %q", *started)
	}
}

func TestValidTerminalHost(t *testing.T) {
	for _, host := range []string{"web", "web-01.example.com", "db_2", "admin@web", "fe80::1", "server-ü"} {
		if !validTerminalHost(host) {
			t.Errorf("%q: expected valid", host)
		}
	}
}

func TestTerminalCommandUnix(t *testing.T) {
	t.Setenv("TERMINAL", "")
	started := fakeStart(t, "konsole", "xterm")
	app := NewApp(filepath.Join(t.TempDir(), "my config"))
	if err := app.OpenTerminal("web"); err != nil {
		t.Fatal(err)
	}
	s := *started
	if len(s) != 3 || s[0] != "/usr/bin/konsole" || s[1] != "-e" {
		t.Fatalf("started %q", s)
	}
	script := s[2]
	defer os.Remove(script)
	data, err := os.ReadFile(script)
	if err != nil {
		t.Fatal(err)
	}
	if fi, _ := os.Stat(script); fi.Mode().Perm() != 0o700 {
		t.Errorf("mode %v", fi.Mode().Perm())
	}
	want := "'ssh' '-F' '" + app.path + "' 'web'\n"
	if !strings.Contains(string(data), want) || !strings.Contains(string(data), `'"$status"'`) {
		t.Errorf("script:\n%s", data)
	}

	// the setting wins and keeps its arguments
	app.settings.Terminal = "gnome-terminal --wait --"
	if err := app.OpenTerminal("web"); err != nil {
		t.Fatal(err)
	}
	s = *started
	defer os.Remove(s[len(s)-1])
	if len(s) != 4 || s[0] != "gnome-terminal" || s[1] != "--wait" || s[2] != "--" {
		t.Errorf("custom: %q", s)
	}
}

func TestTerminalCommandNotFound(t *testing.T) {
	t.Setenv("TERMINAL", "")
	fakeStart(t)
	_, _, err := terminalCommand("linux", "", []string{"ssh", "web"}, "en")
	if err == nil || errors.Is(err, exec.ErrNotFound) {
		t.Errorf("err %v", err)
	}
}

func TestTerminalCommandWindows(t *testing.T) {
	fakeStart(t)
	name, args, err := terminalCommand("windows", "", []string{"ssh", "web"}, "en")
	if err != nil || name != "cmd" || strings.Join(args, " ") != "/C start ssh cmd /K ssh web" {
		t.Errorf("%s %q %v", name, args, err)
	}
	fakeStart(t, "wt.exe")
	name, args, _ = terminalCommand("windows", "", []string{"ssh", "web"}, "en")
	if name != "/usr/bin/wt.exe" || strings.Join(args, " ") != "ssh web" {
		t.Errorf("wt: %s %q", name, args)
	}
}

func TestTerminalCommandWindowsUnsafePath(t *testing.T) {
	started := fakeStart(t, "wt.exe")
	for _, path := range []string{`C:\a&b\config`, `C:\%USERPROFILE%\config`, `C:\a;b\config`, `C:\a^b\config`} {
		if _, _, err := terminalCommand("windows", "", []string{"ssh", "-F", path, "web"}, "en"); err == nil {
			t.Errorf("%q: expected an error", path)
		}
	}
	// spaces are fine, they are quoted when the process is started
	if _, _, err := terminalCommand("windows", "", []string{"ssh", "-F", `C:\Users\Max Muster\config`, "web"}, "en"); err != nil {
		t.Errorf("spaces: %v", err)
	}
	if *started != nil {
		t.Errorf("started %q", *started)
	}
}

func TestTerminalCommandWindowsCustomWithSpaces(t *testing.T) {
	fakeStart(t)
	name, args, err := terminalCommand("windows", `"C:\Program Files\Term\term.exe" -e`, []string{"ssh", "web"}, "en")
	if err != nil || name != `C:\Program Files\Term\term.exe` || strings.Join(args, "|") != "-e|ssh|web" {
		t.Errorf("%s %q %v", name, args, err)
	}
}

func TestTerminalCommandInvalidCustom(t *testing.T) {
	fakeStart(t)
	for _, custom := range []string{`"unterminated -e`, `"" -e`} {
		if _, _, err := terminalCommand("linux", custom, []string{"ssh", "web"}, "en"); err == nil {
			t.Errorf("%q: expected an error", custom)
		}
	}
}

func TestSplitCommand(t *testing.T) {
	cases := map[string]string{
		"gnome-terminal --wait --":                   "gnome-terminal|--wait|--",
		`"C:\Program Files\x.exe" -e`:                `C:\Program Files\x.exe|-e`,
		`'/opt/my term/bin/term' --title 'ssh host'`: "/opt/my term/bin/term|--title|ssh host",
		"  kitty   ":    "kitty",
		`term --arg=""`: "term|--arg=",
	}
	for in, want := range cases {
		got, err := splitCommand(in)
		if err != nil || strings.Join(got, "|") != want {
			t.Errorf("%q: got %q %v, want %q", in, got, err, want)
		}
	}
}

func TestShellQuote(t *testing.T) {
	if got := shellQuote("it's"); got != `'it'\''s'` {
		t.Errorf("%s", got)
	}
}
