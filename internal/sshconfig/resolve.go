package sshconfig

import (
	"os"
	"os/user"
	"path/filepath"
	"sort"
	"strings"
)

// Source points to the block an effective value came from.
type Source struct {
	BlockID    string `json:"blockId"`
	BlockIndex int    `json:"blockIndex"`
	Label      string `json:"label"`
	// File is empty for the edited file and set for included files.
	File string `json:"file,omitempty"`
}

// ResolvedOption is the effective value of one keyword.
type ResolvedOption struct {
	Key     string   `json:"key"`
	Values  []string `json:"values"`
	Sources []Source `json:"sources"`
	Multi   bool     `json:"multi"`
	// Ignored lists later occurrences that had no effect.
	Ignored []IgnoredValue `json:"ignored,omitempty"`
	// Expanded holds the values with %-tokens, ${ENV} and "~/" substituted
	// as ssh does at connect time; an entry is "" when it equals the value.
	Expanded []string `json:"expanded,omitempty"`
}

// IgnoredValue is an option occurrence that lost against an earlier one.
type IgnoredValue struct {
	Value  string `json:"value"`
	Source Source `json:"source"`
}

// BlockResult tells whether a Host/Match block applied.
type BlockResult struct {
	Source
	Matched bool        `json:"matched"`
	Execs   []ExecCheck `json:"execs,omitempty"`
	Notes   []Note      `json:"notes,omitempty"`
}

// Resolution is the effective configuration for one host, like `ssh -G`.
type Resolution struct {
	Host    string           `json:"host"`
	Options []ResolvedOption `json:"options"`
	Blocks  []BlockResult    `json:"blocks"`
	Notes   []Note           `json:"notes,omitempty"`

	// tokens are the token values of this resolution (for path checks).
	tokens TokenContext
}

// Note is a language-neutral remark about the evaluation: Code selects the
// text ("note.<code>" in the translation catalogs), Params fill it.
type Note struct {
	Code   string            `json:"code"`
	Params map[string]string `json:"params,omitempty"`
}

// Note codes.
const (
	NoteMatchFinal       = "match.finalAssumed"
	NoteMatchCanonical   = "match.canonicalNotSimulated"
	NoteMatchOffline     = "match.offline"
	NoteMatchExec        = "match.execAssumed"
	NoteMatchUnknown     = "match.unknownCriterion"
	NoteMatchSkipped     = "match.notEvaluated"
	NoteIncludeTooDeep   = "include.tooDeep"
	NoteIncludeNotFound  = "include.notFound"
	NoteIncludeReadError = "include.unreadable"
)

// ExecCheck is a "Match exec" criterion met during the evaluation.
type ExecCheck struct {
	Command  string `json:"command"`  // as written in the file
	Expanded string `json:"expanded"` // with %-tokens substituted
	Negated  bool   `json:"negated"`  // written as "!exec"
	// Result is the assumed exit status (true = 0) used for the evaluation;
	// Assumed is false when no assumption was given (ssh would run it).
	Result  bool `json:"result"`
	Assumed bool `json:"assumed"`
}

// ResolveOptions controls the evaluation.
type ResolveOptions struct {
	// User is the user given on the command line (ssh -l / user@host).
	User string
	// LocalUser defaults to the current OS user.
	LocalUser string
	// IncludeDir is the base for relative Include paths (default ~/.ssh).
	IncludeDir string
	// SkipIncludes disables reading included files.
	SkipIncludes bool
	// Exec holds assumed results of "Match exec" commands, keyed by the
	// expanded command. Commands are never run by Resolve; missing ones
	// count as failing.
	Exec map[string]bool
}

type resolver struct {
	opts  ResolveOptions
	host  string
	res   *Resolution
	index map[string]int
	home  string
	notes map[string]bool
	depth int
}

// Resolve evaluates the config for the given host alias.
func Resolve(cfg *Config, host string, opts ResolveOptions) *Resolution {
	home, _ := os.UserHomeDir()
	if opts.LocalUser == "" {
		if u, err := user.Current(); err == nil {
			opts.LocalUser = u.Username
		}
	}
	if opts.IncludeDir == "" {
		opts.IncludeDir = filepath.Join(home, ".ssh")
	}
	r := &resolver{
		opts:  opts,
		host:  strings.ToLower(strings.TrimSpace(host)),
		res:   &Resolution{Host: host, Options: []ResolvedOption{}, Blocks: []BlockResult{}},
		index: map[string]int{},
		home:  home,
		notes: map[string]bool{},
	}
	r.evaluate(cfg, "", true)
	r.expand()
	return r.res
}

