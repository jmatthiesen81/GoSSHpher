package sshconfig

import (
	"crypto/sha1"
	"encoding/hex"
	"os"
	"path/filepath"
	"strings"
)

// TokenContext holds the values ssh substitutes for %-tokens (see TOKENS in
// ssh_config(5)).
type TokenContext struct {
	Original     string // %n original host name (the alias)
	Host         string // %h remote host name (after Hostname)
	Port         string // %p
	RemoteUser   string // %r
	LocalUser    string // %u
	Home         string // %d
	UID          string // %i
	LocalHost    string // %l local host name, %L its first component
	HostKeyAlias string // %k (HostKeyAlias or the original host name)
	ProxyJump    string // %j
}

// Token sets per keyword, from ssh_config(5).
const (
	tokensCommon = "%CdhijkLlnpru"
	tokensProxy  = "%hnpr"
	tokensHost   = "%h"
)

var tokenKeywords = map[string]string{
	"certificatefile":    tokensCommon,
	"controlpath":        tokensCommon,
	"identityagent":      tokensCommon,
	"identityfile":       tokensCommon,
	"knownhostscommand":  tokensCommon,
	"localforward":       tokensCommon,
	"remoteforward":      tokensCommon,
	"remotecommand":      tokensCommon,
	"revokedhostkeys":    tokensCommon,
	"userknownhostsfile": tokensCommon,
	"localcommand":       tokensCommon + "T",
	"proxycommand":       tokensProxy,
	"proxyjump":          tokensProxy,
	"hostname":           tokensHost,
	"exec":               tokensCommon, // Match exec
}

// Keywords whose values may contain ${ENV} references.
var envKeywords = map[string]bool{
	"certificatefile": true, "controlpath": true, "identityagent": true, "identityfile": true,
	"knownhostscommand": true, "userknownhostsfile": true, "localforward": true,
	"remoteforward": true, "revokedhostkeys": true,
}

// Keywords holding paths where ssh expands a leading "~/".
var pathKeywords = map[string]bool{
	"certificatefile": true, "controlpath": true, "identityagent": true, "identityfile": true,
	"revokedhostkeys": true, "userknownhostsfile": true,
}

// AcceptsTokens reports whether ssh expands %-tokens in the keyword.
func AcceptsTokens(keyword string) bool {
	_, ok := tokenKeywords[strings.ToLower(keyword)]
	return ok
}

// ExpandTokens substitutes the %-tokens a keyword accepts, ${ENV} references
// where ssh supports them, and a leading "~/" for path keywords. Tokens the
// keyword does not accept are left unchanged.
func ExpandTokens(keyword, value string, ctx TokenContext) string {
	k := strings.ToLower(keyword)
	allowed, ok := tokenKeywords[k]
	if !ok {
		return value
	}
	var b strings.Builder
	for i := 0; i < len(value); i++ {
		c := value[i]
		if c != '%' || i+1 >= len(value) {
			b.WriteByte(c)
			continue
		}
		t := value[i+1]
		if !strings.ContainsRune(allowed, rune(t)) {
			b.WriteByte(c)
			continue
		}
		i++
		b.WriteString(ctx.token(t))
	}
	out := b.String()
	if envKeywords[k] {
		out = expandEnv(out)
	}
	if pathKeywords[k] && ctx.Home != "" {
		if out == "~" {
			out = ctx.Home
		} else if strings.HasPrefix(out, "~/") {
			out = filepath.Join(ctx.Home, out[2:])
		}
	}
	return out
}

func (c TokenContext) token(t byte) string {
	switch t {
	case '%':
		return "%"
	case 'C':
		sum := sha1.Sum([]byte(c.LocalHost + c.Host + c.Port + c.RemoteUser + c.ProxyJump))
		return hex.EncodeToString(sum[:])
	case 'd':
		return c.Home
	case 'h':
		return c.Host
	case 'i':
		return c.UID
	case 'j':
		return c.ProxyJump
	case 'k':
		if c.HostKeyAlias != "" {
			return c.HostKeyAlias
		}
		return c.Original
	case 'L':
		short, _, _ := strings.Cut(c.LocalHost, ".")
		return short
	case 'l':
		return c.LocalHost
	case 'n':
		return c.Original
	case 'p':
		return c.Port
	case 'r':
		return c.RemoteUser
	case 'T':
		return "NONE"
	case 'u':
		return c.LocalUser
	}
	return ""
}

// expandEnv replaces ${NAME} like ssh does; unset variables become empty.
func expandEnv(s string) string {
	var b strings.Builder
	for {
		i := strings.Index(s, "${")
		if i < 0 {
			b.WriteString(s)
			return b.String()
		}
		j := strings.IndexByte(s[i:], '}')
		if j < 0 {
			b.WriteString(s)
			return b.String()
		}
		b.WriteString(s[:i])
		b.WriteString(os.Getenv(s[i+2 : i+j]))
		s = s[i+j+1:]
	}
}

// tokenContext builds the token values for a resolution: the effective
// Hostname, Port, User, HostKeyAlias and ProxyJump, with ssh's defaults.
func (r *resolver) tokenContext() TokenContext {
	ctx := TokenContext{
		Original:  r.host,
		Host:      r.host,
		Port:      "22",
		LocalUser: r.opts.LocalUser,
		Home:      r.home,
		UID:       localUID(),
		LocalHost: localHostname(),
	}
	if v, ok := r.value("Hostname"); ok {
		ctx.Host = v
	}
	if v, ok := r.value("Port"); ok {
		ctx.Port = v
	}
	ctx.RemoteUser = r.opts.User
	if ctx.RemoteUser == "" {
		if v, ok := r.value("User"); ok {
			ctx.RemoteUser = v
		} else {
			ctx.RemoteUser = r.opts.LocalUser
		}
	}
	if v, ok := r.value("HostKeyAlias"); ok {
		ctx.HostKeyAlias = v
	}
	if v, ok := r.value("ProxyJump"); ok && !strings.EqualFold(v, "none") {
		ctx.ProxyJump = v
	}
	return ctx
}

func localHostname() string {
	h, err := os.Hostname()
	if err != nil {
		return ""
	}
	return h
}
