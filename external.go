package main

import (
	"bytes"
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"gosshpher/internal/i18n"
	"gosshpher/internal/sshconfig"
)

// This file holds the bound methods that reach outside the edited document:
// included files, a second window, and running "Match exec" commands.

// IncludeFiles returns the existing files an Include value refers to,
// resolved like the evaluation does (relative to the edited file).
func (a *App) IncludeFiles(value string) []string {
	a.mu.Lock()
	opts := a.resolveOptions()
	a.mu.Unlock()
	return sshconfig.IncludeFiles(value, opts)
}

// startProcess starts a detached process; replaced in tests.
var startProcess = func(name string, args ...string) error {
	cmd := exec.Command(name, args...)
	if err := cmd.Start(); err != nil {
		return err
	}
	return cmd.Process.Release()
}

// OpenWindow opens a file in a new GoSSHpher window by starting the
// application again with the file as argument. Wails v2 has one window per
// process, and a separate process also keeps history and saving separate.
func (a *App) OpenWindow(path string) error {
	a.mu.Lock()
	lang := a.lang()
	a.mu.Unlock()
	fi, err := os.Stat(path)
	if err != nil || !fi.Mode().IsRegular() {
		return errors.New(i18n.T(lang, "error.notAFile", map[string]string{"path": path}))
	}
	self, err := os.Executable()
	if err != nil {
		return err
	}
	return startProcess(self, path)
}

// ExecResult is the outcome of running a "Match exec" command.
type ExecResult struct {
	Command  string `json:"command"` // expanded command that was run
	Success  bool   `json:"success"` // exit status 0
	ExitCode int    `json:"exitCode"`
	Output   string `json:"output,omitempty"`
	TimedOut bool   `json:"timedOut,omitempty"`
}

// execTimeout limits how long a "Match exec" command may run.
var execTimeout = 10 * time.Second

// RunMatchExec runs one "Match exec" command for a host, the way ssh would
// while connecting, and reports whether it succeeded. Only commands that
// occur in the evaluation of that host are accepted; the UI asks for
// confirmation before calling this.
func (a *App) RunMatchExec(host, user, command string) (ExecResult, error) {
	a.mu.Lock()
	opts := a.resolveOptions()
	opts.User = user
	res := sshconfig.Resolve(a.cfg, host, opts)
	lang := a.lang()
	a.mu.Unlock()

	expanded := ""
	for _, b := range res.Blocks {
		for _, e := range b.Execs {
			if e.Command == command {
				expanded = e.Expanded
			}
		}
	}
	if expanded == "" {
		return ExecResult{}, errors.New(i18n.T(lang, "error.execUnknown", map[string]string{"command": command}))
	}
	return runShell(expanded), nil
}

// runShell runs a command through the user's shell like ssh does.
func runShell(command string) ExecResult {
	ctx, cancel := context.WithTimeout(context.Background(), execTimeout)
	defer cancel()
	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		cmd = exec.CommandContext(ctx, "cmd", "/C", command)
	} else {
		shell := os.Getenv("SHELL")
		if shell == "" || !filepath.IsAbs(shell) {
			shell = "/bin/sh"
		}
		cmd = exec.CommandContext(ctx, shell, "-c", command)
	}
	var out bytes.Buffer
	cmd.Stdout, cmd.Stderr = &out, &out
	// on timeout kill the whole process group (the shell and its children),
	// and do not wait for children that keep the output open
	killGroupOnCancel(cmd)
	cmd.WaitDelay = time.Second
	err := cmd.Run()
	r := ExecResult{Command: command, Output: strings.TrimSpace(truncate(out.String(), 2000))}
	switch {
	case ctx.Err() == context.DeadlineExceeded:
		r.TimedOut, r.ExitCode = true, -1
	case err == nil:
		r.Success = true
	default:
		var ee *exec.ExitError
		if errors.As(err, &ee) {
			r.ExitCode = ee.ExitCode()
		} else {
			r.ExitCode = -1
			r.Output = err.Error()
		}
	}
	return r
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + " …"
}
