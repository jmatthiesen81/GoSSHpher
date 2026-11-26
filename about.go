package main

import (
	"runtime"
	"runtime/debug"
	"strings"
)

// This file provides the data of the info card (publisher, version, links).

const (
	appName      = "GoSSHpher"
	appPublisher = "Net Inventors GmbH"
	appWebsite   = "https://www.netinventors.de"
	appRepoURL   = "https://github.com/" + releaseRepo
	appLicense   = "MPL-2.0"
)

// AboutInfo is shown in the info card.
type AboutInfo struct {
	Name      string `json:"name"`
	Version   string `json:"version"`
	Publisher string `json:"publisher"`
	Website   string `json:"website"`
	RepoURL   string `json:"repoUrl"`
	License   string `json:"license"`
	Platform  string `json:"platform"`
	Go        string `json:"go"`
	Wails     string `json:"wails,omitempty"`
}

// About returns name, version, publisher and links of this build.
func (a *App) About() AboutInfo {
	info := AboutInfo{Name: appName, Version: version, Publisher: appPublisher, Website: appWebsite,
		RepoURL: appRepoURL, License: appLicense, Platform: runtime.GOOS + "/" + runtime.GOARCH, Go: goVersion()}
	if bi, ok := debug.ReadBuildInfo(); ok {
		for _, d := range bi.Deps {
			if d.Path == "github.com/wailsapp/wails/v3" {
				info.Wails = d.Version
			}
		}
	}
	return info
}

// goVersion without experiment suffixes ("go1.26.1 X:nodwarf5" -> "go1.26.1")
func goVersion() string {
	v, _, _ := strings.Cut(runtime.Version(), "-X:")
	v, _, _ = strings.Cut(v, " ")
	return v
}
