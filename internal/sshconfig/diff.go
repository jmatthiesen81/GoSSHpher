package sshconfig

import (
	"sort"
	"strings"
)

// EffectChange is an effective option of a host that differs between two
// versions of a config.
type EffectChange struct {
	Host   string `json:"host"`
	Key    string `json:"key"`
	Before string `json:"before"`
	After  string `json:"after"`
}

// DiffEffective resolves every literal host alias of both configs and
// reports options whose effective value differs. It is used to warn before
// block reordering changes what ssh actually does (first value wins).
func DiffEffective(before, after *Config, opts ResolveOptions) []EffectChange {
	hosts := map[string]bool{}
	for _, cfg := range []*Config{before, after} {
		for _, b := range cfg.Blocks {
			if b.Kind != KindHost {
				continue
			}
			for _, p := range b.PatternList() {
				if !HasWildcard(p) {
					hosts[strings.ToLower(p)] = true
				}
			}
		}
	}
	names := make([]string, 0, len(hosts))
	for h := range hosts {
		names = append(names, h)
	}
	sort.Strings(names)

	changes := []EffectChange{}
	for _, h := range names {
		a := effectiveMap(Resolve(before, h, opts))
		b := effectiveMap(Resolve(after, h, opts))
		keys := map[string]string{}
		for k := range a {
			keys[strings.ToLower(k)] = k
		}
		for k := range b {
			keys[strings.ToLower(k)] = k
		}
		lks := make([]string, 0, len(keys))
		for lk := range keys {
			lks = append(lks, lk)
		}
		sort.Strings(lks)
		for _, lk := range lks {
			k := keys[lk]
			if a[k] != b[k] {
				changes = append(changes, EffectChange{Host: h, Key: k, Before: a[k], After: b[k]})
			}
		}
	}
	return changes
}

func effectiveMap(r *Resolution) map[string]string {
	m := make(map[string]string, len(r.Options))
	for _, o := range r.Options {
		m[o.Key] = strings.Join(o.Values, "\n")
	}
	return m
}
