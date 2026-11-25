package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestThemeMiddleware(t *testing.T) {
	next := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte("asset"))
	})
	for _, tc := range []struct {
		dark bool
		want string
	}{{true, `"dark"`}, {false, `"light"`}} {
		h := themeMiddleware(func() bool { return tc.dark })(next)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, themeScriptPath, nil))
		if body := rec.Body.String(); !strings.Contains(body, "dataset.theme = "+tc.want) {
			t.Errorf("dark=%v: body %q", tc.dark, body)
		}
		if ct := rec.Header().Get("Content-Type"); !strings.HasPrefix(ct, "text/javascript") {
			t.Errorf("content type %q", ct)
		}
	}

	rec := httptest.NewRecorder()
	themeMiddleware(func() bool { return true })(next).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/index.html", nil))
	if rec.Body.String() != "asset" {
		t.Errorf("other paths must reach the asset handler, got %q", rec.Body.String())
	}
}
