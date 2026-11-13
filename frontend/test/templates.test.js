import './mocks';
import {describe, expect, it} from 'vitest';
import {
    applyEntries, builtins, fill, hasConfig, instantiateGroup, instantiateHost, parseTemplateText, placeholders,
    templateFromBlock, templateFromGroup, templateText, templateVariables, usesAlias,
} from '../src/templates';
import {host, load} from './helpers';

const opt = (key, value) => ({type: 'option', key, value});

describe('placeholders', () => {
    it('finds names and defaults but leaves ssh ${ENV} alone', () => {
        expect(placeholders('{a} x {b=22} ${HOME} %h')).toEqual([{name: 'a', def: undefined}, {name: 'b', def: '22'}]);
    });
    it('fills values, then defaults, then empty', () => {
        expect(fill('{a}-{b=2}-{c}-${HOME}', {a: '1'})).toBe('1-2--${HOME}');
        expect(fill('{b=2}', {b: '3'})).toBe('3');
    });
});

describe('builtins', () => {
    it('derive alias, short and domain from the first literal pattern', () => {
        expect(builtins('*.x web1.kunde.de web1', 'G')).toEqual({alias: 'web1.kunde.de', short: 'web1', domain: 'kunde.de', group: 'G'});
        expect(builtins('db')).toEqual({alias: 'db', short: 'db', domain: '', group: ''});
        expect(builtins('')).toEqual({alias: '', short: '', domain: '', group: ''});
    });
});

describe('host templates', () => {
    const tpl = {name: 'T', kind: 'host', options: [
        {key: 'Hostname', value: '{ip}'}, {key: 'Port', value: '{port=22}'}, {key: 'IdentityFile', value: '~/.ssh/{short}'},
        {key: 'User', value: '{port}'},
    ]};
    it('list variables once, without built-ins, with the first default', () => {
        expect(templateVariables(tpl)).toEqual([{name: 'ip', def: ''}, {name: 'port', def: '22'}]);
        expect(usesAlias(tpl)).toBe(true);
        expect(usesAlias({kind: 'host', options: [{key: 'User', value: '{group}'}]})).toBe(false);
    });
    it('instantiate with variables and built-ins', () => {
        expect(instantiateHost(tpl, {patterns: 'web1.example.org', vars: {ip: '10.0.0.1'}})).toEqual([
            opt('Hostname', '10.0.0.1'), opt('Port', '22'), opt('IdentityFile', '~/.ssh/web1'), opt('User', '22'),
        ]);
    });
    it('round-trip through the text format', () => {
        const text = templateText(tpl);
        expect(text).toBe('Hostname {ip}\nPort {port=22}\nIdentityFile ~/.ssh/{short}\nUser {port}');
        expect(parseTemplateText(text, 'host')).toEqual({options: tpl.options, errors: []});
    });
});

describe('group templates', () => {
    const tpl = {name: 'C', kind: 'group', group: 'Kunde {customer}', hosts: [
        {patterns: 'bastion.{customer}.de', options: [{key: 'Hostname', value: '{ip}'}, {key: 'User', value: '{group}'}]},
        {patterns: 'web.{customer}.de {alias}', options: [{key: 'ProxyJump', value: 'bastion.{customer}.de'}, {key: 'Hostname', value: '{short}.int'}]},
    ]};
    it('share their variables across hosts', () => {
        expect(templateVariables(tpl).map((v) => v.name)).toEqual(['customer', 'ip']);
    });
    it('instantiate group name, patterns and options', () => {
        expect(instantiateGroup(tpl, {customer: 'acme', ip: '1.2.3.4'})).toEqual({
            group: 'Kunde acme',
            hosts: [
                {patterns: 'bastion.acme.de', entries: [opt('Hostname', '1.2.3.4'), opt('User', 'Kunde acme')]},
                // {alias} in the patterns refers to itself and stays empty
                {patterns: 'web.acme.de', entries: [opt('ProxyJump', 'bastion.acme.de'), opt('Hostname', 'web.int')]},
            ],
        });
    });
    it('parse the text format with Host lines', () => {
        const parsed = parseTemplateText('# comment\nHost a  b\n  User x\n\nHost c\n  Port=2', 'group');
        expect(parsed).toEqual({hosts: [
            {patterns: 'a b', options: [{key: 'User', value: 'x'}]},
            {patterns: 'c', options: [{key: 'Port', value: '2'}]},
        ], errors: []});
        expect(templateText({kind: 'group', hosts: parsed.hosts})).toBe('Host a b\n    User x\n\nHost c\n    Port 2');
    });
});

describe('parse errors', () => {
    const codes = (text, kind) => parseTemplateText(text, kind).errors.map((e) => `${e.line}:${e.code}`);
    it('reports misplaced lines', () => {
        expect(codes('Host a\nUser x', 'host')).toEqual(['1:tpl.error.hostInHostTemplate']);
        expect(codes('User x\nHost a', 'group')).toEqual(['1:tpl.error.optionBeforeHost']);
        expect(codes('Match host x', 'host')).toEqual(['1:tpl.error.match']);
        expect(codes('Host', 'group')).toEqual(['1:tpl.error.noPatterns']);
        expect(codes('', 'group')).toEqual(['0:tpl.error.noHosts']);
        expect(codes('-x y', 'host')).toEqual(['1:tpl.error.syntax']);
    });
});

describe('from the document', () => {
    it('takes the options of a block and the Host blocks of a group', () => {
        const a = host('a', 'a.example', 'G', [opt('User', ' x '), {type: 'comment', text: '# c'}, opt('', 'dropped')]);
        const m = {...host('m', 'all', 'G'), kind: 'match', keyword: 'Match'};
        load(a, m, host('b', 'b.example', 'G', [opt('Port', '2')]));
        expect(templateFromBlock(a, 'N')).toEqual({name: 'N', kind: 'host', options: [{key: 'User', value: 'x'}]});
        expect(templateFromGroup('G')).toEqual({name: 'G', kind: 'group', group: 'G', hosts: [
            {patterns: 'a.example', options: [{key: 'User', value: 'x'}]},
            {patterns: 'b.example', options: [{key: 'Port', value: '2'}]},
        ]});
    });
    it('detects configured hosts and keeps trailing blank lines when applying', () => {
        const b = host('a', 'a', '', [opt('Hostname', ''), opt('User', '')]);
        expect(hasConfig(b)).toBe(false);
        b.entries = [opt('User', 'x'), {type: 'comment', text: '# c'}, {type: 'blank'}];
        expect(hasConfig(b)).toBe(true);
        applyEntries(b, [opt('Port', '2')]);
        expect(b.entries).toEqual([opt('Port', '2'), {type: 'blank'}]);
    });
});
