package sshconfig

import (
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"gosshpher/internal/i18n"
)

const sample = `# global defaults
Host *
  IdentitiesOnly yes
  AddKeysToAgent yes

Host github.com github-work github-private
  Hostname ssh.github.com
  Port 443
  User git

Host github-work
  IdentityFile ~/.ssh/work/ed25519

# private account
Host github-private
  IdentityFile ~/.ssh/private/ed25519

Host gitlab.com
  Hostname gitlab.com
  IdentityFile ~/.ssh/private/ed25519

Host gitlab.com
	Hostname=gitlab.com
	IdentityFile ~/.ssh/work/ed25519   

Host *.example.com !secret.example.com
  User=bob
  Port 2222
Match host secret.example.com user root
  Port 1
`

func TestRoundTrip(t *testing.T) {
	inputs := map[string]string{
		"sample":          sample,
		"empty":           "",
		"newline":         "\n",
		"no final nl":     "Host a\n  User b",
		"crlf":            "Host a\r\n  User b\r\n",
		"global + blanks": "User x\n\n\n# c\nHost y\n\n",
	}
	for _, f := range []string{"config.example", "config.template"} {
		if data, err := os.ReadFile("../../" + f); err == nil {
			inputs[f] = string(data)
		}
	}
	for name, in := range inputs {
		t.Run(name, func(t *testing.T) {
			if got := Parse(in).String(); got != in {
				t.Errorf("round trip changed text:\n--- want\n%q\n--- got\n%q", in, got)
			}
		})
	}
}

func TestStructure(t *testing.T) {
	cfg := Parse(sample)
	if cfg.Blocks[0].Kind != KindGlobal || len(cfg.Blocks[0].Entries) != 0 {
		t.Fatalf("global block should be empty, got %+v", cfg.Blocks[0])
	}
	star := cfg.Blocks[1]
	if star.Patterns != "*" || len(star.Leading) != 1 || star.Leading[0].Text != "# global defaults" {
		t.Errorf("leading comment not attached to Host *: %+v", star)
	}
	multi := cfg.Blocks[2]
	if got := multi.PatternList(); !reflect.DeepEqual(got, []string{"github.com", "github-work", "github-private"}) {
		t.Errorf("patterns: %v", got)
	}
	private := cfg.Blocks[4]
	if private.Patterns != "github-private" || len(private.Leading) != 2 {
		t.Errorf("github-private block leading lines: %+v", private.Leading)
	}
	last := cfg.Blocks[len(cfg.Blocks)-1]
	if last.Kind != KindMatch || last.Patterns != "host secret.example.com user root" {
		t.Errorf("match block: %+v", last)
	}
}

func TestEditKeepsUnchangedLines(t *testing.T) {
	cfg := Parse(sample)
	// change one value in the tab indented block
	gl := &cfg.Blocks[6]
	gl.Entries[1].Value = "~/.ssh/other"
	// add an option
	gl.Entries = append(gl.Entries, Entry{Type: EntryOption, Key: "User", Value: "git"})
	// move github-private before github-work
	cfg.Blocks[3], cfg.Blocks[4] = cfg.Blocks[4], cfg.Blocks[3]

	out := cfg.String()
	for _, want := range []string{
		"\tHostname=gitlab.com\n\tIdentityFile ~/.ssh/other\n\tUser git\n",
		"\n# private account\nHost github-private\n  IdentityFile ~/.ssh/private/ed25519\n\nHost github-work\n",
	} {
		if !strings.Contains(out, want) {
			t.Errorf("output misses %q:\n%s", want, out)
		}
	}
}

