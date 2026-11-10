package sshconfig

import (
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
)

// Severity of an Issue.
const (
	SeverityError   = "error"
	SeverityWarning = "warning"
	SeverityInfo    = "info"
)

// Issue is a finding of Analyze. Entry is the index into Block.Entries, or
// -1 when the issue concerns the block header.
//
// Issues are language-neutral: Code selects the text ("issue.<code>" in the
// translation catalogs), Params fill its placeholders, and Items is a list
// for codes that report several hosts ("issue.<code>.item" per entry).
type Issue struct {
	Severity string              `json:"severity"`
	BlockID  string              `json:"blockId"`
	Entry    int                 `json:"entry"`
	Code     string              `json:"code"`
	Params   map[string]string   `json:"params,omitempty"`
	Items    []map[string]string `json:"items,omitempty"`
}

// Issue codes.
const (
	IssueGroupInvalid     = "group.invalid"
	IssueGroupDuplicate   = "group.duplicate"
	IssueHostNoPatterns   = "host.noPatterns"
	IssuePatternUppercase = "pattern.uppercase"
	IssueOnlyNegated      = "host.onlyNegated"
	IssueSamePatterns     = "host.samePatterns"
	IssueMatchNoCriteria  = "match.noCriteria"
	IssueBlockEmpty       = "block.empty"
	IssueOptionHostMatch  = "option.hostMatch"
	IssueOptionUnknown    = "option.unknown"
	IssueOptionNoValue    = "option.noValue"
	IssueOptionDuplicate  = "option.duplicate"
	IssueFileNotFound     = "file.notFound"
	IssueShadowed         = "shadowed"
	IssueRemoteCommandTTY = "remoteCommand.noTTY"
)

// params builds a parameter map from key/value pairs.
func params(kv ...string) map[string]string {
	m := make(map[string]string, len(kv)/2)
	for i := 0; i+1 < len(kv); i += 2 {
		m[kv[i]] = kv[i+1]
	}
	return m
}

