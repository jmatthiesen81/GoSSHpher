package main

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"unicode"

	"gosshpher/internal/i18n"
)

// This file opens a terminal window that connects to a host with ssh.

// lookPath finds a program; replaced in tests.
var lookPath = exec.LookPath

// linuxTerminals are tried in this order when neither the setting nor
// $TERMINAL names a terminal. The arguments go before the command to run.
var linuxTerminals = [][]string{
	{"x-terminal-emulator", "-e"},
	{"gnome-terminal", "--"},
	{"ptyxis", "--"},
	{"konsole", "-e"},
	{"xfce4-terminal", "-x"},
	{"tilix", "-e"},
	{"kitty"},
	{"alacritty", "-e"},
	{"wezterm", "start", "--"},
	{"foot"},
	{"xterm", "-e"},
}

// OpenTerminal opens a terminal window running "ssh <host>". When the edited
// file is not ~/.ssh/config, ssh is told to read it with -F. ssh reads the
// file from disk, so the UI asks to save unsaved changes first.
func (a *App) OpenTerminal(host string) error {
	a.mu.Lock()
	path := a.path
	lang := a.lang()
	custom := a.settings.Terminal
	a.mu.Unlock()

	if !validTerminalHost(host) {
		return errors.New(i18n.T(lang, "error.terminalHost", map[string]string{"host": host}))
	}
	ssh := sshCommand(path, host)
	name, args, err := terminalCommand(runtime.GOOS, custom, ssh, lang)
	if err != nil {
		return err
	}
	return startProcess(name, args...)
}

// validTerminalHost reports whether host can be passed to a terminal as a
// single ssh destination. Only letters, digits and ".-_:@" are allowed, so
// neither wildcards nor characters that a shell or cmd.exe would interpret
// (& | ^ < > % " and the like) can reach the command line. On Windows the
// arguments are parsed again by cmd.exe, where quoting does not protect them.
func validTerminalHost(host string) bool {
	if host == "" || strings.HasPrefix(host, "-") {
		return false
	}
	for _, r := range host {
		switch {
		case unicode.IsLetter(r), unicode.IsDigit(r):
		case strings.ContainsRune(".-_:@", r):
		default:
			return false
		}
	}
	return true
}

// sshCommand is the ssh call for a host of the edited file.
func sshCommand(path, host string) []string {
	if path != "" && filepath.Clean(path) != filepath.Clean(DefaultConfigPath()) {
		return []string{"ssh", "-F", path, host}
	}
	return []string{"ssh", host}
}

// windowsUnsafe are the characters that must not appear in the arguments of
// the ssh command on Windows.
const windowsUnsafe = `&|^<>%";`

// splitCommand splits a command line from the settings into program and
// arguments. Arguments are separated by white space; double or single quotes
// group text with spaces, e.g. "C:\Program Files\Terminal\term.exe" -e.
// Backslashes are kept as they are, so Windows paths need no escaping.
func splitCommand(s string) ([]string, error) {
	var (
		args  []string
		cur   strings.Builder
		quote rune
		inArg bool
	)
	for _, r := range s {
		switch {
		case quote != 0:
			if r == quote {
				quote = 0
			} else {
				cur.WriteRune(r)
			}
		case r == '"' || r == '\'':
			quote, inArg = r, true
		case unicode.IsSpace(r):
			if inArg {
				args = append(args, cur.String())
				cur.Reset()
				inArg = false
			}
		default:
			cur.WriteRune(r)
			inArg = true
		}
	}
	if quote != 0 {
		return nil, fmt.Errorf("missing closing %c", quote)
	}
	if inArg {
		args = append(args, cur.String())
	}
	if len(args) > 0 && args[0] == "" {
		return nil, errors.New("empty program name")
	}
	return args, nil
}

// terminalCommand returns the program and arguments that open a terminal
// running the ssh command.
func terminalCommand(goos, custom string, ssh []string, lang string) (string, []string, error) {
	var customArgs []string
	if custom != "" {
		f, err := splitCommand(custom)
		if err != nil {
			return "", nil, errors.New(i18n.T(lang, "error.terminalCommand", map[string]string{"error": err.Error()}))
		}
		customArgs = f
	}

	if goos == "windows" {
		// wt.exe splits its arguments at ";" and cmd.exe reinterprets
		// & | ^ < > % " even in quoted arguments
		for _, arg := range ssh {
			if strings.ContainsAny(arg, windowsUnsafe) {
				return "", nil, errors.New(i18n.T(lang, "error.terminalPath", map[string]string{"chars": windowsUnsafe}))
			}
		}
		if len(customArgs) > 0 {
			return customArgs[0], append(customArgs[1:], ssh...), nil
		}
		if wt, err := lookPath("wt.exe"); err == nil {
			return wt, ssh, nil
		}
		// start opens a new console window; /K keeps it open after ssh ends
		return "cmd", append([]string{"/C", "start", "ssh", "cmd", "/K"}, ssh...), nil
	}

	// Unix: run a small script, so that every terminal gets one simple
	// argument (some join their arguments with spaces) and the window stays
	// open when ssh fails.
	script, err := writeTerminalScript(ssh, goos == "darwin", lang)
	if err != nil {
		return "", nil, err
	}
	if len(customArgs) > 0 {
		return customArgs[0], append(customArgs[1:], script), nil
	}
	if goos == "darwin" {
		return "open", []string{"-a", "Terminal", script}, nil
	}
	if env := strings.Fields(os.Getenv("TERMINAL")); len(env) > 0 {
		if p, err := lookPath(env[0]); err == nil {
			return p, append(env[1:], script), nil
		}
	}
	for _, t := range linuxTerminals {
		if p, err := lookPath(t[0]); err == nil {
			return p, append(append([]string{}, t[1:]...), script), nil
		}
	}
	os.Remove(script)
	return "", nil, errors.New(i18n.T(lang, "error.noTerminal", nil))
}

// writeTerminalScript writes an executable shell script that removes itself,
// runs ssh and waits for Enter when ssh failed. On macOS it gets the suffix
// .command, which Terminal.app runs.
func writeTerminalScript(ssh []string, darwin bool, lang string) (string, error) {
	suffix := ".sh"
	if darwin {
		suffix = ".command"
	}
	f, err := os.CreateTemp("", "gosshpher-ssh-*"+suffix)
	if err != nil {
		return "", err
	}
	quoted := make([]string, len(ssh))
	for i, s := range ssh {
		quoted[i] = shellQuote(s)
	}
	// the message is quoted as a whole; the status is inserted unquoted
	msg := shellQuote(i18n.T(lang, "terminal.failed", map[string]string{"status": "\x00"}))
	msg = strings.ReplaceAll(msg, "\x00", `'"$status"'`)
	body := "#!/bin/sh\n" +
		"rm -f -- \"$0\"\n" +
		strings.Join(quoted, " ") + "\n" +
		"status=$?\n" +
		"if [ \"$status\" -ne 0 ]; then\n" +
		"  echo\n" +
		"  echo " + msg + "\n" +
		"  read _\n" +
		"fi\n"
	if _, err := f.WriteString(body); err != nil {
		f.Close()
		os.Remove(f.Name())
		return "", err
	}
	if err := f.Chmod(0o700); err != nil {
		f.Close()
		os.Remove(f.Name())
		return "", err
	}
	if err := f.Close(); err != nil {
		os.Remove(f.Name())
		return "", err
	}
	return f.Name(), nil
}

// shellQuote quotes a word for sh.
func shellQuote(s string) string {
	return "'" + strings.ReplaceAll(s, "'", `'\''`) + "'"
}
