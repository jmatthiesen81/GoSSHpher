package sshconfig

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func ctx() TokenContext {
	return TokenContext{
		Original: "alias", Host: "real.example.org", Port: "2200", RemoteUser: "bob", LocalUser: "me",
		Home: "/home/me", UID: "1000", LocalHost: "box.lan", ProxyJump: "jump",
	}
}

func TestExpandTokensPerKeyword(t *testing.T) {
	t.Setenv("GOSSHPHER_TEST", "env")
	cases := []struct{ key, in, want string }{
		{"IdentityFile", "~/.ssh/%h-%r-%p-%n-%u-%i-%L-%l-%k-%j-%%", "/home/me/.ssh/real.example.org-bob-2200-alias-me-1000-box-box.lan-alias-jump-%"},
		{"IdentityFile", "%d/k", "/home/me/k"},
		{"IdentityFile", "${GOSSHPHER_TEST}/x", "env/x"},
		{"IdentityFile", "~/x %z", "/home/me/x %z"},                                                       // unknown token stays
		{"RemoteCommand", "echo %h ${GOSSHPHER_TEST} ~/x", "echo real.example.org ${GOSSHPHER_TEST} ~/x"}, // no env, no ~
		{"ProxyCommand", "nc %h %p %d", "nc real.example.org 2200 %d"},                                    // %d not allowed here
		{"ProxyJump", "%r@gw:%p", "bob@gw:2200"},
		{"LocalCommand", "echo %T", "echo NONE"},
		{"Hostname", "%h.%p", "real.example.org.%p"},
		{"User", "%h", "%h"}, // keyword without tokens
		{"exec", "test %n = alias", "test alias = alias"},
	}
	for _, c := range cases {
		if got := ExpandTokens(c.key, c.in, ctx()); got != c.want {
			t.Errorf("%s %q: got %q, want %q", c.key, c.in, got, c.want)
		}
	}
	c := ctx()
	c.HostKeyAlias = "hka"
	if got := ExpandTokens("IdentityFile", "%k", c); got != "hka" {
		t.Errorf("%%k with HostKeyAlias: %q", got)
	}
	if !AcceptsTokens("controlpath") || AcceptsTokens("Port") {
		t.Error("AcceptsTokens")
	}
}

// TestTokensAgainstOpenSSH compares the expansion with ssh -G, which expands
// ControlPath, RemoteCommand and UserKnownHostsFile.
func TestTokensAgainstOpenSSH(t *testing.T) {
	sshBin, err := exec.LookPath("ssh")
	if err != nil {
		t.Skip("ssh not installed")
	}
	const conf = `Host full
  Hostname real.example.org
  User bob
  Port 2200
  HostKeyAlias alias.example
  ProxyJump jump.example
  ControlPath ~/.ssh/cm-%C-%h-%p-%r-%n-%u-%d-%L-%l-%i-%k-%j-%%
  RemoteCommand echo %h %r %p %n %C
  UserKnownHostsFile ~/.ssh/known_%h_%k

Host bare
  ControlPath ~/.ssh/cm-%C-%h-%p-%r-%j
  RemoteCommand echo %r@%h:%p
`
	file := filepath.Join(t.TempDir(), "config")
	if err := os.WriteFile(file, []byte(conf), 0o600); err != nil {
		t.Fatal(err)
	}
	cfg := Parse(conf)
	for _, c := range []struct{ host, user string }{{"full", ""}, {"bare", ""}, {"bare", "other"}} {
		args := []string{"-G", "-F", file}
		if c.user != "" {
			args = append(args, "-l", c.user)
		}
		out, err := exec.Command(sshBin, append(args, c.host)...).Output()
		if err != nil {
			t.Fatalf("ssh -G %s: %v", c.host, err)
		}
		want := map[string]string{}
		for _, line := range strings.Split(string(out), "\n") {
			k, v, _ := strings.Cut(line, " ")
			want[k] = v
		}
		res := Resolve(cfg, c.host, ResolveOptions{SkipIncludes: true, User: c.user})
		for _, key := range []string{"ControlPath", "RemoteCommand", "UserKnownHostsFile"} {
			o := findOption(res, key)
			if o == nil {
				continue
			}
			got := o.Values[0]
			if len(o.Expanded) > 0 && o.Expanded[0] != "" {
				got = o.Expanded[0]
			}
			if got != want[strings.ToLower(key)] {
				t.Errorf("%s -l %q %s:\n ours %q\n ssh  %q", c.host, c.user, key, got, want[strings.ToLower(key)])
			}
		}
	}
}