// Analyze looks for options that never take effect, unknown keywords and
// other common mistakes.
func Analyze(cfg *Config, opts ResolveOptions) []Issue {
	issues := []Issue{}
	add := func(sev, blockID string, entry int, code string, p map[string]string) {
		issues = append(issues, Issue{Severity: sev, BlockID: blockID, Entry: entry, Code: code, Params: p})
	}

	home, _ := os.UserHomeDir()
	resolutions := map[string]*Resolution{}
	resolve := func(host string) *Resolution {
		if r, ok := resolutions[host]; ok {
			return r
		}
		r := Resolve(cfg, host, opts)
		resolutions[host] = r
		return r
	}

	seenPatterns := map[string]int{}

	// Groups: names must be valid and unique (one contiguous run each).
	seenGroups := map[string]bool{}
	prevGroup := ""
	for bi := 1; bi < len(cfg.Blocks); bi++ {
		b := &cfg.Blocks[bi]
		g := strings.TrimSpace(b.Group)
		if g != "" && !sameGroup(g, prevGroup) {
			if reason := ValidateGroupName(g); reason != "" {
				add(SeverityError, b.ID, -1, IssueGroupInvalid, params("group", g, "reason", reason))
			}
			key := strings.ToLower(g)
			if seenGroups[key] {
				add(SeverityWarning, b.ID, -1, IssueGroupDuplicate, params("group", g))
			}
			seenGroups[key] = true
		}
		prevGroup = g
	}

	for bi := range cfg.Blocks {
		b := &cfg.Blocks[bi]

		// Header checks.
		if b.Kind == KindHost {
			patterns := b.PatternList()
			if len(patterns) == 0 {
				add(SeverityError, b.ID, -1, IssueHostNoPatterns, nil)
			}
			positive := 0
			for _, pat := range patterns {
				if !strings.HasPrefix(pat, "!") {
					positive++
				}
				if pat != strings.ToLower(pat) {
					add(SeverityWarning, b.ID, -1, IssuePatternUppercase, params("pattern", pat))
				}
			}
			if len(patterns) > 0 && positive == 0 {
				add(SeverityWarning, b.ID, -1, IssueOnlyNegated, nil)
			}
			sorted := append([]string{}, patterns...)
			sort.Strings(sorted)
			key := strings.Join(sorted, " ")
			if prev, ok := seenPatterns[key]; ok {
				add(SeverityInfo, b.ID, -1, IssueSamePatterns, params("block", strconv.Itoa(prev)))
			} else {
				seenPatterns[key] = bi
			}
		}
		if b.Kind == KindMatch && strings.TrimSpace(b.Patterns) == "" {
			add(SeverityError, b.ID, -1, IssueMatchNoCriteria, nil)
		}
		if b.Kind != KindGlobal {
			hasOption := false
			for _, e := range b.Entries {
				if e.Type == EntryOption {
					hasOption = true
					break
				}
			}
			if !hasOption {
				add(SeverityInfo, b.ID, -1, IssueBlockEmpty, nil)
			}
		}

		// Entry checks.
		firstInBlock := map[string]int{}
		for ei, e := range b.Entries {
			if e.Type != EntryOption {
				continue
			}
			kw, known := LookupKeyword(e.Key)
			lk := strings.ToLower(canonicalKey(e.Key))
			switch {
			case strings.EqualFold(e.Key, "Host") || strings.EqualFold(e.Key, "Match"):
				// cannot happen after parsing, but may come from the UI
				add(SeverityError, b.ID, ei, IssueOptionHostMatch, params("key", e.Key))
				continue
			case !known:
				add(SeverityWarning, b.ID, ei, IssueOptionUnknown, params("key", e.Key))
			case strings.TrimSpace(e.Value) == "":
				add(SeverityError, b.ID, ei, IssueOptionNoValue, params("key", kw.Name))
			}
			if known && !kw.Multi && !strings.EqualFold(kw.Name, "Include") {
				if first, ok := firstInBlock[lk]; ok {
					add(SeverityWarning, b.ID, ei, IssueOptionDuplicate, params("key", kw.Name, "line", strconv.Itoa(first+1)))
				} else {
					firstInBlock[lk] = ei
				}
			}
			if known && (kw.Name == "IdentityFile" || kw.Name == "CertificateFile") {
				for _, path := range keyFilePaths(b, kw.Name, e.Value, home, resolve) {
					if _, err := os.Stat(path); err != nil {
						add(SeverityWarning, b.ID, ei, IssueFileNotFound, params("path", path))
					}
				}
			}
		}

		// Shadowing: evaluate every literal alias of a Host block and check
		// whether the options of this block actually win.
		if b.Kind != KindHost {
			continue
		}
		shadowed := map[int][]map[string]string{}
		byWildcard := false
		for _, p := range b.PatternList() {
			if HasWildcard(p) || p != strings.ToLower(p) {
				continue
			}
			res := resolve(p)
			if !blockMatched(res, b.ID) {
				continue
			}
			for ei, e := range b.Entries {
				if e.Type != EntryOption || strings.EqualFold(e.Key, "Include") {
					continue
				}
				kw, known := LookupKeyword(e.Key)
				if !known || kw.Multi {
					continue
				}
				opt := findOption(res, kw.Name)
				if opt == nil || opt.Sources[0].BlockID == b.ID {
					continue
				}
				own := strings.TrimSpace(e.Value)
				if kw.Name == "Hostname" {
					own = expandHostname(own, p)
				}
				if strings.EqualFold(own, opt.Values[0]) {
					continue // same value, redundant but harmless
				}
				win := opt.Sources[0]
				if win.File == "" && win.BlockIndex < len(cfg.Blocks) {
					wb := &cfg.Blocks[win.BlockIndex]
					if wb.Kind == KindGlobal || wb.Kind == KindMatch {
						byWildcard = true
					}
					for _, wp := range wb.PatternList() {
						if HasWildcard(wp) {
							byWildcard = true
						}
					}
				}
				shadowed[ei] = append(shadowed[ei], params(
					"host", p,
					"value", opt.Values[0],
					"block", strconv.Itoa(win.BlockIndex),
					"label", win.Label,
					"file", win.File,
				))
			}
			checkRemoteCommand(res, b, p, add)
		}
		hint := "order"
		if byWildcard {
			hint = "wildcard"
		}
		for ei := range b.Entries {
			items, ok := shadowed[ei]
			if !ok {
				continue
			}
			e := b.Entries[ei]
			issues = append(issues, Issue{
				Severity: SeverityWarning, BlockID: b.ID, Entry: ei, Code: IssueShadowed,
				Params: params("key", canonicalKey(e.Key), "value", e.Value, "hint", hint),
				Items:  items,
			})
		}
	}
	return issues
}

