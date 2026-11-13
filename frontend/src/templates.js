// Templates: placeholders, the text format of the template editor and turning
// templates into blocks. Pure functions; the dialogs live in templateDialogs.js.
//
// A host template is a list of options, a group template a group name plus
// Host blocks. Values may contain placeholders:
//   {alias} {short} {domain} {group}  filled from the host (built-in)
//   {name} or {name=default}          asked for when the template is applied
// ssh's own ${ENV} and %-tokens are left alone.

import {groupMembers} from './groups';
import {isWildcard, splitPatterns} from './state';

export const BUILTINS = ['alias', 'short', 'domain', 'group'];

// a "{" directly after "$" is ssh's ${ENV} syntax, not a placeholder
const PLACEHOLDER = /(?<!\$)\{([A-Za-z_][A-Za-z0-9_]*)(?:=([^{}]*))?\}/g;

// placeholders lists the placeholders of a string in order: [{name, def}]
// (def is undefined without "=default").
export function placeholders(s) {
    return [...String(s || '').matchAll(PLACEHOLDER)].map((m) => ({name: m[1], def: m[2]}));
}

// fill replaces the placeholders of s with values[name], falling back to the
// default of the placeholder and then to ''.
export function fill(s, values) {
    return String(s || '').replace(PLACEHOLDER, (_, name, def) => values[name] ?? def ?? '');
}

// templateStrings lists every string of a template that may hold placeholders.
function templateStrings(tpl) {
    if (tpl.kind === 'group') {
        return [tpl.group, ...(tpl.hosts || []).flatMap((h) => [h.patterns, ...(h.options || []).map((o) => o.value)])];
    }
    return (tpl.options || []).map((o) => o.value);
}

// templateVariables lists the placeholders of a template the user has to
// fill in (all but the built-in ones), each once, with the first default.
export function templateVariables(tpl) {
    const vars = new Map();
    for (const s of templateStrings(tpl)) {
        for (const p of placeholders(s)) {
            if (BUILTINS.includes(p.name)) continue;
            const v = vars.get(p.name);
            if (!v) vars.set(p.name, {name: p.name, def: p.def ?? ''});
            else if (!v.def && p.def) v.def = p.def;
        }
    }
    return [...vars.values()];
}

// usesBuiltins tells whether a template refers to the alias of the host.
export function usesAlias(tpl) {
    return templateStrings(tpl).some((s) => placeholders(s).some((p) => ['alias', 'short', 'domain'].includes(p.name)));
}

export const hasPlaceholders = (tpl) => templateStrings(tpl).some((s) => placeholders(s).length > 0);

// builtins are the values derived from a host: its first literal alias, the
// part before / after the first dot and the group.
export function builtins(patterns, group = '') {
    const list = splitPatterns(patterns);
    const alias = list.find((p) => !isWildcard(p)) || list[0] || '';
    const dot = alias.indexOf('.');
    return {
        alias,
        short: dot < 0 ? alias : alias.slice(0, dot),
        domain: dot < 0 ? '' : alias.slice(dot + 1),
        group: group || '',
    };
}

const optionEntries = (options, values) =>
    (options || []).map((o) => ({type: 'option', key: o.key, value: fill(o.value, values)}));

// instantiateHost returns the option entries of a host template for a host
// with the given patterns and group.
// withDefaults completes the given values with the defaults of the template,
// so "{port=22}" in one place also fills a plain "{port}" elsewhere.
const withDefaults = (tpl, vars) => ({...Object.fromEntries(templateVariables(tpl).map((v) => [v.name, v.def])), ...vars});

export function instantiateHost(tpl, {patterns = '', group = '', vars = {}} = {}) {
    return optionEntries(tpl.options, {...withDefaults(tpl, vars), ...builtins(patterns, group)});
}

