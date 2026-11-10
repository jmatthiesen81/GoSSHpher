package sshconfig

import (
	"sort"
	"strings"
)

// Keyword describes a ssh_config(5) keyword. Its description is in the
// translation catalogs under "kw.<Name>".
type Keyword struct {
	Name string `json:"name"`
	// Multi is true for keywords where every occurrence adds a value instead
	// of the first one winning (IdentityFile, LocalForward, ...).
	Multi bool `json:"multi,omitempty"`
	// Values lists typical values for the value input.
	Values []string `json:"values,omitempty"`
}

var yesNo = []string{"yes", "no"}

var keywords = []Keyword{
	{Name: "AddKeysToAgent", Values: []string{"yes", "no", "ask", "confirm"}},
	{Name: "AddressFamily", Values: []string{"any", "inet", "inet6"}},
	{Name: "BatchMode", Values: yesNo},
	{Name: "BindAddress"},
	{Name: "BindInterface"},
	{Name: "CanonicalDomains"},
	{Name: "CanonicalizeFallbackLocal", Values: yesNo},
	{Name: "CanonicalizeHostname", Values: []string{"no", "yes", "always", "none"}},
	{Name: "CanonicalizeMaxDots"},
	{Name: "CanonicalizePermittedCNAMEs"},
	{Name: "CASignatureAlgorithms"},
	{Name: "CertificateFile", Multi: true},
	{Name: "ChannelTimeout"},
	{Name: "CheckHostIP", Values: yesNo},
	{Name: "Ciphers"},
	{Name: "ClearAllForwardings", Values: yesNo},
	{Name: "Compression", Values: yesNo},
	{Name: "ConnectionAttempts"},
	{Name: "ConnectTimeout"},
	{Name: "ControlMaster", Values: []string{"no", "yes", "ask", "auto", "autoask"}},
	{Name: "ControlPath"},
	{Name: "ControlPersist", Values: []string{"no", "yes", "10m", "1h"}},
	{Name: "DynamicForward", Multi: true},
	{Name: "EnableEscapeCommandline", Values: yesNo},
	{Name: "EnableSSHKeysign", Values: yesNo},
	{Name: "EscapeChar"},
	{Name: "ExitOnForwardFailure", Values: yesNo},
	{Name: "FingerprintHash", Values: []string{"sha256", "md5"}},
	{Name: "ForkAfterAuthentication", Values: yesNo},
	{Name: "ForwardAgent", Values: yesNo},
	{Name: "ForwardX11", Values: yesNo},
	{Name: "ForwardX11Timeout"},
	{Name: "ForwardX11Trusted", Values: yesNo},
	{Name: "GatewayPorts", Values: yesNo},
	{Name: "GlobalKnownHostsFile"},
	{Name: "GSSAPIAuthentication", Values: yesNo},
	{Name: "GSSAPIDelegateCredentials", Values: yesNo},
	{Name: "HashKnownHosts", Values: yesNo},
	{Name: "HostbasedAcceptedAlgorithms"},
	{Name: "HostbasedAuthentication", Values: yesNo},
	{Name: "HostKeyAlgorithms"},
	{Name: "HostKeyAlias"},
	{Name: "Hostname"},
	{Name: "IdentitiesOnly", Values: yesNo},
	{Name: "IdentityAgent", Values: []string{"SSH_AUTH_SOCK", "none"}},
	{Name: "IdentityFile", Multi: true},
	{Name: "IgnoreUnknown"},
	{Name: "Include"},
	{Name: "IPQoS"},
	{Name: "KbdInteractiveAuthentication", Values: yesNo},
	{Name: "KbdInteractiveDevices"},
	{Name: "KexAlgorithms"},
	{Name: "KnownHostsCommand"},
	{Name: "LocalCommand"},
	{Name: "LocalForward", Multi: true},
	{Name: "LogLevel", Values: []string{"QUIET", "FATAL", "ERROR", "INFO", "VERBOSE", "DEBUG", "DEBUG1", "DEBUG2", "DEBUG3"}},
	{Name: "LogVerbose"},
	{Name: "MACs"},
	{Name: "NoHostAuthenticationForLocalhost", Values: yesNo},
	{Name: "NumberOfPasswordPrompts"},
	{Name: "ObscureKeystrokeTiming", Values: []string{"yes", "no"}},
	{Name: "PasswordAuthentication", Values: yesNo},
	{Name: "PermitLocalCommand", Values: yesNo},
	{Name: "PermitRemoteOpen"},
	{Name: "PKCS11Provider"},
	{Name: "Port"},
	{Name: "PreferredAuthentications"},
	{Name: "ProxyCommand"},
	{Name: "ProxyJump"},
	{Name: "ProxyUseFdpass", Values: yesNo},
	{Name: "PubkeyAcceptedAlgorithms"},
	{Name: "PubkeyAuthentication", Values: []string{"yes", "no", "unbound", "host-bound"}},
	{Name: "RekeyLimit"},
	{Name: "RemoteCommand"},
	{Name: "RemoteForward", Multi: true},
	{Name: "RequestTTY", Values: []string{"no", "yes", "force", "auto"}},
	{Name: "RequiredRSASize"},
	{Name: "RevokedHostKeys"},
	{Name: "SecurityKeyProvider"},
	{Name: "SendEnv", Multi: true},
	{Name: "ServerAliveCountMax"},
	{Name: "ServerAliveInterval"},
	{Name: "SessionType", Values: []string{"default", "none", "subsystem"}},
	{Name: "SetEnv", Multi: true},
	{Name: "StdinNull", Values: yesNo},
	{Name: "StreamLocalBindMask"},
	{Name: "StreamLocalBindUnlink", Values: yesNo},
	{Name: "StrictHostKeyChecking", Values: []string{"yes", "accept-new", "no", "off", "ask"}},
	{Name: "SyslogFacility"},
	{Name: "Tag"},
	{Name: "TCPKeepAlive", Values: yesNo},
	{Name: "Tunnel", Values: []string{"no", "yes", "point-to-point", "ethernet"}},
	{Name: "TunnelDevice"},
	{Name: "UpdateHostKeys", Values: []string{"yes", "no", "ask"}},
	{Name: "User"},
	{Name: "UserKnownHostsFile"},
	{Name: "VerifyHostKeyDNS", Values: []string{"yes", "no", "ask"}},
	{Name: "VisualHostKey", Values: yesNo},
	{Name: "WarnWeakCrypto", Values: yesNo},
	{Name: "XAuthLocation"},
}

