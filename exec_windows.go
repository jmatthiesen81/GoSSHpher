//go:build windows

package main

import "os/exec"

// killGroupOnCancel keeps the default behaviour on Windows (the process is
// killed; WaitDelay stops waiting for children holding the output).
func killGroupOnCancel(cmd *exec.Cmd) {}