// instantiateGroup returns {group, hosts: [{patterns, entries}]} of a group
// template. {group} and {alias} have no value where they would refer to
// themselves (in the group name, in the patterns).
export function instantiateGroup(tpl, given = {}) {
    const vars = withDefaults(tpl, given);
    const empty = {alias: '', short: '', domain: '', group: ''};
    const group = fill(tpl.group, {...vars, ...empty}).trim();
    const hosts = (tpl.hosts || []).map((h) => {
        const patterns = splitPatterns(fill(h.patterns, {...vars, ...empty, group})).join(' ');
        return {patterns, entries: optionEntries(h.options, {...vars, ...builtins(patterns, group)})};
    });
    return {group, hosts};
}

// ---- from the document ----

export const optionsOf = (b) => b.entries
    .filter((e) => e.type === 'option' && e.key.trim())
    .map((e) => ({key: e.key.trim(), value: e.value.trim()}));

export function templateFromBlock(b, name = '') {
    return {name, kind: 'host', options: optionsOf(b)};
}

// templateFromGroup takes the Host blocks of a group (Match blocks cannot be
// part of a group template).
export function templateFromGroup(group, name = '') {
    return {
        name: name || group,
        kind: 'group',
        group,
        hosts: groupMembers(group).filter((b) => b.kind === 'host').map((b) => ({patterns: b.patterns.trim(), options: optionsOf(b)})),
    };
}

// hasConfig tells whether a block has options with values, i.e. applying a
// template would overwrite something.
export const hasConfig = (b) => b.entries.some((e) => e.type === 'option' && e.key.trim() && e.value.trim());

// applyEntries replaces the entries of a block with the given option entries;
// blank lines at the end (separators to the next block) are kept.
export function applyEntries(b, entries) {
    const trailing = [];
    for (let i = b.entries.length - 1; i >= 0 && b.entries[i].type === 'blank'; i--) trailing.unshift(b.entries[i]);
    b.entries = [...entries.map((e) => ({...e})), ...trailing];
}

// newHostBlock is a Host block as the Go side sends it.
export function newHostBlock(id, patterns, entries, group = '') {
    return {id, kind: 'host', keyword: 'Host', patterns, headerRaw: '', leading: [], entries, group};
}

// ---- text format of the template editor ----
//
//   host template:   one option per line, "Key value" or "Key=value"
//   group template:  "Host <patterns>" lines, each followed by its options
// Lines starting with # and blank lines are ignored.

const OPTION = /^([A-Za-z][A-Za-z0-9]*)(?:\s*=\s*|\s+|$)(.*)$/;

// parseTemplateText returns {options} or {hosts} plus errors [{line, code}]
// (codes are i18n keys).
export function parseTemplateText(text, kind) {
    const errors = [];
    const options = [];
    const hosts = [];
    String(text || '').split(/\r?\n/).forEach((raw, i) => {
        const line = raw.trim();
        if (!line || line.startsWith('#')) return;
        const m = line.match(OPTION);
        if (!m) return errors.push({line: i + 1, code: 'tpl.error.syntax'});
        const key = m[1], value = m[2].trim();
        const lk = key.toLowerCase();
        if (lk === 'match') return errors.push({line: i + 1, code: 'tpl.error.match'});
        if (lk === 'host') {
            if (kind !== 'group') return errors.push({line: i + 1, code: 'tpl.error.hostInHostTemplate'});
            if (!value) return errors.push({line: i + 1, code: 'tpl.error.noPatterns'});
            hosts.push({patterns: splitPatterns(value).join(' '), options: []});
            return;
        }
        if (kind === 'group') {
            if (!hosts.length) return errors.push({line: i + 1, code: 'tpl.error.optionBeforeHost'});
            hosts[hosts.length - 1].options.push({key, value});
        } else {
            options.push({key, value});
        }
    });
    if (kind === 'group' && !hosts.length && !errors.length) errors.push({line: 0, code: 'tpl.error.noHosts'});
    return kind === 'group' ? {hosts, errors} : {options, errors};
}

const optionLines = (options, indent = '') => (options || []).map((o) => `${indent}${o.key} ${o.value}`.trimEnd());

export function templateText(tpl) {
    if (tpl.kind === 'group') {
        return (tpl.hosts || []).map((h) => [`Host ${h.patterns}`, ...optionLines(h.options, '    ')].join('\n')).join('\n\n');
    }
    return optionLines(tpl.options).join('\n');
}
