package sshconfig

import "strings"

// MatchPattern implements ssh's wildcard matching ('*' and '?').
func MatchPattern(s, pattern string) bool {
	// Iterative matching with backtracking on the last '*'.
	si, pi := 0, 0
	star, mark := -1, 0
	for si < len(s) {
		switch {
		case pi < len(pattern) && (pattern[pi] == '?' || pattern[pi] == s[si]):
			si++
			pi++
		case pi < len(pattern) && pattern[pi] == '*':
			star, mark = pi, si
			pi++
		case star >= 0:
			pi = star + 1
			mark++
			si = mark
		default:
			return false
		}
	}
	for pi < len(pattern) && pattern[pi] == '*' {
		pi++
	}
	return pi == len(pattern)
}

// HostMatches evaluates the patterns of a Host line against a host name
// the way ssh does: at least one positive pattern must match and no negated
// pattern may match. ssh lower-cases the host name before matching.
func HostMatches(patterns []string, host string) bool {
	host = strings.ToLower(host)
	matched := false
	for _, p := range patterns {
		negated := strings.HasPrefix(p, "!")
		p = strings.TrimPrefix(p, "!")
		if MatchPattern(host, p) {
			if negated {
				return false
			}
			matched = true
		}
	}
	return matched
}

// matchList evaluates a comma separated pattern list (as used by Match).
func matchList(s, list string, lower bool) bool {
	if lower {
		s = strings.ToLower(s)
	}
	matched := false
	for _, p := range strings.Split(list, ",") {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		negated := strings.HasPrefix(p, "!")
		p = strings.TrimPrefix(p, "!")
		if lower {
			p = strings.ToLower(p)
		}
		if MatchPattern(s, p) {
			if negated {
				return false
			}
			matched = true
		}
	}
	return matched
}

// HasWildcard reports whether a host pattern contains wildcards or a
// negation, i.e. is not a literal host alias.
func HasWildcard(p string) bool {
	return strings.ContainsAny(p, "*?!")
}