func TestResolveExpanded(t *testing.T) {
	cfg := Parse("Host a\n  Hostname h.example\n  IdentityFile ~/.ssh/%h\n  IdentityFile ~/.ssh/plain\n  User u\n")
	res := Resolve(cfg, "a", ResolveOptions{SkipIncludes: true})
	o := findOption(res, "IdentityFile")
	home, _ := os.UserHomeDir()
	if len(o.Expanded) != 2 || o.Expanded[0] != filepath.Join(home, ".ssh/h.example") || o.Expanded[1] != filepath.Join(home, ".ssh/plain") {
		t.Errorf("expanded: %q", o.Expanded)
	}
	if u := findOption(res, "User"); u.Expanded != nil {
		t.Errorf("User has no tokens: %q", u.Expanded)
	}
}

func TestMatchExec(t *testing.T) {
	cfg := Parse(`Host srv
  Hostname srv.example

Match originalhost srv exec "nc -z %h 22"
  Port 1

Match originalhost srv !exec "on-vpn"
  ProxyJump bastion
`)
	port := func(r *Resolution) string {
		if o := findOption(r, "Port"); o != nil {
			return o.Values[0]
		}
		return ""
	}
	jump := func(r *Resolution) string {
		if o := findOption(r, "ProxyJump"); o != nil {
			return o.Values[0]
		}
		return ""
	}

	// default: commands count as failing, "!exec" therefore matches
	r := Resolve(cfg, "srv", ResolveOptions{SkipIncludes: true})
	if port(r) != "" || jump(r) != "bastion" {
		t.Errorf("default: port %q jump %q", port(r), jump(r))
	}
	var checks []ExecCheck
	for _, b := range r.Blocks {
		checks = append(checks, b.Execs...)
	}
	if len(checks) != 2 || checks[0].Expanded != "nc -z srv.example 22" || checks[0].Assumed || !checks[1].Negated {
		t.Errorf("checks: %+v", checks)
	}
	noted := false
	for _, b := range r.Blocks {
		for _, n := range b.Notes {
			if n.Code == NoteMatchExec {
				noted = true
			}
		}
	}
	if !noted {
		t.Error("missing note for unassumed exec")
	}

	// assumptions use the expanded command as key
	r = Resolve(cfg, "srv", ResolveOptions{SkipIncludes: true, Exec: map[string]bool{"nc -z srv.example 22": true, "on-vpn": true}})
	if port(r) != "1" || jump(r) != "" {
		t.Errorf("assumed: port %q jump %q", port(r), jump(r))
	}
	for _, b := range r.Blocks {
		for _, e := range b.Execs {
			if !e.Assumed || !e.Result {
				t.Errorf("check not marked assumed: %+v", e)
			}
		}
	}
}

