package sshconfig

import (
	"strings"
)

// String renders the config. Lines whose structured content did not change
// are written back byte for byte.
func (c *Config) String() string {
	var lines []string
	groupOf := func(i int) string {
		if i < 1 || i >= len(c.Blocks) {
			return ""
		}
		return strings.TrimSpace(c.Blocks[i].Group)
	}
	for i := range c.Blocks {
		b := &c.Blocks[i]
		group := groupOf(i)
		opensGroup := group != "" && !sameGroup(groupOf(i-1), group)
		closesGroup := group != "" && !sameGroup(groupOf(i+1), group)

		// Start marker: at its original position inside the leading
		// comments, or after the leading blank lines for new groups.
		startPos := -1
		if opensGroup {
			startPos = 0
			if n, s, ok := ParseGroupMarker(b.GroupStartRaw); ok && s && n == group {
				startPos = min(b.GroupStartPos, len(b.Leading))
			} else {
				for startPos < len(b.Leading) && b.Leading[startPos].Type == EntryBlank {
					startPos++
				}
			}
		}
		for li, e := range b.Leading {
			if li == startPos {
				lines = append(lines, markerLine(b.GroupStartRaw, group, true))
			}
			lines = append(lines, renderEntry(e, ""))
		}
		if startPos >= 0 && startPos >= len(b.Leading) {
			lines = append(lines, markerLine(b.GroupStartRaw, group, true))
		}
		if b.Kind != KindGlobal {
			lines = append(lines, renderHeader(b))
		}
		indent := b.indent()
		// The end marker goes directly after the last option, before
		// trailing blank lines (only present at the end of the file).
		body := len(b.Entries)
		if closesGroup {
			lastOption := 0
			for ei, e := range b.Entries {
				if e.Type == EntryOption {
					lastOption = ei + 1
				}
			}
			if n, s, ok := ParseGroupMarker(b.GroupEndRaw); ok && !s && sameGroup(n, group) {
				body = max(lastOption, len(b.Entries)-b.GroupEndTrail)
			} else {
				for body > lastOption && b.Entries[body-1].Type == EntryBlank {
					body--
				}
			}
		}
		for ei, e := range b.Entries {
			if closesGroup && ei == body {
				lines = append(lines, markerLine(b.GroupEndRaw, group, false))
			}
			lines = append(lines, renderEntry(e, indent))
		}
		if closesGroup && body == len(b.Entries) {
			lines = append(lines, markerLine(b.GroupEndRaw, group, false))
		}
	}
	nl := c.NewLine
	if nl == "" {
		nl = "\n"
	}
	out := strings.Join(lines, nl)
	if c.FinalNewline && len(lines) > 0 {
		out += nl
	}
	return out
}

func renderHeader(b *Block) string {
	if b.HeaderRaw != "" {
		e := parseLine(b.HeaderRaw)
		if e.Type == EntryOption && e.Key == b.Keyword && e.Value == b.Patterns {
			return b.HeaderRaw
		}
	}
	kw := b.Keyword
	if kw == "" || !strings.EqualFold(kw, string(b.Kind)) {
		if b.Kind == KindMatch {
			kw = "Match"
		} else {
			kw = "Host"
		}
	}
	return kw + " " + strings.TrimSpace(b.Patterns)
}

func renderEntry(e Entry, indent string) string {
	if e.Raw != "" || e.Type == EntryBlank {
		p := parseLine(e.Raw)
		if p.Type == e.Type {
			switch e.Type {
			case EntryBlank:
				return e.Raw
			case EntryComment:
				if p.Text == e.Text {
					return e.Raw
				}
			case EntryOption:
				if p.Key == e.Key && p.Value == e.Value {
					return e.Raw
				}
			}
		}
	}
	switch e.Type {
	case EntryBlank:
		return ""
	case EntryComment:
		t := strings.TrimSpace(e.Text)
		if !strings.HasPrefix(t, "#") {
			t = "# " + t
		}
		return indent + t
	default:
		v := strings.TrimSpace(e.Value)
		if v == "" {
			return indent + strings.TrimSpace(e.Key)
		}
		return indent + strings.TrimSpace(e.Key) + " " + v
	}
}

// indent returns the indentation used by the existing option lines of the
// block, so regenerated lines match their neighbours.
func (b *Block) indent() string {
	for _, e := range b.Entries {
		if e.Type == EntryOption && e.Raw != "" {
			return e.Raw[:len(e.Raw)-len(strings.TrimLeft(e.Raw, " \t"))]
		}
	}
	if b.Kind == KindGlobal {
		return ""
	}
	return "  "
}