// expand fills ResolvedOption.Expanded for keywords that accept tokens.
func (r *resolver) expand() {
	ctx := r.tokenContext()
	r.res.tokens = ctx
	for i := range r.res.Options {
		o := &r.res.Options[i]
		if !AcceptsTokens(o.Key) || strings.EqualFold(o.Key, "Hostname") {
			continue
		}
		exp := make([]string, len(o.Values))
		changed := false
		for j, v := range o.Values {
			if e := ExpandTokens(o.Key, v, ctx); e != v {
				exp[j] = e
				changed = true
			}
		}
		if changed {
			o.Expanded = exp
		}
	}
}

// note adds a remark to the resolution, once per code and parameters.
func (r *resolver) note(code string, p map[string]string) {
	key := code
	for _, k := range []string{"pattern", "file", "error"} {
		key += "\x00" + p[k]
	}
	if !r.notes[key] {
		r.notes[key] = true
		r.res.Notes = append(r.res.Notes, Note{Code: code, Params: p})
	}
}

func (r *resolver) evaluate(cfg *Config, file string, initiallyActive bool) {
	active := initiallyActive
	for bi := range cfg.Blocks {
		b := &cfg.Blocks[bi]
		src := Source{BlockID: b.ID, BlockIndex: bi, Label: b.Label(), File: file}
		switch b.Kind {
		case KindHost:
			active = HostMatches(b.PatternList(), r.host)
			r.res.Blocks = append(r.res.Blocks, BlockResult{Source: src, Matched: active})
		case KindMatch:
			var notes []Note
			var execs []ExecCheck
			active, notes, execs = r.evalMatch(b.Patterns)
			r.res.Blocks = append(r.res.Blocks, BlockResult{Source: src, Matched: active, Notes: notes, Execs: execs})
		}
		for _, e := range b.Entries {
			if e.Type != EntryOption {
				continue
			}
			if strings.EqualFold(e.Key, "Include") {
				if active {
					r.include(e.Value)
				}
				continue
			}
			if active {
				r.apply(e, src)
			}
		}
	}
}

func (r *resolver) apply(e Entry, src Source) {
	key := canonicalKey(e.Key)
	kw, _ := LookupKeyword(key)
	value := strings.TrimSpace(e.Value)
	if strings.EqualFold(key, "Hostname") {
		value = expandHostname(value, r.host)
	}
	lk := strings.ToLower(key)
	if i, ok := r.index[lk]; ok {
		o := &r.res.Options[i]
		if kw.Multi {
			if (kw.Name == "IdentityFile" || kw.Name == "CertificateFile") && contains(o.Values, value) {
				// ssh ignores repeated identity/certificate files
				o.Ignored = append(o.Ignored, IgnoredValue{Value: value, Source: src})
				return
			}
			o.Values = append(o.Values, value)
			o.Sources = append(o.Sources, src)
		} else {
			o.Ignored = append(o.Ignored, IgnoredValue{Value: value, Source: src})
		}
		return
	}
	r.index[lk] = len(r.res.Options)
	r.res.Options = append(r.res.Options, ResolvedOption{
		Key: key, Values: []string{value}, Sources: []Source{src}, Multi: kw.Multi,
	})
}

func expandHostname(v, host string) string {
	if !strings.Contains(v, "%") {
		return v
	}
	var b strings.Builder
	for i := 0; i < len(v); i++ {
		if v[i] == '%' && i+1 < len(v) {
			switch v[i+1] {
			case 'h':
				b.WriteString(host)
				i++
				continue
			case '%':
				b.WriteByte('%')
				i++
				continue
			}
		}
		b.WriteByte(v[i])
	}
	return b.String()
}

func (r *resolver) value(key string) (string, bool) {
	if i, ok := r.index[strings.ToLower(key)]; ok {
		return r.res.Options[i].Values[0], true
	}
	return "", false
}