var keywordIndex = func() map[string]Keyword {
	m := make(map[string]Keyword, len(keywords))
	for _, k := range keywords {
		m[strings.ToLower(k.Name)] = k
	}
	// Deprecated aliases that ssh still accepts.
	for alias, target := range map[string]string{
		"pubkeyacceptedkeytypes":          "PubkeyAcceptedAlgorithms",
		"hostbasedkeytypes":               "HostbasedAcceptedAlgorithms",
		"hostbasedacceptedkeytypes":       "HostbasedAcceptedAlgorithms",
		"challengeresponseauthentication": "KbdInteractiveAuthentication",
		"skeyauthentication":              "KbdInteractiveAuthentication",
		"tisauthentication":               "KbdInteractiveAuthentication",
		"dsaauthentication":               "PubkeyAuthentication",
	} {
		m[alias] = m[strings.ToLower(target)]
	}
	return m
}()

// Keywords returns all known keywords sorted by name.
func Keywords() []Keyword {
	out := append([]Keyword{}, keywords...)
	sort.Slice(out, func(i, j int) bool { return strings.ToLower(out[i].Name) < strings.ToLower(out[j].Name) })
	return out
}

// LookupKeyword finds a keyword case-insensitively.
func LookupKeyword(name string) (Keyword, bool) {
	k, ok := keywordIndex[strings.ToLower(name)]
	return k, ok
}

// canonicalKey maps a keyword to the name used for "first value wins", so
// aliases share one slot.
func canonicalKey(name string) string {
	if k, ok := LookupKeyword(name); ok {
		return k.Name
	}
	return name
}
