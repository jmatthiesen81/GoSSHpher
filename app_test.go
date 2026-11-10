package main

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"gosshpher/internal/sshconfig"
)

func TestSaveBackupConflictAndSymlink(t *testing.T) {
	dir := t.TempDir()
	real := filepath.Join(dir, "dotfiles-config")
	link := filepath.Join(dir, "config")
	orig := "Host a\n  User x\n"
	if err := os.WriteFile(real, []byte(orig), 0o640); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(real, link); err != nil {
		t.Fatal(err)
	}

	app := NewApp(link)
	if err := app.load(link); err != nil {
		t.Fatal(err)
	}
	st := app.GetState()
	if st.Dirty {
		t.Fatal("fresh state must not be dirty")
	}

	cfg := *st.Config
	cfg.Blocks[1].Entries[0].Value = "y"
	if st = app.Update(cfg); !st.Dirty {
		t.Fatal("edit must mark dirty")
	}
	if _, err := app.Save(); err != nil {
		t.Fatal(err)
	}

	if fi, err := os.Lstat(link); err != nil || fi.Mode()&os.ModeSymlink == 0 {
		t.Fatal("symlink was replaced")
	}
	data, _ := os.ReadFile(real)
	if string(data) != "Host a\n  User y\n" {
		t.Fatalf("unexpected content %q", data)
	}
	if fi, _ := os.Stat(real); fi.Mode().Perm() != 0o640 {
		t.Errorf("mode changed to %v", fi.Mode().Perm())
	}
	backups, _ := filepath.Glob(real + ".bak-*")
	if len(backups) != 1 {
		t.Fatalf("expected one backup, got %v", backups)
	}
	if b, _ := os.ReadFile(backups[0]); string(b) != orig {
		t.Errorf("backup content %q", b)
	}

	// external change -> conflict
	if err := os.WriteFile(real, []byte("Host other\n"), 0o640); err != nil {
		t.Fatal(err)
	}
	cfg2 := *app.GetState().Config
	cfg2.Blocks[1].Entries = append(cfg2.Blocks[1].Entries, sshconfig.Entry{Type: sshconfig.EntryOption, Key: "Port", Value: "2"})
	app.Update(cfg2)
	if _, err := app.Save(); !errors.Is(err, ErrConflict) {
		t.Fatalf("expected conflict, got %v", err)
	}
	if _, err := app.SaveForce(); err != nil {
		t.Fatal(err)
	}
	data, _ = os.ReadFile(real)
	if !strings.Contains(string(data), "  Port 2\n") {
		t.Errorf("forced save content %q", data)
	}
	if backups, _ := filepath.Glob(real + ".bak-*"); len(backups) != 1 {
		t.Errorf("only the first save per session should create a backup, got %v", backups)
	}
}

func TestPruneBackups(t *testing.T) {
	dir := t.TempDir()
	target := filepath.Join(dir, "config")
	names := []string{
		"config.bak-20260101-100000", "config.bak-20260102-100000", "config.bak-20260103-100000",
		"config.bak-20260104-100000", "config.bak-20260105-100000", "config.bak-20260106-100000",
		"config.bak-20260107-100000",
		"config.bak-manual",         // not ours, must stay
		"config.bak-20260101-1000",  // wrong format, must stay
		"other.bak-20260101-100000", // other file, must stay
	}
	for _, n := range names {
		if err := os.WriteFile(filepath.Join(dir, n), nil, 0o600); err != nil {
			t.Fatal(err)
		}
	}
	pruneBackups(target, 5)
	left, _ := filepath.Glob(filepath.Join(dir, "*"))
	var got []string
	for _, l := range left {
		got = append(got, filepath.Base(l))
	}
	want := []string{
		"config.bak-20260101-1000", "config.bak-20260103-100000", "config.bak-20260104-100000",
		"config.bak-20260105-100000", "config.bak-20260106-100000", "config.bak-20260107-100000",
		"config.bak-manual", "other.bak-20260101-100000",
	}
	if strings.Join(got, ",") != strings.Join(want, ",") {
		t.Errorf("left %v\nwant %v", got, want)
	}
}

func TestSettings(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "gosshpher", "settings.json")

	// missing file -> defaults
	s, err := loadSettings(path)
	if err != nil || !s.Backup.Enabled || s.Backup.Keep != 1 {
		t.Fatalf("defaults: %+v %v", s, err)
	}

	// partial file keeps defaults for missing fields
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(`{"backup":{"keep":-3}}`), 0o600); err != nil {
		t.Fatal(err)
	}
	if s, _ = loadSettings(path); !s.Backup.Enabled || s.Backup.Keep != 0 {
		t.Errorf("partial file: %+v", s)
	}

	// broken file is reported and not overwritten by UI settings
	if err := os.WriteFile(path, []byte("{broken"), 0o600); err != nil {
		t.Fatal(err)
	}
	app := NewApp(filepath.Join(dir, "config"))
	app.settingsPath = path
	if _, err := loadSettings(path); err == nil {
		t.Fatal("broken file must fail")
	}
	app.settingsErr = "broken"
	if err := app.SaveUISettings(UISettings{Sort: "alias"}); err != nil {
		t.Fatal(err)
	}
	if data, _ := os.ReadFile(path); string(data) != "{broken" {
		t.Errorf("broken settings file was overwritten: %q", data)
	}

	// explicit save writes the file with mode 0600
	info, err := app.SaveSettings("xx", BackupSettings{Enabled: false, Keep: 3})
	if err != nil || info.Settings.Backup.Enabled || info.Settings.Backup.Keep != 3 || info.Settings.UI.Sort != "alias" ||
		info.Settings.Language != "en" {
		t.Fatalf("save: %+v %v", info, err)
	}
	if fi, _ := os.Stat(path); fi.Mode().Perm() != 0o600 {
		t.Errorf("mode %v", fi.Mode().Perm())
	}
	if s, err = loadSettings(path); err != nil || s.Backup.Enabled || s.Backup.Keep != 3 {
		t.Errorf("reload: %+v %v", s, err)
	}
}

func TestSaveWithoutBackup(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config")
	if err := os.WriteFile(path, []byte("Host a\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	app := NewApp(path)
	app.settings.Backup.Enabled = false
	if err := app.load(path); err != nil {
		t.Fatal(err)
	}
	if _, err := app.Save(); err != nil {
		t.Fatal(err)
	}
	if b, _ := filepath.Glob(path + ".bak-*"); len(b) != 0 {
		t.Errorf("backup written although disabled: %v", b)
	}
}