func checkRemoteCommand(res *Resolution, b *Block, host string, add func(string, string, int, string, map[string]string)) {
	rc := findOption(res, "RemoteCommand")
	if rc == nil || !strings.Contains(rc.Values[0], "$SHELL") {
		return
	}
	tty := findOption(res, "RequestTTY")
	if tty != nil && (strings.EqualFold(tty.Values[0], "force") || strings.EqualFold(tty.Values[0], "yes")) {
		return
	}
	if rc.Sources[0].BlockID != b.ID {
		return
	}
	add(SeverityInfo, b.ID, -1, IssueRemoteCommandTTY, params("host", host))
}

func blockMatched(res *Resolution, blockID string) bool {
	for _, b := range res.Blocks {
		if b.BlockID == blockID && b.File == "" {
			return b.Matched
		}
	}
	return false
}

func findOption(res *Resolution, key string) *ResolvedOption {
	for i := range res.Options {
		if strings.EqualFold(res.Options[i].Key, key) {
			return &res.Options[i]
		}
	}
	return nil
}

// expandPath expands ~ and %d for existence checks. Paths with other
// tokens are skipped (empty result).
func expandPath(v, home string) string {
	args := splitArgs(v)
	if len(args) == 0 {
		return ""
	}
	p := args[0]
	if strings.EqualFold(p, "none") {
		return ""
	}
	p = strings.ReplaceAll(p, "%d", home)
	if strings.Contains(p, "%") || strings.Contains(p, "${") {
		return ""
	}
	if strings.HasPrefix(p, "~/") {
		p = filepath.Join(home, p[2:])
	} else if !filepath.IsAbs(p) {
		// relative to ssh's working directory, cannot be checked here
		return ""
	}
	return p
}

// keyFilePaths returns the paths to check for an IdentityFile/CertificateFile
// value. Values with %-tokens or ${ENV} depend on the host: they are
// expanded for every literal alias of a Host block the block applies to;
// in other blocks they cannot be checked.
func keyFilePaths(b *Block, keyword, value, home string, resolve func(string) *Resolution) []string {
	args := splitArgs(value)
	if len(args) == 0 || strings.EqualFold(args[0], "none") {
		return nil
	}
	if !strings.Contains(args[0], "%") && !strings.Contains(args[0], "${") {
		if p := expandPath(value, home); p != "" {
			return []string{p}
		}
		return nil
	}
	if b.Kind != KindHost {
		return nil
	}
	seen := map[string]bool{}
	var paths []string
	for _, alias := range b.PatternList() {
		if HasWildcard(alias) || alias != strings.ToLower(alias) {
			continue
		}
		res := resolve(alias)
		if !blockMatched(res, b.ID) {
			continue
		}
		p := ExpandTokens(keyword, args[0], res.tokens)
		if !filepath.IsAbs(p) || seen[p] {
			continue
		}
		seen[p] = true
		paths = append(paths, p)
	}
	return paths
}
