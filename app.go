package main

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"sync"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"

	"gosshpher/internal/i18n"
	"gosshpher/internal/sshconfig"
)

// backupSuffix matches the suffix of backups written by GoSSHpher, so the
// rotation never touches other files.
var backupSuffix = regexp.MustCompile(`^\.bak-\d{8}-\d{6}$`)

// ErrConflict is returned by Save when the file changed on disk since it was
// loaded. The frontend then asks and calls SaveForce.
var ErrConflict = errors.New("CONFLICT")

// App is bound to the frontend. All exported methods are callable from JS.
type App struct {
	ctx context.Context

	mu       sync.Mutex
	path     string
	cfg      *sshconfig.Config
	diskText string // file content at load / last save
	exists   bool
	backedUp map[string]bool

	settings     Settings
	settingsPath string
	settingsErr  string
}

// State is what the frontend renders.
type State struct {
	Path   string            `json:"path"`
	Exists bool              `json:"exists"`
	Config *sshconfig.Config `json:"config"`
	Text   string            `json:"text"`
	Dirty  bool              `json:"dirty"`
	Issues []sshconfig.Issue `json:"issues"`
	// Hostnames maps block ids to their effective Hostname (for sorting).
	Hostnames map[string]string `json:"hostnames"`
}

// NewApp creates the application with the config path to edit.
func NewApp(path string) *App {
	return &App{
		path:         path,
		backedUp:     map[string]bool{},
		settings:     DefaultSettings(),
		settingsPath: DefaultSettingsPath(),
	}
}

// DefaultConfigPath is ~/.ssh/config.
func DefaultConfigPath() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return ".ssh/config"
	}
	return filepath.Join(home, ".ssh", "config")
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	if s, err := loadSettings(a.settingsPath); err != nil {
		runtime.LogErrorf(ctx, "settings %s: %v", a.settingsPath, err)
		a.settingsErr = err.Error()
	} else {
		a.settings = s
	}
	if err := a.load(a.path); err != nil {
		runtime.LogErrorf(ctx, "load %s: %v", a.path, err)
		a.cfg = sshconfig.Parse("")
	}
	a.updateTitle()
}

func (a *App) beforeClose(ctx context.Context) bool {
	a.mu.Lock()
	dirty := a.cfg != nil && a.cfg.String() != a.diskText
	lang := a.lang()
	a.mu.Unlock()
	if !dirty {
		return false
	}
	answer, err := runtime.MessageDialog(ctx, runtime.MessageDialogOptions{
		Type:    runtime.QuestionDialog,
		Title:   i18n.T(lang, "dialog.close.title", nil),
		Message: i18n.T(lang, "dialog.close.text", nil),
	})
	if err != nil {
		return false
	}
	return answer != "Yes" && answer != "Ok"
}

// load reads a file; a missing file starts an empty config.
func (a *App) load(path string) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	data, err := os.ReadFile(path)
	switch {
	case errors.Is(err, fs.ErrNotExist):
		a.path, a.cfg, a.diskText, a.exists = path, sshconfig.Parse(""), "", false
		return nil
	case err != nil:
		return err
	}
	a.path = path
	a.diskText = string(data)
	a.cfg = sshconfig.Parse(a.diskText)
	a.exists = true
	return nil
}

func (a *App) stateLocked() State {
	text := a.cfg.String()
	opts := a.resolveOptions()
	return State{
		Path:      a.path,
		Exists:    a.exists,
		Config:    a.cfg,
		Text:      text,
		Dirty:     text != a.diskText,
		Issues:    sshconfig.Analyze(a.cfg, opts),
		Hostnames: sshconfig.EffectiveHostnames(a.cfg, opts),
	}
}

func (a *App) resolveOptions() sshconfig.ResolveOptions {
	return sshconfig.ResolveOptions{IncludeDir: filepath.Dir(a.path)}
}

func (a *App) updateTitle() {
	if a.ctx == nil {
		return
	}
	a.mu.Lock()
	title := "GoSSHpher – " + a.path
	if a.cfg != nil && a.cfg.String() != a.diskText {
		title += " •"
	}
	a.mu.Unlock()
	runtime.WindowSetTitle(a.ctx, title)
}

// GetState returns the current document.
func (a *App) GetState() State {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.stateLocked()
}

// Update replaces the document with the edited version from the UI.
func (a *App) Update(cfg sshconfig.Config) State {
	a.mu.Lock()
	a.cfg = &cfg
	st := a.stateLocked()
	a.mu.Unlock()
	a.updateTitle()
	return st
}

// ParseText replaces the document with raw text from the text editor.
func (a *App) ParseText(text string) State {
	a.mu.Lock()
	nl := a.cfg.NewLine
	a.cfg = sshconfig.Parse(text)
	if nl == "\r\n" && a.cfg.NewLine == "\n" {
		a.cfg.NewLine = nl
	}
	st := a.stateLocked()
	a.mu.Unlock()
	a.updateTitle()
	return st
}

// Resolve shows the effective configuration for a host (like ssh -G).
// exec holds assumed results of "Match exec" commands (expanded command →
// exit status 0), chosen in the UI or from RunMatchExec.
func (a *App) Resolve(host, user string, exec map[string]bool) *sshconfig.Resolution {
	a.mu.Lock()
	defer a.mu.Unlock()
	opts := a.resolveOptions()
	opts.User = user
	opts.Exec = exec
	return sshconfig.Resolve(a.cfg, host, opts)
}

