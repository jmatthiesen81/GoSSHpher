package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func newTemplateApp(t *testing.T) (*App, string) {
	t.Helper()
	dir := t.TempDir()
	a := NewApp(filepath.Join(dir, "config"))
	a.settingsPath = filepath.Join(dir, "settings", "settings.json")
	return a, filepath.Join(dir, "settings", "templates.json")
}

func TestTemplatesRoundTrip(t *testing.T) {
	a, path := newTemplateApp(t)
	if info := a.GetTemplates(); len(info.Templates) != 0 || info.Error != "" || info.Path != path {
		t.Fatalf("missing file: %+v", info)
	}
	in := []Template{
		{Name: " Web ", Kind: "host", Options: []TemplateOption{{Key: " User ", Value: " admin "}, {Key: "", Value: "dropped"}}},
		{Name: "Customer", Kind: "group", Group: "Customer {customer}", Hosts: []TemplateHost{
			{Patterns: " web.{customer}.de  web ", Options: []TemplateOption{{Key: "ProxyJump", Value: "bastion.{customer}.de"}}},
			{Patterns: "  ", Options: []TemplateOption{{Key: "User", Value: "x"}}},
		}},
	}
	out, err := a.SaveTemplates(in)
	if err != nil {
		t.Fatal(err)
	}
	if out.Templates[0].Name != "Web" || len(out.Templates[0].Options) != 1 || out.Templates[0].Options[0] != (TemplateOption{"User", "admin"}) {
		t.Errorf("host template not normalized: %+v", out.Templates[0])
	}
	if h := out.Templates[1].Hosts; len(h) != 1 || h[0].Patterns != "web.{customer}.de web" {
		t.Errorf("group hosts not normalized: %+v", h)
	}
	fi, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if fi.Mode().Perm() != 0o600 {
		t.Errorf("mode = %v", fi.Mode().Perm())
	}
	got := a.GetTemplates()
	if len(got.Templates) != 2 || got.Templates[1].Group != "Customer {customer}" {
		t.Errorf("reload: %+v", got)
	}
}

func TestTemplatesValidation(t *testing.T) {
	cases := map[string][]Template{
		"template.error.name":      {{Name: " ", Kind: "host"}},
		"template.error.kind":      {{Name: "a", Kind: "match"}},
		"template.error.duplicate": {{Name: "A", Kind: "host"}, {Name: "a", Kind: "host"}},
		"template.error.group":     {{Name: "a", Kind: "group", Hosts: []TemplateHost{{Patterns: "x"}}}},
		"template.error.hosts":     {{Name: "a", Kind: "group", Group: "G"}},
	}
	for want, list := range cases {
		if _, key, _ := normalizeTemplates(list); key != want {
			t.Errorf("%s: got %q", want, key)
		}
	}
	// the same name is fine for a host and a group template
	if _, key, _ := normalizeTemplates([]Template{{Name: "a", Kind: "host"}, {Name: "a", Kind: "group", Group: "G", Hosts: []TemplateHost{{Patterns: "x"}}}}); key != "" {
		t.Errorf("host and group template with the same name: %q", key)
	}
}

func TestTemplatesNeverOverwriteUnreadableFile(t *testing.T) {
	a, path := newTemplateApp(t)
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("{broken"), 0o600); err != nil {
		t.Fatal(err)
	}
	if info := a.GetTemplates(); info.Error == "" {
		t.Error("broken file must report an error")
	}
	if _, err := a.SaveTemplates([]Template{{Name: "a", Kind: "host"}}); err == nil {
		t.Error("saving over a broken file must fail")
	}
	data, _ := os.ReadFile(path)
	if !strings.Contains(string(data), "{broken") {
		t.Error("broken file was overwritten")
	}
}
