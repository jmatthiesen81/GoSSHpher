// Package sshconfig reads, edits and writes OpenSSH client configuration files
// without losing formatting, comments or block order, and evaluates them the
// way ssh(1) does (first obtained value wins).
package sshconfig

// EntryType distinguishes the kinds of lines inside a block.
type EntryType string

const (
	EntryOption  EntryType = "option"
	EntryComment EntryType = "comment"
	EntryBlank   EntryType = "blank"
)

// BlockKind distinguishes the preamble (options before the first Host/Match
// line) from Host and Match blocks.
type BlockKind string

const (
	KindGlobal BlockKind = "global"
	KindHost   BlockKind = "host"
	KindMatch  BlockKind = "match"
)

// Entry is one line of a config file.
//
// Raw holds the original line text. As long as Key/Value (or Text) still
// describe Raw, the original line is written back unchanged; otherwise the
// line is regenerated from the structured fields.
type Entry struct {
	Type  EntryType `json:"type"`
	Key   string    `json:"key,omitempty"`
	Value string    `json:"value,omitempty"`
	Text  string    `json:"text,omitempty"` // comment text including the leading '#'
	Raw   string    `json:"raw,omitempty"`
}

// Block is a Host block, a Match block or the global preamble.
type Block struct {
	ID   string    `json:"id"`
	Kind BlockKind `json:"kind"`
	// Keyword is the header keyword as written ("Host", "host", "Match" ...).
	Keyword string `json:"keyword,omitempty"`
	// Patterns is the header argument: the host patterns of a Host block or
	// the criteria of a Match block, exactly as written.
	Patterns  string `json:"patterns,omitempty"`
	HeaderRaw string `json:"headerRaw,omitempty"`
	// Leading holds comment and blank lines directly above the header; they
	// move together with the block.
	Leading []Entry `json:"leading"`
	Entries []Entry `json:"entries"`

	// Group is the name of the group the block belongs to (one level).
	// Groups are stored as comment markers "# [Name] start" / "# [Name] end"
	// around a contiguous run of blocks.
	Group string `json:"group,omitempty"`
	// GroupStartRaw / GroupStartPos keep the original start marker line and
	// its position inside Leading so unchanged files round-trip exactly.
	GroupStartRaw string `json:"groupStartRaw,omitempty"`
	GroupStartPos int    `json:"groupStartPos,omitempty"`
	// GroupEndRaw keeps the original end marker line of the last block and
	// GroupEndTrail the number of entries that followed it.
	GroupEndRaw   string `json:"groupEndRaw,omitempty"`
	GroupEndTrail int    `json:"groupEndTrail,omitempty"`
}

// Config is a whole config file. Blocks[0] is always the global preamble.
type Config struct {
	Blocks  []Block `json:"blocks"`
	NewLine string  `json:"newline"`
	// FinalNewline records whether the file ended with a line break.
	FinalNewline bool `json:"finalNewline"`
}

// PatternList splits the patterns of a Host block into its single patterns.
func (b *Block) PatternList() []string {
	return splitArgs(b.Patterns)
}

// Label is a short, language-neutral name of the block ("Host a b",
// "Match …"); it is empty for the global preamble.
func (b *Block) Label() string {
	switch b.Kind {
	case KindGlobal:
		return "" // the UI shows a translated name for the preamble
	case KindMatch:
		return "Match " + b.Patterns
	default:
		return "Host " + b.Patterns
	}
}