// PreviewChanges compares the current document with a proposed version and
// lists effective option values that would change for any host alias.
func (a *App) PreviewChanges(cfg sshconfig.Config) []sshconfig.EffectChange {
	a.mu.Lock()
	defer a.mu.Unlock()
	return sshconfig.DiffEffective(a.cfg, &cfg, a.resolveOptions())
}

// Keywords lists the known ssh_config keywords.
func (a *App) Keywords() []sshconfig.Keyword {
	return sshconfig.Keywords()
}

// NewID returns a fresh block id.
func (a *App) NewID() string { return sshconfig.NewID() }

// Reload discards unsaved changes and reads the file again.
func (a *App) Reload() (State, error) {
	if err := a.load(a.path); err != nil {
		return State{}, err
	}
	a.updateTitle()
	return a.GetState(), nil
}

// Open shows a file dialog and loads the chosen file.
func (a *App) Open() (State, error) {
	a.mu.Lock()
	dir, lang := filepath.Dir(a.path), a.lang()
	a.mu.Unlock()
	path, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title:            i18n.T(lang, "dialog.open.title", nil),
		DefaultDirectory: dir,
		ShowHiddenFiles:  true,
	})
	if err != nil {
		return State{}, err
	}
	if path == "" {
		return a.GetState(), nil
	}
	if err := a.load(path); err != nil {
		return State{}, err
	}
	a.updateTitle()
	return a.GetState(), nil
}

// Save writes the document. It refuses with ErrConflict when the file was
// changed by someone else since it was loaded.
func (a *App) Save() (State, error) {
	return a.save(false)
}

// SaveForce writes the document even if the file changed on disk.
func (a *App) SaveForce() (State, error) {
	return a.save(true)
}

// SaveAs asks for a new path and writes the document there.
func (a *App) SaveAs() (State, error) {
	a.mu.Lock()
	dir, name, lang := filepath.Dir(a.path), filepath.Base(a.path), a.lang()
	a.mu.Unlock()
	path, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:            i18n.T(lang, "dialog.saveAs.title", nil),
		DefaultDirectory: dir,
		DefaultFilename:  name,
		ShowHiddenFiles:  true,
	})
	if err != nil || path == "" {
		return a.GetState(), err
	}
	a.mu.Lock()
	a.path = path
	if data, err := os.ReadFile(path); err == nil {
		a.diskText, a.exists = string(data), true
	} else {
		a.diskText, a.exists = "", false
	}
	a.mu.Unlock()
	return a.save(true)
}

func (a *App) save(force bool) (State, error) {
	a.mu.Lock()
	defer func() {
		a.mu.Unlock()
		a.updateTitle()
	}()

	// Write through symlinks (e.g. dotfile repositories).
	target := a.path
	if resolved, err := filepath.EvalSymlinks(a.path); err == nil {
		target = resolved
	}

	current, err := os.ReadFile(target)
	exists := err == nil
	if err != nil && !errors.Is(err, fs.ErrNotExist) {
		return State{}, err
	}
	if !force && (exists != a.exists || string(current) != a.diskText) {
		// the frontend recognises ErrConflict and shows its own dialog
		return State{}, fmt.Errorf("%w: %s", ErrConflict, a.path)
	}

	mode := fs.FileMode(0o600)
	if info, err := os.Stat(target); err == nil {
		mode = info.Mode().Perm()
	}
	if exists && a.settings.Backup.Enabled && !a.backedUp[target] {
		backup := target + ".bak-" + time.Now().Format("20060102-150405")
		if err := os.WriteFile(backup, current, mode); err != nil {
			return State{}, errors.New(i18n.T(a.lang(), "error.backup", map[string]string{"error": err.Error()}))
		}
		a.backedUp[target] = true
		if keep := a.settings.Backup.Keep; keep > 0 {
			pruneBackups(target, keep)
		}
	}

	text := a.cfg.String()
	if err := os.MkdirAll(filepath.Dir(target), 0o700); err != nil {
		return State{}, err
	}
	tmp, err := os.CreateTemp(filepath.Dir(target), ".gosshpher-*")
	if err != nil {
		return State{}, err
	}
	defer os.Remove(tmp.Name())
	if _, err := tmp.WriteString(text); err != nil {
		tmp.Close()
		return State{}, err
	}
	if err := tmp.Chmod(mode); err != nil {
		tmp.Close()
		return State{}, err
	}
	if err := tmp.Close(); err != nil {
		return State{}, err
	}
	if err := os.Rename(tmp.Name(), target); err != nil {
		return State{}, err
	}
	a.diskText = text
	a.exists = true
	return a.stateLocked(), nil
}

// pruneBackups removes all but the newest keep backups of target. Only files
// named <target>.bak-YYYYMMDD-HHMMSS are considered; errors are ignored
// because a failed cleanup must not fail the save.
func pruneBackups(target string, keep int) {
	matches, err := filepath.Glob(target + ".bak-*")
	if err != nil {
		return
	}
	var backups []string
	for _, m := range matches {
		if backupSuffix.MatchString(m[len(target):]) {
			backups = append(backups, m)
		}
	}
	// the timestamp format sorts chronologically
	sort.Strings(backups)
	for len(backups) > keep {
		_ = os.Remove(backups[0])
		backups = backups[1:]
	}
}
