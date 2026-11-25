package main

import (
	"fmt"
	"net/http"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

// The UI takes its colour scheme from the data-theme attribute on <html>, not
// from the prefers-color-scheme media query: WebKitGTK 6.0 with GTK4 < 4.20
// (e.g. Ubuntu 24.04) does not see the desktop's dark preference unless
// gtk-application-prefer-dark-theme is set in ~/.config/gtk-4.0/settings.ini,
// while Wails reads it reliably (freedesktop portal, Windows registry, macOS
// appearance).
const (
	// themeScriptPath is loaded synchronously in the <head> of index.html, so
	// the attribute is set before the first paint and nothing flashes light.
	themeScriptPath = "/theme.js"
	// themeEvent tells the frontend about a change of the system theme.
	themeEvent = "theme:changed"
)

// Window background before the page is painted; matches --bg in style.css.
var (
	backgroundLight = application.NewRGB(0xf6, 0xf7, 0xf9)
	backgroundDark  = application.NewRGB(0x15, 0x18, 0x1e)
)

func themeName(dark bool) string {
	if dark {
		return "dark"
	}
	return "light"
}

func windowBackground(dark bool) application.RGBA {
	if dark {
		return backgroundDark
	}
	return backgroundLight
}

// themeMiddleware serves themeScriptPath with the current system theme.
func themeMiddleware(isDark func() bool) application.Middleware {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path != themeScriptPath {
				next.ServeHTTP(w, r)
				return
			}
			w.Header().Set("Content-Type", "text/javascript; charset=utf-8")
			w.Header().Set("Cache-Control", "no-store")
			_, _ = fmt.Fprintf(w, "document.documentElement.dataset.theme = %q;\n", themeName(isDark()))
		})
	}
}

// isDarkMode reports the system theme; false until the app runs.
func (a *App) isDarkMode() bool {
	return a.app != nil && a.app.Env.IsDarkMode()
}

// setupTheme sets the window background for the current system theme and
// follows later changes. Called from ServiceStartup: the platform app exists
// by then (so the system theme can be read), the window is not shown yet.
func (a *App) setupTheme() {
	if a.app == nil || a.window == nil {
		return
	}
	a.window.SetBackgroundColour(windowBackground(a.isDarkMode()))
	a.app.Event.OnApplicationEvent(events.Common.ThemeChanged, func(*application.ApplicationEvent) {
		dark := a.isDarkMode()
		a.window.SetBackgroundColour(windowBackground(dark))
		a.app.Event.Emit(themeEvent, themeName(dark))
	})
}
