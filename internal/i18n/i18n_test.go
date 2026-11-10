package i18n

import (
	"regexp"
	"sort"
	"testing"
)

var placeholder = regexp.MustCompile(`\{[a-zA-Z]+\}`)

// TestCatalogsComplete checks that every language has the same keys as the
// fallback language and uses the same placeholders.
func TestCatalogsComplete(t *testing.T) {
	if err := Err(); err != nil {
		t.Fatal(err)
	}
	base := catalogs[Fallback]
	if len(base) == 0 {
		t.Fatal("fallback catalog is empty")
	}
	for code, cat := range catalogs {
		for k, v := range base {
			tv, ok := cat[k]
			if !ok {
				t.Errorf("%s: missing key %q", code, k)
				continue
			}
			want, got := placeholder.FindAllString(v, -1), placeholder.FindAllString(tv, -1)
			sort.Strings(want)
			sort.Strings(got)
			if len(want) != len(got) {
				t.Errorf("%s: %q placeholders %v, want %v", code, k, got, want)
				continue
			}
			for i := range want {
				if want[i] != got[i] {
					t.Errorf("%s: %q placeholders %v, want %v", code, k, got, want)
					break
				}
			}
		}
		for k := range cat {
			if _, ok := base[k]; !ok {
				t.Errorf("%s: key %q not in %s", code, k, Fallback)
			}
		}
		if cat["meta.name"] == "" {
			t.Errorf("%s: meta.name missing", code)
		}
	}
}

func TestT(t *testing.T) {
	if got := T("de", "toast.savedAs", map[string]string{"path": "/x"}); got != "Gespeichert unter /x" {
		t.Errorf("de: %q", got)
	}
	if got := T("xx", "toast.saved", nil); got != "Saved" {
		t.Errorf("unknown language should fall back to English: %q", got)
	}
	if got := T("de", "no.such.key", nil); got != "no.such.key" {
		t.Errorf("unknown key: %q", got)
	}
	if Normalize("de") != "de" || Normalize("") != Fallback {
		t.Error("Normalize")
	}
}