func TestMatchPattern(t *testing.T) {
	cases := []struct {
		s, p string
		want bool
	}{
		{"foo.example.com", "*.example.com", true},
		{"example.com", "*.example.com", false},
		{"a1", "a?", true},
		{"a12", "a?", false},
		{"anything", "*", true},
		{"", "*", true},
		{"abc", "a*b*c", true},
		{"abbbc", "a*bc", true},
		{"abd", "a*c", false},
	}
	for _, c := range cases {
		if got := MatchPattern(c.s, c.p); got != c.want {
			t.Errorf("MatchPattern(%q,%q)=%v", c.s, c.p, got)
		}
	}
	if HostMatches([]string{"*.example.com", "!secret.example.com"}, "secret.example.com") {
		t.Error("negation ignored")
	}
	if !HostMatches([]string{"*.example.com", "!secret.example.com"}, "WWW.example.com") {
		t.Error("host should be lower-cased")
	}
}

func valuesOf(res *Resolution) map[string][]string {
	m := map[string][]string{}
	for _, o := range res.Options {
		m[strings.ToLower(o.Key)] = o.Values
	}
	return m
}

func TestResolve(t *testing.T) {
	cfg := Parse(sample)
	opts := ResolveOptions{SkipIncludes: true, LocalUser: "me"}

	private := valuesOf(Resolve(cfg, "github-private", opts))
	want := map[string][]string{
		"identitiesonly": {"yes"},
		"addkeystoagent": {"yes"},
		"hostname":       {"ssh.github.com"},
		"port":           {"443"},
		"user":           {"git"},
		"identityfile":   {"~/.ssh/private/ed25519"},
	}
	if !reflect.DeepEqual(private, want) {
		t.Errorf("github-private:\n got %v\nwant %v", private, want)
	}

	gl := valuesOf(Resolve(cfg, "gitlab.com", opts))
	if !reflect.DeepEqual(gl["identityfile"], []string{"~/.ssh/private/ed25519", "~/.ssh/work/ed25519"}) {
		t.Errorf("IdentityFile should accumulate: %v", gl["identityfile"])
	}

	if v := valuesOf(Resolve(cfg, "secret.example.com", opts)); v["user"] != nil {
		t.Errorf("negated pattern must not match: %v", v)
	}
	rootRes := valuesOf(Resolve(cfg, "secret.example.com", ResolveOptions{SkipIncludes: true, User: "root"}))
	if !reflect.DeepEqual(rootRes["port"], []string{"1"}) {
		t.Errorf("Match host/user: %v", rootRes)
	}
}

func TestAnalyzeShadowing(t *testing.T) {
	cfg := Parse(`Host *
  User default

Host a.example
  User alice
  Port 22
  Port 23
  Foo bar

Host b.example
  RemoteCommand exec $SHELL
`)
	issues := Analyze(cfg, ResolveOptions{SkipIncludes: true})
	find := func(code string) *Issue {
		for i := range issues {
			if issues[i].Code == code {
				return &issues[i]
			}
		}
		t.Errorf("missing issue %q in %+v", code, issues)
		return nil
	}
	if sh := find(IssueShadowed); sh != nil {
		if sh.Params["key"] != "User" || sh.Params["value"] != "alice" || sh.Params["hint"] != "wildcard" ||
			len(sh.Items) != 1 || sh.Items[0]["host"] != "a.example" || sh.Items[0]["value"] != "default" {
			t.Errorf("shadowed issue: %+v", sh)
		}
	}
	if d := find(IssueOptionDuplicate); d != nil && (d.Params["key"] != "Port" || d.Params["line"] != "2") {
		t.Errorf("duplicate issue: %+v", d)
	}
	if u := find(IssueOptionUnknown); u != nil && u.Params["key"] != "Foo" {
		t.Errorf("unknown issue: %+v", u)
	}
	find(IssueRemoteCommandTTY)
}

