// Package i18n holds the translation catalogs of GoSSHpher. Each language is
// one JSON file in locales/ (flat key → text, placeholders as {name}). The
// frontend receives the catalogs through the App bindings; Go uses T for the
// few texts it renders itself (native dialogs, error messages).
//
// Adding a language: copy locales/en.json to locales/<code>.json, translate
// the values and set "meta.name" to the language's own name.
package i18n

import (
	"embed"
	"encoding/json"
	"path"
	"sort"
	"strings"
	"sync"
)

// Fallback is the default language and the source for missing keys.
const Fallback = "en"

//go:embed locales/*.json
var files embed.FS

var (
	once     sync.Once
	catalogs map[string]map[string]string
	loadErr  error
)

func load() {
	catalogs = map[string]map[string]string{}
	entries, err := files.ReadDir("locales")
	if err != nil {
		loadErr = err
		return
	}
	for _, e := range entries {
		if !strings.HasSuffix(e.Name(), ".json") {
			continue
		}
		data, err := files.ReadFile(path.Join("locales", e.Name()))
		if err != nil {
			loadErr = err
			return
		}
		var m map[string]string
		if err := json.Unmarshal(data, &m); err != nil {
			loadErr = err
			return
		}
		catalogs[strings.TrimSuffix(e.Name(), ".json")] = m
	}
}

// Language is an available UI language.
type Language struct {
	Code string `json:"code"`
	Name string `json:"name"`
}

// Languages lists the available languages, named in their own language.
func Languages() []Language {
	once.Do(load)
	out := make([]Language, 0, len(catalogs))
	for code, m := range catalogs {
		name := m["meta.name"]
		if name == "" {
			name = code
		}
		out = append(out, Language{Code: code, Name: name})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Code < out[j].Code })
	return out
}

// Normalize returns lang if a catalog exists for it, otherwise Fallback.
func Normalize(lang string) string {
	once.Do(load)
	if _, ok := catalogs[lang]; ok {
		return lang
	}
	return Fallback
}

// Catalog returns all texts of a language, completed with the fallback
// language for missing keys.
func Catalog(lang string) map[string]string {
	once.Do(load)
	out := make(map[string]string, len(catalogs[Fallback]))
	for k, v := range catalogs[Fallback] {
		out[k] = v
	}
	if lang != Fallback {
		for k, v := range catalogs[Normalize(lang)] {
			out[k] = v
		}
	}
	return out
}

// T translates a key and fills {name} placeholders. Unknown keys are
// returned unchanged so missing translations are visible.
func T(lang, key string, params map[string]string) string {
	once.Do(load)
	text, ok := catalogs[Normalize(lang)][key]
	if !ok {
		if text, ok = catalogs[Fallback][key]; !ok {
			return key
		}
	}
	for k, v := range params {
		text = strings.ReplaceAll(text, "{"+k+"}", v)
	}
	return text
}

// Err returns the error that occurred while loading the catalogs, if any.
func Err() error {
	once.Do(load)
	return loadErr
}
