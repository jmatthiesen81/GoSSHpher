package main

import (
	"embed"
	"log"
	"os"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

//go:embed all:frontend/dist
var assets embed.FS

// Window icon on Linux (Windows and macOS take theirs from the build).
//
//go:embed build/linux/icons/hicolor/256x256/apps/gosshpher.png
var icon []byte

func main() {
	path := DefaultConfigPath()
	if len(os.Args) > 1 && os.Args[1] != "" && os.Args[1][0] != '-' {
		path = os.Args[1]
	}
	app := NewApp(path)

	wapp := application.New(application.Options{
		Name:        "GoSSHpher",
		Description: "Grafischer Editor für SSH-Client-Konfigurationen",
		Services: []application.Service{
			application.NewService(app),
		},
		Assets: application.AssetOptions{
			Handler:    application.AssetFileServerFS(assets),
			Middleware: themeMiddleware(app.isDarkMode),
		},
		// Quitting via the menu or Cmd+Q (macOS) goes through the same
		// "discard unsaved changes?" question as closing the window.
		ShouldQuit: app.shouldQuit,
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: true,
		},
		Linux: application.LinuxOptions{
			// GTK application id, WM class and Wayland app id (ProgramName
			// defaults to it); must match the name of the .desktop file
			// (de.netinventors.gosshpher.desktop) and its StartupWMClass
			ApplicationID: AppID,
		},
	})

	// A MaxWidth/MaxHeight of 0 means "no limit" on every platform in Wails
	// v3, so the window can grow across several monitors.
	window := wapp.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:            "GoSSHpher",
		Width:            1400,
		Height:           900,
		MinWidth:         900,
		MinHeight:        600,
		// replaced in ServiceStartup by the colour of the system theme
		BackgroundColour: backgroundLight,
		URL:              "/",
		Linux: application.LinuxWindow{
			Icon: icon,
		},
	})
	window.RegisterHook(events.Common.WindowClosing, app.windowClosing)
	app.attach(wapp, window)

	if err := wapp.Run(); err != nil {
		log.Fatal(err)
	}
}
