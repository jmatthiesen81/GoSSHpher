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

// Templates are stored per user next to the settings file, not in the ssh
// config: they belong to the user, apply to every file and must not end up
// in configs that are shared (dotfiles, team includes).
//
// Values may contain placeholders such as {alias} or {customer=acme}; they
// are filled in by the frontend when a template is applied.

// Template kinds.
const (
	KindHostTemplate  = "host"  // options for one Host block
	KindGroupTemplate = "group" // a group name plus several Host blocks
)

// TemplateOption is one option line of a template.
type TemplateOption struct {
	Key   string `json:"key"`
	Value string `json:"value"`
}

// TemplateHost is one Host block of a group template.
type TemplateHost struct {
	Patterns string           `json:"patterns"`
	Options  []TemplateOption `json:"options"`
}

// Template is a host template (Options) or a group template (Group, Hosts).
type Template struct {
	Name    string           `json:"name"`
	Kind    string           `json:"kind"`
	Options []TemplateOption `json:"options,omitempty"`
	Group   string           `json:"group,omitempty"`
	Hosts   []TemplateHost   `json:"hosts,omitempty"`
}

// templateFile is the JSON layout of templates.json.
type templateFile struct {
	Version   int        `json:"version"`
	Templates []Template `json:"templates"`
}

// TemplatesInfo is what the frontend receives.
type TemplatesInfo struct {
	Templates []Template `json:"templates"`
	Path      string     `json:"path"`
	// Error is set when the file exists but could not be read.
	Error string `json:"error,omitempty"`
}

// templatesPath is templates.json in the directory of the settings file.
func templatesPath(settingsPath string) string {
	if settingsPath == "" {
		return ""
	}
	return filepath.Join(filepath.Dir(settingsPath), "templates.json")
}

func normalizeOptions(in []TemplateOption) []TemplateOption {
	out := []TemplateOption{}
	for _, o := range in {
		o.Key = strings.TrimSpace(o.Key)
		o.Value = strings.TrimSpace(o.Value)
		if o.Key != "" {
			out = append(out, o)
		}
	}
	return out
}

// normalizeTemplates trims names and values, drops empty options and hosts
// and checks the templates. The error is an i18n key.
func normalizeTemplates(in []Template) ([]Template, string, map[string]string) {
	out := make([]Template, 0, len(in))
	seen := map[string]bool{}
	for _, t := range in {
		t.Name = strings.TrimSpace(t.Name)
		if t.Kind == "" {
			t.Kind = KindHostTemplate
		}
		params := map[string]string{"name": t.Name}
		if t.Name == "" {
			return nil, "template.error.name", params
		}
		if t.Kind != KindHostTemplate && t.Kind != KindGroupTemplate {
			return nil, "template.error.kind", params
		}
		key := t.Kind + "\x00" + strings.ToLower(t.Name)
		if seen[key] {
			return nil, "template.error.duplicate", params
		}
		seen[key] = true
		if t.Kind == KindHostTemplate {
			t.Options = normalizeOptions(t.Options)
			t.Group, t.Hosts = "", nil
		} else {
			t.Group = strings.TrimSpace(t.Group)
			if t.Group == "" {
				return nil, "template.error.group", params
			}
			hosts := []TemplateHost{}
			for _, h := range t.Hosts {
				h.Patterns = strings.Join(strings.Fields(h.Patterns), " ")
				h.Options = normalizeOptions(h.Options)
				if h.Patterns != "" {
					hosts = append(hosts, h)
				}
			}
			if len(hosts) == 0 {
				return nil, "template.error.hosts", params
			}
			t.Options, t.Hosts = nil, hosts
		}
		out = append(out, t)
	}
	return out, "", nil
}

// loadTemplates reads templates.json; a missing file yields no templates.
func loadTemplates(path string) ([]Template, error) {
	if path == "" {
		return []Template{}, nil
	}
	data, err := os.ReadFile(path)
	if errors.Is(err, fs.ErrNotExist) {
		return []Template{}, nil
	}
	if err != nil {
		return nil, err
	}
	var f templateFile
	if err := json.Unmarshal(data, &f); err != nil {
		return nil, err
	}
	if f.Templates == nil {
		f.Templates = []Template{}
	}
	return f.Templates, nil
}

// GetTemplates reads the templates from disk (so edits by hand and saves from
// other windows are picked up).
func (a *App) GetTemplates() TemplatesInfo {
	a.mu.Lock()
	path := templatesPath(a.settingsPath)
	a.mu.Unlock()
	list, err := loadTemplates(path)
	if err != nil {
		return TemplatesInfo{Templates: []Template{}, Path: path, Error: err.Error()}
	}
	return TemplatesInfo{Templates: list, Path: path}
}

// SaveTemplates replaces all templates. A file that exists but cannot be read
// is never overwritten, so no templates are lost to a typo made by hand.
func (a *App) SaveTemplates(list []Template) (TemplatesInfo, error) {
	a.mu.Lock()
	path, lang := templatesPath(a.settingsPath), a.lang()
	a.mu.Unlock()
	if path == "" {
		return TemplatesInfo{}, errors.New(i18n.T(lang, "error.noConfigDir", nil))
	}
	if _, err := loadTemplates(path); err != nil {
		return TemplatesInfo{}, errors.New(i18n.T(lang, "template.error.unreadable", map[string]string{"path": path, "error": err.Error()}))
	}
	norm, key, params := normalizeTemplates(list)
	if key != "" {
		return TemplatesInfo{}, errors.New(i18n.T(lang, key, params))
	}
	data, err := json.MarshalIndent(templateFile{Version: 1, Templates: norm}, "", "  ")
	if err != nil {
		return TemplatesInfo{}, err
	}
	if err := writeFileAtomic(path, append(data, '\n')); err != nil {
		return TemplatesInfo{}, err
	}
	return TemplatesInfo{Templates: norm, Path: path}, nil
}
