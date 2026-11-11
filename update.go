package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// This file checks GitHub for a newer release.

// version is set by the release build with
// -ldflags "-X main.version=1.2.3"; development builds keep "dev" and test
// builds of the release workflow get "0.0.0"; both never look for updates.
var version = "dev"

// releaseRepo is the GitHub repository the releases are published in.
const releaseRepo = "jmatthiesen81/GoSSHpher"

// releaseAPI returns the latest release (GitHub skips drafts and
// pre-releases there); replaced in tests.
var releaseAPI = "https://api.github.com/repos/" + releaseRepo + "/releases/latest"

// updateTimeout limits the whole request, so a missing or slow network never
// keeps the check running for long.
var updateTimeout = 5 * time.Second

// UpdateInfo tells the frontend whether a newer release exists.
type UpdateInfo struct {
	Current   string `json:"current"`
	Latest    string `json:"latest,omitempty"`
	URL       string `json:"url,omitempty"`
	Available bool   `json:"available"`
}

// Version returns the version of this build ("dev" for development builds).
func (a *App) Version() string { return version }

// CheckUpdate asks GitHub for the latest release. It is called by the
// frontend after start-up and runs in the background there; without network
// it fails after updateTimeout at the latest, and the frontend ignores the
// error. Nothing is checked when the setting is off or for development
// builds.
func (a *App) CheckUpdate() (UpdateInfo, error) {
	a.mu.Lock()
	enabled := a.settings.UpdateCheck
	a.mu.Unlock()
	info := UpdateInfo{Current: version}
	if !enabled || version == "0.0.0" || parseVersion(version) == nil {
		return info, nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), updateTimeout)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, releaseAPI, nil)
	if err != nil {
		return info, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "GoSSHpher/"+version)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return info, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return info, fmt.Errorf("update check: HTTP %d", resp.StatusCode)
	}
	var rel struct {
		TagName string `json:"tag_name"`
		HTMLURL string `json:"html_url"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&rel); err != nil {
		return info, err
	}
	info.Latest = strings.TrimPrefix(rel.TagName, "v")
	// only link to release pages of this repository
	if strings.HasPrefix(rel.HTMLURL, "https://github.com/"+releaseRepo+"/") {
		info.URL = rel.HTMLURL
	} else {
		info.URL = "https://github.com/" + releaseRepo + "/releases/latest"
	}
	info.Available = newerVersion(info.Latest, version)
	return info, nil
}

// semver is a parsed version "1.2.3" or "1.2.3-rc.1".
type semver struct {
	nums [3]int
	pre  string
}

// parseVersion parses "1.2.3", "v1.2.3" or "1.2.3-suffix"; anything else
// (e.g. "dev") yields nil.
func parseVersion(s string) *semver {
	s = strings.TrimPrefix(strings.TrimSpace(s), "v")
	core, pre, _ := strings.Cut(s, "-")
	parts := strings.Split(core, ".")
	if len(parts) != 3 {
		return nil
	}
	v := &semver{pre: pre}
	for i, p := range parts {
		n, err := strconv.Atoi(p)
		if err != nil || n < 0 {
			return nil
		}
		v.nums[i] = n
	}
	return v
}

// newerVersion reports whether latest is newer than current. A release
// counts as newer than a pre-release of the same version; pre-releases among
// themselves are compared as strings.
func newerVersion(latest, current string) bool {
	l, c := parseVersion(latest), parseVersion(current)
	if l == nil || c == nil {
		return false
	}
	for i := range l.nums {
		if l.nums[i] != c.nums[i] {
			return l.nums[i] > c.nums[i]
		}
	}
	switch {
	case l.pre == c.pre:
		return false
	case l.pre == "":
		return true
	case c.pre == "":
		return false
	}
	return l.pre > c.pre
}
