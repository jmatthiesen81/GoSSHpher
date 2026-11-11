package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestNewerVersion(t *testing.T) {
	cases := []struct {
		latest, current string
		want            bool
	}{
		{"1.0.1", "1.0.0", true},
		{"v1.1.0", "1.0.9", true},
		{"2.0.0", "1.99.99", true},
		{"1.0.0", "1.0.0", false},
		{"1.0.0", "1.0.1", false},
		{"1.0.0", "1.0.0-rc.1", true},
		{"1.0.0-rc.2", "1.0.0-rc.1", true},
		{"1.0.0-rc.1", "1.0.0", false},
		{"1.0.10", "1.0.9", true},
		{"garbage", "1.0.0", false},
		{"1.0.1", "dev", false},
		{"1.0", "0.9.0", false},
	}
	for _, c := range cases {
		if got := newerVersion(c.latest, c.current); got != c.want {
			t.Errorf("newerVersion(%q, %q) = %v, want %v", c.latest, c.current, got, c.want)
		}
	}
}

// withRelease serves a fake GitHub API and sets the version of this build.
func withRelease(t *testing.T, current string, handler http.HandlerFunc) {
	t.Helper()
	srv := httptest.NewServer(handler)
	origAPI, origVersion := releaseAPI, version
	releaseAPI, version = srv.URL, current
	t.Cleanup(func() {
		srv.Close()
		releaseAPI, version = origAPI, origVersion
	})
}

func TestCheckUpdate(t *testing.T) {
	var agent string
	withRelease(t, "1.0.1", func(w http.ResponseWriter, r *http.Request) {
		agent = r.Header.Get("User-Agent")
		w.Write([]byte(`{"tag_name": "1.1.0", "html_url": "https://github.com/` + releaseRepo + `/releases/tag/1.1.0"}`))
	})
	app := NewApp("config")
	info, err := app.CheckUpdate()
	if err != nil || !info.Available || info.Latest != "1.1.0" || info.Current != "1.0.1" ||
		info.URL != "https://github.com/"+releaseRepo+"/releases/tag/1.1.0" {
		t.Fatalf("%+v %v", info, err)
	}
	if agent != "GoSSHpher/1.0.1" {
		t.Errorf("user agent %q", agent)
	}

	// switched off: no request
	agent = ""
	app.settings.UpdateCheck = false
	if info, err := app.CheckUpdate(); err != nil || info.Available || agent != "" {
		t.Errorf("disabled: %+v %v %q", info, err, agent)
	}
}

func TestCheckUpdateForeignURL(t *testing.T) {
	withRelease(t, "1.0.0", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"tag_name": "1.0.1", "html_url": "https://evil.example/x"}`))
	})
	info, err := NewApp("config").CheckUpdate()
	if err != nil || info.URL != "https://github.com/"+releaseRepo+"/releases/latest" {
		t.Errorf("%+v %v", info, err)
	}
}

func TestCheckUpdateDevBuild(t *testing.T) {
	called := false
	withRelease(t, "0.0.0", func(w http.ResponseWriter, r *http.Request) { called = true })
	if info, err := NewApp("config").CheckUpdate(); err != nil || info.Available || called {
		t.Errorf("%+v %v called=%v", info, err, called)
	}
}

func TestCheckUpdateErrors(t *testing.T) {
	withRelease(t, "1.0.0", func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "rate limited", http.StatusForbidden)
	})
	if info, err := NewApp("config").CheckUpdate(); err == nil || info.Available {
		t.Errorf("HTTP error: %+v %v", info, err)
	}

	// a server that never answers is cut off by the timeout
	block := make(chan struct{})
	withRelease(t, "1.0.0", func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-block:
		case <-r.Context().Done():
		}
	})
	defer close(block)
	orig := updateTimeout
	updateTimeout = 100 * time.Millisecond
	defer func() { updateTimeout = orig }()
	start := time.Now()
	if _, err := NewApp("config").CheckUpdate(); err == nil {
		t.Error("expected a timeout")
	}
	if d := time.Since(start); d > 2*time.Second {
		t.Errorf("took %v", d)
	}
}
