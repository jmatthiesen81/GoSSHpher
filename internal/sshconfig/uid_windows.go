//go:build windows

package sshconfig

// localUID has no meaning on Windows; ssh substitutes nothing useful there.
func localUID() string { return "" }