// TestAgainstOpenSSH compares the resolver with `ssh -G` for every literal
// alias of the sample and of config.template (if present).
func TestAgainstOpenSSH(t *testing.T) {
	sshBin, err := exec.LookPath("ssh")
	if err != nil {
		t.Skip("ssh not installed")
	}
	inputs := map[string]string{"sample": sample}
	for _, f := range []string{"config.example", "config.template"} {
		if data, err := os.ReadFile("../../" + f); err == nil {
			inputs[f] = string(data)
		}
	}
	keys := []string{"hostname", "port", "user", "identityfile", "remotecommand", "requesttty", "identitiesonly"}
	home, _ := os.UserHomeDir()
	for name, text := range inputs {
		file := filepath.Join(t.TempDir(), "config")
		if err := os.WriteFile(file, []byte(text), 0o600); err != nil {
			t.Fatal(err)
		}
		cfg := Parse(text)
		hosts := map[string]bool{}
		for _, b := range cfg.Blocks {
			for _, p := range b.PatternList() {
				if b.Kind == KindHost && !HasWildcard(p) {
					hosts[p] = true
				}
			}
		}
		for host := range hosts {
			out, err := exec.Command(sshBin, "-G", "-F", file, host).Output()
			if err != nil {
				t.Errorf("%s: ssh -G %s: %v", name, host, err)
				continue
			}
			sshVals := map[string][]string{}
			for _, line := range strings.Split(string(out), "\n") {
				k, v, _ := strings.Cut(line, " ")
				sshVals[k] = append(sshVals[k], v)
			}
			ours := valuesOf(Resolve(cfg, host, ResolveOptions{SkipIncludes: true}))
			for _, k := range keys {
				want, ok := ours[k]
				if !ok {
					continue // default value in ssh -G, nothing configured
				}
				got := sshVals[k]
				norm := make([]string, len(want))
				for i, v := range want {
					v = strings.Join(splitArgs(v), " ")
					if k == "identityfile" {
						v = strings.Replace(v, "~", home, 1)
					}
					if k == "hostname" {
						v = strings.ToLower(v)
					}
					if k == "requesttty" && v == "yes" {
						v = "true"
					}
					norm[i] = v
				}
				if k == "identityfile" {
					for i := range got {
						got[i] = strings.Replace(got[i], "~", home, 1)
					}
				}
				if !reflect.DeepEqual(norm, got) {
					t.Errorf("%s / %s / %s: ours %v, ssh -G %v", name, host, k, norm, got)
				}
			}
		}
	}
}

const grouped = `Host *
  IdentitiesOnly yes

# [GitHub] start
# work and private account
Host github.com github-work github-private
  Hostname ssh.github.com
  Port 443

Host github-work
  IdentityFile ~/.ssh/work/ed25519
# [GitHub] end

Host other
  User x

#[GitLab]   START
Host gitlab.com
  IdentityFile ~/.ssh/a
# [gitlab] end
`

func TestGroupsRoundTrip(t *testing.T) {
	if got := Parse(grouped).String(); got != grouped {
		t.Errorf("round trip changed text:\n%s", got)
	}
	cfg := Parse(grouped)
	var groups []string
	for _, b := range cfg.Blocks[1:] {
		groups = append(groups, b.Group)
	}
	if want := []string{"", "GitHub", "GitHub", "", "GitLab"}; !reflect.DeepEqual(groups, want) {
		t.Errorf("groups %q, want %q", groups, want)
	}
	for _, b := range cfg.Blocks {
		for _, e := range append(append([]Entry{}, b.Leading...), b.Entries...) {
			if _, _, ok := ParseGroupMarker(e.Text); ok {
				t.Errorf("marker left in comments: %q", e.Text)
			}
		}
	}
	if c := cfg.Blocks[2].Leading; len(c) != 2 || c[1].Text != "# work and private account" {
		t.Errorf("comment below start marker lost: %+v", c)
	}
}

