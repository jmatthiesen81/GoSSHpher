package main

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
	"time"

	"gosshpher/internal/sshconfig"
)

func TestOpenWindow(t *testing.T) {
	dir := t.TempDir()
	file := filepath.Join(dir, "work.conf")
	if err := os.WriteFile(file, []byte("Host x\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	var started []string
	orig := startProcess
	startProcess = func(name string, args ...string) error {
		started = append([]string{name}, args...)
		return nil
	}
	defer func() { startProcess = orig }()

	app := NewApp(filepath.Join(dir, "config"))
	if err := app.OpenWindow(file); err != nil {
		t.Fatal(err)
	}
	self, _ := os.Executable()
	if len(started) != 2 || started[0] != self || started[1] != file {
		t.Errorf("started %q", started)
	}
	started = nil
	for _, bad := range []string{dir, filepath.Join(dir, "missing")} {
		if err := app.OpenWindow(bad); err == nil {
			t.Errorf("%s: expected an error", bad)
		}
	}
	if started != nil {
		t.Error("no process may be started for invalid paths")
	}
}

func TestIncludeFilesRelativeToEditedFile(t *testing.T) {
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, "conf.d"), 0o700); err != nil {
		t.Fatal(err)
	}
	inc := filepath.Join(dir, "conf.d", "a.conf")
	if err := os.WriteFile(inc, nil, 0o600); err != nil {
		t.Fatal(err)
	}
	app := NewApp(filepath.Join(dir, "config"))
	if got := app.IncludeFiles("conf.d/*.conf"); len(got) != 1 || got[0] != inc {
		t.Errorf("IncludeFiles: %q", got)
	}
}

func TestRunMatchExec(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("uses a POSIX shell")
	}
	t.Setenv("SHELL", "/bin/sh")
	app := NewApp(filepath.Join(t.TempDir(), "config"))
	app.cfg = sshconfig.Parse(`Match originalhost srv exec "test %n = srv"
  Port 1
Match originalhost srv exec "echo out; exit 3"
  Port 2
Match originalhost srv exec "sleep 5"
  Port 3
`)
	ok, err := app.RunMatchExec("srv", "", "test %n = srv")
	if err != nil || !ok.Success || ok.Command != "test srv = srv" {
		t.Errorf("success: %+v %v", ok, err)
	}
	fail, err := app.RunMatchExec("srv", "", "echo out; exit 3")
	if err != nil || fail.Success || fail.ExitCode != 3 || fail.Output != "out" {
		t.Errorf("failure: %+v %v", fail, err)
	}
	if _, err := app.RunMatchExec("srv", "", "rm -rf /tmp/x"); err == nil {
		t.Error("commands that are not in the configuration must be rejected")
	}
	if _, err := app.RunMatchExec("other", "", "test %n = srv"); err == nil {
		t.Error("commands of blocks the host does not reach must be rejected")
	}

	orig := execTimeout
	execTimeout = 200 * time.Millisecond
	defer func() { execTimeout = orig }()
	start := time.Now()
	slow, err := app.RunMatchExec("srv", "", "sleep 5")
	if err != nil || !slow.TimedOut || slow.Success || time.Since(start) > 3*time.Second {
		t.Errorf("timeout: %+v %v after %v", slow, err, time.Since(start))
	}
}
