package sshconfig

import (
	"regexp"
	"strings"
)

var groupMarkerRe = regexp.MustCompile(`(?i)^#\s*\[([^\[\]]+)\]\s*(start|end)\s*$`)

// ParseGroupMarker recognises "# [Name] start" and "# [Name] end".
func ParseGroupMarker(text string) (name string, start bool, ok bool) {
	m := groupMarkerRe.FindStringSubmatch(strings.TrimSpace(text))
	if m == nil {
		return "", false, false
	}
	return strings.TrimSpace(m[1]), strings.EqualFold(m[2], "start"), true
}

// GroupMarker renders a start or end marker line.
func GroupMarker(name string, start bool) string {
	if start {
		return "# [" + name + "] start"
	}
	return "# [" + name + "] end"
}

// Reasons returned by ValidateGroupName; they are translation keys.
const (
	GroupErrEmpty    = "group.error.empty"
	GroupErrBrackets = "group.error.brackets"
	GroupErrTooLong  = "group.error.tooLong"
)

// ValidateGroupName checks whether a name can be stored in a marker. It
// returns "" for a valid name, otherwise one of the GroupErr* reasons.
func ValidateGroupName(name string) string {
	n := strings.TrimSpace(name)
	switch {
	case n == "":
		return GroupErrEmpty
	case strings.ContainsAny(n, "[]\r\n"):
		return GroupErrBrackets
	case len(n) > 80:
		return GroupErrTooLong
	}
	return ""
}

func sameGroup(a, b string) bool {
	return strings.EqualFold(strings.TrimSpace(a), strings.TrimSpace(b))
}

// extractGroups turns group marker comments into Block.Group and removes the
// marker lines from the comments. Markers that do not fit (an end marker
// without a matching start) are kept as ordinary comments.
func extractGroups(cfg *Config) {
	current := ""
	for bi := 1; bi < len(cfg.Blocks); bi++ {
		b := &cfg.Blocks[bi]
		kept := make([]Entry, 0, len(b.Leading))
		for _, e := range b.Leading {
			if e.Type == EntryComment {
				if name, start, ok := ParseGroupMarker(e.Text); ok {
					if !start && current != "" && sameGroup(name, current) {
						// lines between the last host and the end marker
						// belong to the last block of the group
						prev := &cfg.Blocks[bi-1]
						prev.Entries = append(prev.Entries, kept...)
						prev.GroupEndRaw = e.Raw
						prev.GroupEndTrail = 0
						kept = kept[:0]
						current = ""
						continue
					}
					if start {
						// an open group is closed implicitly
						current = name
						b.GroupStartRaw = e.Raw
						b.GroupStartPos = len(kept)
						continue
					}
				}
			}
			kept = append(kept, e)
		}
		b.Leading = kept
		b.Group = current
	}

	// The end marker of a group at the end of the file is part of the
	// trailing comments of the last block.
	if current == "" {
		return
	}
	last := &cfg.Blocks[len(cfg.Blocks)-1]
	for i := len(last.Entries) - 1; i >= 0 && last.Entries[i].Type != EntryOption; i-- {
		e := last.Entries[i]
		if e.Type != EntryComment {
			continue
		}
		if name, start, ok := ParseGroupMarker(e.Text); ok && !start && sameGroup(name, current) {
			last.GroupEndRaw = e.Raw
			last.GroupEndTrail = len(last.Entries) - 1 - i
			last.Entries = append(last.Entries[:i], last.Entries[i+1:]...)
			return
		}
	}
}

func markerLine(raw, name string, start bool) string {
	if raw != "" {
		// the end marker may differ in case, like the parser accepts it
		if n, s, ok := ParseGroupMarker(raw); ok && s == start && (n == name || (!start && sameGroup(n, name))) {
			return raw
		}
	}
	return GroupMarker(strings.TrimSpace(name), start)
}