func TestGroupsEdit(t *testing.T) {
	cfg := Parse(grouped)
	// put "other" into the GitHub group, rename GitLab
	cfg.Blocks[4].Group = "GitHub"
	cfg.Blocks[5].Group = "Code"
	out := cfg.String()
	want := `Host *
  IdentitiesOnly yes

# [GitHub] start
# work and private account
Host github.com github-work github-private
  Hostname ssh.github.com
  Port 443

Host github-work
  IdentityFile ~/.ssh/work/ed25519

Host other
  User x
# [GitHub] end

# [Code] start
Host gitlab.com
  IdentityFile ~/.ssh/a
# [Code] end
`
	if out != want {
		t.Errorf("got:\n%s\nwant:\n%s", out, want)
	}

	// new group on a block without leading lines
	cfg = Parse("Host a\n  User b\n\nHost c\n  User d\n")
	cfg.Blocks[2].Group = "Neu"
	if got, want := cfg.String(), "Host a\n  User b\n\n# [Neu] start\nHost c\n  User d\n# [Neu] end\n"; got != want {
		t.Errorf("got %q want %q", got, want)
	}
}

func TestGroupsDuplicateAndBroken(t *testing.T) {
	text := "# [A] start\nHost a\n  User x\n# [A] end\n\n# [B] end\nHost b\n  User y\n\n# [a] start\nHost c\n  User z\n"
	cfg := Parse(text)
	if cfg.Blocks[2].Group != "" {
		t.Errorf("end marker without start must not create a group")
	}
	found := false
	for _, b := range cfg.Blocks[2].Leading {
		if b.Text == "# [B] end" {
			found = true
		}
	}
	if !found {
		t.Error("unmatched end marker must stay a comment")
	}
	if cfg.Blocks[3].Group != "a" {
		t.Errorf("unclosed group at EOF: %q", cfg.Blocks[3].Group)
	}
	issues := Analyze(cfg, ResolveOptions{SkipIncludes: true})
	dup := false
	for _, i := range issues {
		if i.Code == IssueGroupDuplicate && i.Params["group"] == "a" {
			dup = true
		}
	}
	if !dup {
		t.Error("duplicate group name not reported")
	}
	// unclosed group gets its end marker on write
	if !strings.HasSuffix(cfg.String(), "  User z\n# [a] end\n") {
		t.Errorf("missing end marker:\n%s", cfg.String())
	}
}

func TestGroupsHandFormatted(t *testing.T) {
	for _, in := range []string{
		"# [A] start\nHost a\n  User x\n\n# note\n# [A] end\n\nHost b\n",
		"Host x\n\n# [A] start\n\nHost a\n  User x\n\n# [A] end\n\n",
		"# [A] start\nHost a\n  User x\n# [A] end\n# trailing\n",
	} {
		if got := Parse(in).String(); got != in {
			t.Errorf("round trip:\n%q\n%q", in, got)
		}
	}
	// adding an option keeps the end marker behind it
	cfg := Parse("# [A] start\nHost a\n  User x\n# [A] end\n# trailing\n")
	b := &cfg.Blocks[1]
	b.Entries = append([]Entry{b.Entries[0], {Type: EntryOption, Key: "Port", Value: "2"}}, b.Entries[1:]...)
	if got, want := cfg.String(), "# [A] start\nHost a\n  User x\n  Port 2\n# [A] end\n# trailing\n"; got != want {
		t.Errorf("got %q want %q", got, want)
	}
}

func TestDiffEffective(t *testing.T) {
	before := Parse("Host a\n  User one\n\nHost a b\n  User two\n  Port 2\n")
	after := Parse("Host a b\n  User two\n  Port 2\n\nHost a\n  User one\n")
	changes := DiffEffective(before, after, ResolveOptions{SkipIncludes: true})
	if len(changes) != 1 || changes[0] != (EffectChange{Host: "a", Key: "User", Before: "one", After: "two"}) {
		t.Errorf("changes: %+v", changes)
	}
	if c := DiffEffective(before, Parse(before.String()), ResolveOptions{SkipIncludes: true}); len(c) != 0 {
		t.Errorf("identical configs differ: %+v", c)
	}
}

