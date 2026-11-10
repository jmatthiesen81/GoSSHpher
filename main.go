package main

import (
	"embed"
	"log"
	"os"

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

func main() {
	path := DefaultConfigPath()
	if len(os.Args) > 1 && os.Args[1] != "" && os.Args[1][0] != '-' {
		path = os.Args[1]
	}
	app := NewApp(path)

	err := wails.Run(&options.App{
		Title:     "GoSSHpher",
		Width:     1400,
		Height:    900,
		MinWidth:  900,
		MinHeight: 600,
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
