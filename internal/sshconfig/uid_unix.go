//go:build !windows

package sshconfig

import (
	"os"
	"strconv"
)

func localUID() string { return strconv.Itoa(os.Getuid()) }