// TestCodesTranslated makes sure every issue and note code, group error and
// keyword has a text in the translation catalogs.
func TestCodesTranslated(t *testing.T) {
	cat := i18n.Catalog(i18n.Fallback)
	var keys []string
	for _, c := range []string{IssueGroupInvalid, IssueGroupDuplicate, IssueHostNoPatterns, IssuePatternUppercase,
		IssueOnlyNegated, IssueSamePatterns, IssueMatchNoCriteria, IssueBlockEmpty, IssueOptionHostMatch,
		IssueOptionUnknown, IssueOptionNoValue, IssueOptionDuplicate, IssueFileNotFound, IssueShadowed,
		IssueRemoteCommandTTY} {
		keys = append(keys, "issue."+c)
	}
	keys = append(keys, "issue.shadowed.item", "issue.shadowed.itemFile", "issue.shadowed.hint.order", "issue.shadowed.hint.wildcard")
	for _, c := range []string{NoteMatchFinal, NoteMatchCanonical, NoteMatchOffline, NoteMatchUnknown, NoteMatchSkipped,
		NoteIncludeTooDeep, NoteIncludeNotFound, NoteIncludeReadError} {
		keys = append(keys, "note."+c)
	}
	keys = append(keys, GroupErrEmpty, GroupErrBrackets, GroupErrTooLong)
	for _, k := range Keywords() {
		keys = append(keys, "kw."+k.Name)
	}
	for _, k := range keys {
		if cat[k] == "" {
			t.Errorf("no text for %q", k)
		}
	}
}

func TestDetachComments(t *testing.T) {
	cases := map[string]string{
		"file header":        "# header\n#\n# more\n\n# about a\nHost a\n  User x\n",
		"trailing note":      "Host x\n  User a\n# note to x\n\n# about y\nHost y\n  User b\n",
		"blank only":         "Host x\n  User a\n\n\nHost y\n",
		"comment then blank": "Host x\n  User a\n# note\n\nHost y\n",
		"marker detached":    "# head\n\n# [A] start\n# about a\nHost a\n  User x\n# [A] end\n\n# section\n\nHost b\n",
		"marker blank":       "Host x\n\n# [A] start\n\nHost a\n  User x\n\n# [A] end\n\n",
		"comment above mark": "# [A] start\n# section\n\nHost a\n  User x\n# [A] end\n",
	}
	for name, in := range cases {
		if got := Parse(in).String(); got != in {
			t.Errorf("%s: round trip:\n%q\n%q", name, in, got)
		}
	}

	cfg := Parse(cases["file header"])
	if len(cfg.Blocks[0].Entries) != 3 || cfg.Blocks[0].Entries[0].Text != "# header" {
		t.Errorf("file header should stay in the preamble: %+v", cfg.Blocks[0].Entries)
	}
	if l := cfg.Blocks[1].Leading; len(l) != 2 || l[0].Type != EntryBlank || l[1].Text != "# about a" {
		t.Errorf("block comment: %+v", l)
	}

	cfg = Parse(cases["trailing note"])
	if e := cfg.Blocks[1].Entries; e[len(e)-1].Text != "# note to x" {
		t.Errorf("note should stay with x: %+v", e)
	}

	cfg = Parse(cases["marker detached"])
	if cfg.Blocks[1].Group != "A" || cfg.Blocks[2].Group != "" {
		t.Errorf("groups: %q %q", cfg.Blocks[1].Group, cfg.Blocks[2].Group)
	}
	// moving the group block behind b keeps "# section" with the group block
	cfg.Blocks[1], cfg.Blocks[2] = cfg.Blocks[2], cfg.Blocks[1]
	out := cfg.String()
	if !strings.Contains(out, "  User x\n# [A] end\n\n# section\n") {
		t.Errorf("moved block lost its trailing comment:\n%s", out)
	}

	// config.example: the file header is not the comment of the first host
	if data, err := os.ReadFile("../../config.example"); err == nil {
		cfg := Parse(string(data))
		for _, e := range cfg.Blocks[1].Leading {
			if strings.Contains(e.Text, "sample configuration") {
				t.Error("config.example header attached to the first block")
			}
		}
	}
}

