package main

import (
	"encoding/json"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"strings"

	"gosshpher/internal/i18n"
)

// BackupSettings controls the backup written before a file is overwritten.
type BackupSettings struct {
	// Enabled writes <file>.bak-YYYYMMDD-HHMMSS on the first save per session.
	Enabled bool `json:"enabled"`
	// Keep is the number of backups kept per file; 0 keeps all.
	Keep int `json:"keep"`
}

// UISettings are per-user view settings of the frontend.
type UISettings struct {
	Sort      string         `json:"sort,omitempty"`
	Collapsed []string       `json:"collapsed,omitempty"`
	Widths    map[string]int `json:"widths,omitempty"`
	// DismissedUpdate is the release whose update notice was closed.
	DismissedUpdate string `json:"dismissedUpdate,omitempty"`
}

// Settings is stored as JSON in the user's config directory:
// $XDG_CONFIG_HOME or ~/.config on Linux, ~/Library/Application Support on
// macOS, %AppData% on Windows (see os.UserConfigDir).
type Settings struct {
	// Language of the user interface, e.g. "en" or "de".
	Language string         `json:"language"`
	Backup   BackupSettings `json:"backup"`
	// Terminal is the program that opens an ssh connection, with optional
	// arguments; the command to run is appended. Empty detects one.
	Terminal string `json:"terminal,omitempty"`
	// UpdateCheck asks GitHub for a newer release at start-up.
	UpdateCheck bool       `json:"updateCheck"`
	UI          UISettings `json:"ui"`
}

// AppID identifies the application on every platform: macOS bundle id,
// settings directory and the Linux app id (.desktop file, WM class).
const AppID = "de.netinventors.gosshpher"

// DefaultSettings are used when no settings file exists yet.
func DefaultSettings() Settings {
	return Settings{Language: i18n.Fallback, Backup: BackupSettings{Enabled: true, Keep: 1}, UpdateCheck: true}
}

// DefaultSettingsPath returns <user config dir>/de.netinventors.gosshpher/settings.json.
func DefaultSettingsPath() string {
	dir, err := os.UserConfigDir()
	if err != nil {
		return ""
	}
	return filepath.Join(dir, AppID, "settings.json")
}

func (s *Settings) normalize() {
	s.Language = i18n.Normalize(s.Language)
	if s.Backup.Keep < 0 {
		s.Backup.Keep = 0
	}
	if s.Backup.Keep > 1000 {
		s.Backup.Keep = 1000
	}
	s.Terminal = strings.TrimSpace(s.Terminal)
}

// loadSettings reads the settings file; a missing file yields the defaults.
// Fields missing in the file keep their default values.
func loadSettings(path string) (Settings, error) {
	s := DefaultSettings()
	if path == "" {
		return s, nil
	}
	data, err := os.ReadFile(path)
	if errors.Is(err, fs.ErrNotExist) {
		return s, nil
	}
	if err != nil {
		return s, err
	}
	if err := json.Unmarshal(data, &s); err != nil {
		return DefaultSettings(), err
	}
	s.normalize()
	return s, nil
}

// saveSettings writes the settings file atomically with mode 0600.
func saveSettings(path string, s Settings) error {
	if path == "" {
		return errors.New(i18n.T(s.Language, "error.noConfigDir", nil))
	}
	data, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(path), ".settings-*")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name())
	if _, err := tmp.Write(append(data, '\n')); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Chmod(0o600); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmp.Name(), path)
}

// SettingsInfo is what the frontend receives.
type SettingsInfo struct {
	Settings Settings `json:"settings"`
	Path     string   `json:"path"`
	// Error is set when the file exists but could not be read.
	Error string `json:"error,omitempty"`
}

// GetSettings returns the current settings and where they are stored.
func (a *App) GetSettings() SettingsInfo {
	a.mu.Lock()
	defer a.mu.Unlock()
	return SettingsInfo{Settings: a.settings, Path: a.settingsPath, Error: a.settingsErr}
}

// SaveSettings stores the settings of the settings dialog; the view settings
// (UI) are kept.
func (a *App) SaveSettings(in Settings) (SettingsInfo, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	s := in
	s.UI = a.settings.UI
	s.normalize()
	if err := saveSettings(a.settingsPath, s); err != nil {
		return SettingsInfo{}, err
	}
	a.settings, a.settingsErr = s, ""
	return SettingsInfo{Settings: a.settings, Path: a.settingsPath}, nil
}

// SaveUISettings stores the view settings of the frontend.
func (a *App) SaveUISettings(ui UISettings) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.settings.UI = ui
	if a.settingsErr != "" {
		// never overwrite a file we could not read
		return nil
	}
	return saveSettings(a.settingsPath, a.settings)
}

// Languages lists the available UI languages.
func (a *App) Languages() []i18n.Language {
	return i18n.Languages()
}

// Translations returns the texts of a language (missing keys in English).
func (a *App) Translations(language string) map[string]string {
	return i18n.Catalog(language)
}

// lang is the current UI language; the caller holds a.mu or accepts a race
// on a plain string read.
func (a *App) lang() string {
	return a.settings.Language
}