// evalMatch evaluates Match criteria. Criteria that cannot be evaluated
// offline (exec, localnetwork, ...) are treated as not matching.
func (r *resolver) evalMatch(criteria string) (bool, []Note, []ExecCheck) {
	args := splitArgs(criteria)
	result := true
	var notes []Note
	var execs []ExecCheck
	targetHost := r.host
	if h, ok := r.value("Hostname"); ok {
		targetHost = h
	}
	targetUser := r.opts.User
	if targetUser == "" {
		if u, ok := r.value("User"); ok {
			targetUser = u
		} else {
			targetUser = r.opts.LocalUser
		}
	}
	for i := 0; i < len(args); i++ {
		attr := strings.ToLower(args[i])
		negate := strings.HasPrefix(attr, "!")
		attr = strings.TrimPrefix(attr, "!")
		var ok bool
		needArg := func() string {
			if i+1 < len(args) {
				i++
				return args[i]
			}
			return ""
		}
		switch attr {
		case "all":
			ok = true
		case "final":
			ok = true
			notes = append(notes, Note{Code: NoteMatchFinal})
		case "canonical":
			ok = false
			notes = append(notes, Note{Code: NoteMatchCanonical})
		case "host":
			ok = matchList(targetHost, needArg(), true)
		case "originalhost":
			ok = matchList(r.host, needArg(), true)
		case "user":
			ok = matchList(targetUser, needArg(), false)
		case "localuser":
			ok = matchList(r.opts.LocalUser, needArg(), false)
		case "tagged":
			tag, _ := r.value("Tag")
			ok = matchList(tag, needArg(), false)
		case "exec":
			// never run here: use the assumption for the expanded command
			cmd := needArg()
			if !result {
				// like ssh: exec is skipped once an earlier criterion failed
				continue
			}
			check := ExecCheck{Command: cmd, Expanded: ExpandTokens("exec", cmd, r.tokenContext()), Negated: negate}
			check.Result, check.Assumed = r.opts.Exec[check.Expanded]
			if !check.Assumed {
				notes = append(notes, Note{Code: NoteMatchExec, Params: map[string]string{"command": check.Expanded}})
			}
			execs = append(execs, check)
			ok = check.Result
		case "localnetwork", "version", "sessiontype", "command":
			arg := needArg()
			notes = append(notes, Note{Code: NoteMatchOffline, Params: map[string]string{"attr": attr, "arg": arg}})
			r.note(NoteMatchSkipped, nil)
			result = false
			continue
		default:
			notes = append(notes, Note{Code: NoteMatchUnknown, Params: map[string]string{"attr": attr}})
			result = false
			continue
		}
		if negate {
			ok = !ok
		}
		if !ok {
			result = false
		}
	}
	return result, notes, execs
}

func (r *resolver) include(value string) {
	if r.opts.SkipIncludes {
		return
	}
	if r.depth >= 16 {
		r.note(NoteIncludeTooDeep, nil)
		return
	}
	for _, pattern := range splitArgs(value) {
		matches := includeMatches(pattern, r.home, r.opts.IncludeDir)
		if len(matches) == 0 {
			if !HasWildcard(pattern) {
				r.note(NoteIncludeNotFound, map[string]string{"pattern": pattern})
			}
			continue
		}
		for _, m := range matches {
			data, err := os.ReadFile(m)
			if err != nil {
				r.note(NoteIncludeReadError, map[string]string{"file": m, "error": err.Error()})
				continue
			}
			r.depth++
			r.evaluate(Parse(string(data)), m, true)
			r.depth--
		}
	}
}

func contains(list []string, v string) bool {
	for _, x := range list {
		if x == v {
			return true
		}
	}
	return false
}

// EffectiveHostnames returns the effective Hostname of every Host block,
// evaluated for the block's first literal alias (blocks without one are
// left out). It lets the UI sort blocks such as "Host github-work" by the
// Hostname they inherit from a shared block.
func EffectiveHostnames(cfg *Config, opts ResolveOptions) map[string]string {
	out := map[string]string{}
	for _, b := range cfg.Blocks {
		if b.Kind != KindHost {
			continue
		}
		for _, p := range b.PatternList() {
			if HasWildcard(p) {
				continue
			}
			res := Resolve(cfg, p, opts)
			if o := findOption(res, "Hostname"); o != nil {
				out[b.ID] = o.Values[0]
			} else {
				out[b.ID] = strings.ToLower(p) // ssh connects to the alias itself
			}
			break
		}
	}
	return out
}

// includeMatches returns the files one Include pattern refers to, sorted like
// ssh reads them: "~/" is the home directory, relative paths are relative to
// dir, and glob patterns are expanded. Directories are skipped.
func includeMatches(pattern, home, dir string) []string {
	p := pattern
	if strings.HasPrefix(p, "~/") {
		p = filepath.Join(home, p[2:])
	} else if !filepath.IsAbs(p) {
		p = filepath.Join(dir, p)
	}
	matches, err := filepath.Glob(p)
	if err != nil {
		return nil
	}
	files := matches[:0]
	for _, m := range matches {
		if fi, err := os.Stat(m); err == nil && fi.Mode().IsRegular() {
			files = append(files, m)
		}
	}
	sort.Strings(files)
	return files
}

// IncludeFiles returns the existing files an Include value refers to (it may
// list several patterns). Relative paths are resolved against
// opts.IncludeDir, like Resolve does.
func IncludeFiles(value string, opts ResolveOptions) []string {
	home, _ := os.UserHomeDir()
	dir := opts.IncludeDir
	if dir == "" {
		dir = filepath.Join(home, ".ssh")
	}
	files := []string{}
	for _, pattern := range splitArgs(value) {
		files = append(files, includeMatches(pattern, home, dir)...)
	}
	return files
}