func TestEffectiveHostnames(t *testing.T) {
	cfg := Parse(sample)
	hn := EffectiveHostnames(cfg, ResolveOptions{SkipIncludes: true})
	byPattern := map[string]string{}
	for _, b := range cfg.Blocks {
		if v, ok := hn[b.ID]; ok {
			byPattern[b.Patterns] = v
		}
	}
	want := map[string]string{
		"github.com github-work github-private": "ssh.github.com",
		"github-work":                           "ssh.github.com", // inherited
		"github-private":                        "ssh.github.com",
		"gitlab.com":                            "gitlab.com",
	}
	for p, w := range want {
		if byPattern[p] != w {
			t.Errorf("%s: %q, want %q", p, byPattern[p], w)
		}
	}
	if _, ok := byPattern["*"]; ok {
		t.Error("wildcard-only blocks have no effective hostname")
	}
}

// TestConfigExample checks the features config.example demonstrates.
func TestConfigExample(t *testing.T) {
	data, err := os.ReadFile("../../config.example")
	if err != nil {
		t.Skip("config.example not found")
	}
	root, _ := filepath.Abs("../..")
	cfg := Parse(string(data))
	opts := ResolveOptions{IncludeDir: root}

	// round trip of both files
	inc, err := os.ReadFile(filepath.Join(root, "config.example.d", "team.conf"))
	if err != nil {
		t.Fatal(err)
	}
	if Parse(string(inc)).String() != string(inc) {
		t.Error("team.conf does not round-trip")
	}

	// Include: the team file is found and its hosts resolve with their source
	files := IncludeFiles("config.example.d/*.conf", opts)
	if len(files) != 1 || filepath.Base(files[0]) != "team.conf" {
		t.Fatalf("include files: %q", files)
	}
	ci := Resolve(cfg, "ci-runner", opts)
	user := findOption(ci, "User")
	if user == nil || user.Values[0] != "ci" || filepath.Base(user.Sources[0].File) != "team.conf" {
		t.Errorf("ci-runner User from include: %+v", user)
	}
	// tokens: IdentityFile ~/.ssh/work/%h and ControlPath ~/.ssh/sockets/%r@%h-%p
	home, _ := os.UserHomeDir()
	if id := findOption(ci, "IdentityFile"); id == nil || id.Expanded[0] != filepath.Join(home, ".ssh/work/ci.example.net") {
		t.Errorf("IdentityFile expansion: %+v", id)
	}
	if cp := findOption(ci, "ControlPath"); cp == nil || cp.Expanded[0] != filepath.Join(home, ".ssh/sockets/ci@ci.example.net-22") {
		t.Errorf("ControlPath expansion: %+v", cp)
	}

	// Match exec: by default the command counts as failing, so "!exec" adds
	// the bastion; assuming success (inside the office network) removes it
	jump := func(r *Resolution) string {
		if o := findOption(r, "ProxyJump"); o != nil {
			return o.Values[0]
		}
		return ""
	}
	db := Resolve(cfg, "db01", opts)
	if jump(db) != "bastion" {
		t.Errorf("db01 outside: ProxyJump %q", jump(db))
	}
	cmd := "nc -z -w 1 db01.internal.example.org 22"
	var found bool
	for _, b := range db.Blocks {
		for _, e := range b.Execs {
			found = found || (e.Expanded == cmd && e.Negated)
		}
	}
	if !found {
		t.Errorf("exec check for %q not reported", cmd)
	}
	opts.Exec = map[string]bool{cmd: true}
	if j := jump(Resolve(cfg, "db01", opts)); j != "" {
		t.Errorf("db01 inside: ProxyJump %q", j)
	}
	// hosts outside the Match never get the bastion
	if j := jump(Resolve(cfg, "github-work", opts)); j != "" {
		t.Errorf("github-work: ProxyJump %q", j)
	}
}
