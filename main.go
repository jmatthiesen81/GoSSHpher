package main

import (
	"embed"
	"log"
	"os"
	"runtime"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/linux"
)

//go:embed all:frontend/dist
var assets embed.FS

// Window icon on Linux (Windows and macOS take theirs from the build).
//
//go:embed build/linux/icons/hicolor/256x256/apps/gosshpher.png
var icon []byte

// maxWindowSize is the largest window size on Linux (X11 sizes are 16-bit
// signed; leave headroom for the decorations Wails adds on Wayland).
const maxWindowSize = 30000

func main() {
	path := DefaultConfigPath()
	if len(os.Args) > 1 && os.Args[1] != "" && os.Args[1][0] != '-' {
		path = os.Args[1]
	}
	app := NewApp(path)

	// Wails on Linux turns a MaxWidth/MaxHeight of 0 into the size of the
	// monitor the window opens on, so with several monitors the window could
	// never grow beyond the narrowest one. A large explicit limit lifts that.
	// Windows and macOS treat 0 as "no limit" and need nothing.
	maxWidth, maxHeight := 0, 0
	if runtime.GOOS == "linux" {
		maxWidth, maxHeight = maxWindowSize, maxWindowSize
	}

	err := wails.Run(&options.App{
		Title:     "GoSSHpher",
		Width:     1400,
		Height:    900,
		MinWidth:  900,
		MinHeight: 600,
		MaxWidth:  maxWidth,
		MaxHeight: maxHeight,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 255, G: 255, B: 255, A: 1},
		OnStartup:        app.startup,
		OnBeforeClose:    app.beforeClose,
		Bind:             []interface{}{app},
		Linux: &linux.Options{
			Icon: icon,
			// WM class / Wayland app id; must match the name of the .desktop
			// file (de.netinventors.gosshpher.desktop) and its StartupWMClass
			ProgramName: AppID,
		},
	})
	if err != nil {
		log.Fatal(err)
	}
}
