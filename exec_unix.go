//go:build !windows

package main

import (
	"os/exec"
	"syscall"
)

// killGroupOnCancel runs the command in its own process group and kills the
// group when the context is cancelled.
func killGroupOnCancel(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	cmd.Cancel = func() error {
		return syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL)
	}
}
