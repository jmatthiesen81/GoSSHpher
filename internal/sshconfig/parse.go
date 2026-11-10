package sshconfig

import (
	"crypto/rand"
	"encoding/hex"
	"strings"
)

// NewID returns a random identifier for a block.
func NewID() string {
	var b [8]byte
	_, _ = rand.Read(b[:])
	return hex.EncodeToString(b[:])
}

// Parse reads a config file. It never fails: lines it does not understand
// are kept as options with their raw text so they survive a round trip.
func Parse(text string) *Config {
	cfg := &Config{NewLine: "\n"}
	if strings.Contains(text, "\r\n") {
		cfg.NewLine = "\r\n"
		text = strings.ReplaceAll(text, "\r\n", "\n")
	}
	cfg.FinalNewline = strings.HasSuffix(text, "\n")
	text = strings.TrimSuffix(text, "\n")

	cur := Block{ID: NewID(), Kind: KindGlobal, Leading: []Entry{}, Entries: []Entry{}}
	if text == "" && !cfg.FinalNewline {
		cfg.Blocks = []Block{cur}
		cfg.FinalNewline = true
		return cfg
	}

	for _, line := range strings.Split(text, "\n") {
		e := parseLine(line)
		if e.Type == EntryOption {
			kw := strings.ToLower(e.Key)
			if kw == "host" || kw == "match" {
				// Comments and blank lines directly above the header belong
				// to the new block.
				cut := len(cur.Entries)
				for cut > 0 && cur.Entries[cut-1].Type != EntryOption {
					cut--
				}
				leading := append([]Entry{}, cur.Entries[cut:]...)
				cur.Entries = cur.Entries[:cut]
				cfg.Blocks = append(cfg.Blocks, cur)

				kind := KindHost
				if kw == "match" {
					kind = KindMatch
				}
				cur = Block{
					ID:        NewID(),
					Kind:      kind,
					Keyword:   e.Key,
					Patterns:  e.Value,
					HeaderRaw: line,
					Leading:   leading,
					Entries:   []Entry{},
				}
				continue
			}
		}
		cur.Entries = append(cur.Entries, e)
	}
	cfg.Blocks = append(cfg.Blocks, cur)
	extractGroups(cfg)
	detachComments(cfg)
	return cfg
}

// detachComments keeps only the comments directly above a Host/Match line
// (plus the blank lines separating them from what comes before) with that
// block. Comments further up, separated by a blank line, belong to the
// previous block or, at the top of the file, to the file header.
//
//	# file header           -> global preamble
//
//	# about github.com      -> Leading of "Host github.com"
//	Host github.com
//
// The order of all lines is kept, so files still round-trip byte for byte.
func detachComments(cfg *Config) {
	for bi := 1; bi < len(cfg.Blocks); bi++ {
		b := &cfg.Blocks[bi]
		last := -1
		for i, e := range b.Leading {
			if e.Type == EntryBlank {
				last = i
			}
		}
		if last < 0 {
			continue
		}
		cut := last
		for cut > 0 && b.Leading[cut-1].Type == EntryBlank {
			cut--
		}
		// lines above the group start marker must stay above it
		if b.GroupStartRaw != "" && b.GroupStartPos < cut {
			cut = b.GroupStartPos
		}
		if cut == 0 {
			continue
		}
		prev := &cfg.Blocks[bi-1]
		prev.Entries = append(prev.Entries, b.Leading[:cut]...)
		if prev.GroupEndRaw != "" {
			// the moved lines followed the end marker of the previous group
			prev.GroupEndTrail += cut
		}
		b.Leading = append([]Entry{}, b.Leading[cut:]...)
		if b.GroupStartRaw != "" {
			b.GroupStartPos -= cut
		}
	}
}

func parseLine(line string) Entry {
	trimmed := strings.TrimSpace(line)
	switch {
	case trimmed == "":
		return Entry{Type: EntryBlank, Raw: line}
	case strings.HasPrefix(trimmed, "#"):
		return Entry{Type: EntryComment, Text: trimmed, Raw: line}
	}
	key, value := splitKeyValue(trimmed)
	return Entry{Type: EntryOption, Key: key, Value: value, Raw: line}
}

// splitKeyValue splits "Key value", "Key=value" and "Key = value".
func splitKeyValue(s string) (string, string) {
	i := strings.IndexAny(s, " \t=")
	if i < 0 {
		return s, ""
	}
	key := s[:i]
	rest := strings.TrimLeft(s[i:], " \t")
	if strings.HasPrefix(rest, "=") {
		rest = strings.TrimLeft(rest[1:], " \t")
	}
	return key, strings.TrimRight(rest, " \t")
}

// splitArgs splits an option value into arguments like ssh does: arguments
// are separated by whitespace, double quotes group, and an unquoted '#' at
// the start of an argument starts a trailing comment.
func splitArgs(s string) []string {
	var args []string
	var cur strings.Builder
	inArg, inQuote := false, false
	for i := 0; i < len(s); i++ {
		c := s[i]
		switch {
		case inQuote:
			if c == '"' {
				inQuote = false
			} else {
				cur.WriteByte(c)
			}
		case c == '"':
			inQuote, inArg = true, true
		case c == ' ' || c == '\t':
			if inArg {
				args = append(args, cur.String())
				cur.Reset()
				inArg = false
			}
		case c == '#' && !inArg:
			return args
		case c == '\\' && i+1 < len(s):
			i++
			cur.WriteByte(s[i])
			inArg = true
		default:
			cur.WriteByte(c)
			inArg = true
		}
	}
	if inArg {
		args = append(args, cur.String())
	}
	return args
}