// TestMatchExecAgainstOpenSSH lets ssh run real commands and compares with
// the resolver given the same results as assumptions.
func TestMatchExecAgainstOpenSSH(t *testing.T) {
	sshBin, err := exec.LookPath("ssh")
	if err != nil {
		t.Skip("ssh not installed")
	}
	const conf = `Match originalhost a exec "exit 0"
  Port 1001
Match originalhost a !exec "exit 1"
  User negated
Match originalhost b exec "exit 1"
  Port 1002
`
	file := filepath.Join(t.TempDir(), "config")
	if err := os.WriteFile(file, []byte(conf), 0o600); err != nil {
		t.Fatal(err)
	}
	assume := map[string]bool{"exit 0": true, "exit 1": false}
	cfg := Parse(conf)
	for _, host := range []string{"a", "b"} {
		out, err := exec.Command(sshBin, "-G", "-F", file, host).Output()
		if err != nil {
			t.Fatal(err)
		}
		want := map[string]string{}
		for _, line := range strings.Split(string(out), "\n") {
			k, v, _ := strings.Cut(line, " ")
			want[k] = v
		}
		res := Resolve(cfg, host, ResolveOptions{SkipIncludes: true, Exec: assume})
		for _, key := range []string{"Port", "User"} {
			if o := findOption(res, key); o != nil && o.Values[0] != want[strings.ToLower(key)] {
				t.Errorf("%s %s: ours %q, ssh %q", host, key, o.Values[0], want[strings.ToLower(key)])
			}
		}
	}
}

func TestIncludeFiles(t *testing.T) {
	dir := t.TempDir()
	home := t.TempDir()
	t.Setenv("HOME", home)
	for _, f := range []string{"b.conf", "a.conf", "skip.txt", filepath.Join("sub", "c.conf")} {
		p := filepath.Join(dir, f)
		if err := os.MkdirAll(filepath.Dir(p), 0o700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, []byte("Host "+f+"\n  User inc\n"), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.WriteFile(filepath.Join(home, "h.conf"), nil, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(filepath.Join(dir, "dir.conf"), 0o700); err != nil {
		t.Fatal(err)
	}
	got := IncludeFiles("*.conf sub/*.conf ~/h.conf missing.conf", ResolveOptions{IncludeDir: dir})
	want := []string{filepath.Join(dir, "a.conf"), filepath.Join(dir, "b.conf"), filepath.Join(dir, "sub", "c.conf"), filepath.Join(home, "h.conf")}
	if strings.Join(got, "|") != strings.Join(want, "|") {
		t.Errorf("IncludeFiles:\n got %q\nwant %q", got, want)
	}

	// values from included files carry their file as source
	cfg := Parse("Include *.conf\n\nHost a.conf\n  User main\n")
	res := Resolve(cfg, "a.conf", ResolveOptions{IncludeDir: dir})
	o := findOption(res, "User")
	if o == nil || o.Values[0] != "inc" || o.Sources[0].File != filepath.Join(dir, "a.conf") {
		t.Errorf("included value: %+v", o)
	}
	if len(o.Ignored) != 1 || o.Ignored[0].Value != "main" {
		t.Errorf("main value should lose against the earlier include: %+v", o.Ignored)
	}
}

func TestKeyFileCheckWithTokens(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	if err := os.MkdirAll(filepath.Join(home, ".ssh"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(home, ".ssh", "one.example"), nil, 0o600); err != nil {
		t.Fatal(err)
	}
	cfg := Parse("Host one two\n  Hostname %h.example\n  IdentityFile ~/.ssh/%h\n\nHost *\n  IdentityFile ~/.ssh/%h.global\n")
	var missing []string
	for _, i := range Analyze(cfg, ResolveOptions{SkipIncludes: true}) {
		if i.Code == IssueFileNotFound {
			missing = append(missing, i.Params["path"])
		}
	}
	// only two.example is missing; the token value in "Host *" is not checked
	if len(missing) != 1 || missing[0] != filepath.Join(home, ".ssh", "two.example") {
		t.Errorf("missing: %q", missing)
	}
}

func TestMatchExecSkippedAfterFailedCriterion(t *testing.T) {
	cfg := Parse("Match originalhost srv exec \"x\"\n  Port 1\n")
	for _, b := range Resolve(cfg, "other", ResolveOptions{SkipIncludes: true}).Blocks {
		if len(b.Execs) != 0 {
			t.Errorf("exec must not be considered when originalhost fails: %+v", b.Execs)
		}
	}
}
