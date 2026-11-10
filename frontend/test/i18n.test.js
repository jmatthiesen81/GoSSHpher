import './mocks';
import {readFileSync, readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {beforeAll, describe, expect, it} from 'vitest';
import {setCatalog, t, th} from '../src/i18n';
import {issueText, noteText} from '../src/ui';
import en from '../../internal/i18n/locales/en.json';
import de from '../../internal/i18n/locales/de.json';

const root = resolve(import.meta.dirname, '..');

describe('texts', () => {
    beforeAll(() => setCatalog('en', en));

    it('fills placeholders and escapes HTML', () => {
        expect(t('toast.savedAs', {path: '/x'})).toBe('Saved as /x');
        expect(th('gd.fromGroup', {group: '<b>'})).toBe('from &lt;b&gt;');
        expect(th('eff.empty_html')).toContain('<code>ssh -G</code>');
    });

    it('renders a shadowed-option issue from code, params and items', () => {
        const text = issueText({
            code: 'shadowed',
            params: {key: 'User', value: 'postgres', hint: 'order'},
            items: [{host: 'db02', value: 'admin', block: '10', label: 'Host db01 db02', file: ''}],
        });
        expect(text).toBe('“User postgres” has no effect for: db02 (applies: admin from block 10 “Host db01 db02”). '
            + 'In ssh the first value found wins: move this block further up or remove the earlier value.');
    });

    it('translates reasons and the preamble label', () => {
        expect(issueText({code: 'group.invalid', params: {group: 'x', reason: 'group.error.empty'}}))
            .toBe('Group “x”: The name must not be empty.');
        const item = issueText({code: 'shadowed', params: {key: 'User', value: 'a', hint: 'wildcard'},
            items: [{host: 'h', value: 'b', block: '0', label: '', file: ''}]});
        expect(item).toContain('“(global, before the first Host)”');
        expect(noteText({code: 'include.notFound', params: {pattern: 'x.conf'}})).toBe('Include file not found: x.conf');
    });

    it('switches language', () => {
        setCatalog('de', de);
        expect(t('toolbar.save')).toBe('Speichern');
        setCatalog('en', en);
    });
});

describe('catalog keys used by the UI', () => {
    // literal keys in t('…'), th('…') and data-i18n* attributes must exist
    const files = readdirSync(resolve(root, 'src')).filter((f) => f.endsWith('.js'))
        .map((f) => readFileSync(resolve(root, 'src', f), 'utf8'));
    const html = readFileSync(resolve(root, 'index.html'), 'utf8');
    const keys = new Set();
    for (const src of files) {
        // complete keys only; prefixes such as t('issue.' + code) are built dynamically
        for (const m of src.matchAll(/\bth?\('([a-zA-Z0-9_.]+[a-zA-Z0-9_])'/g)) keys.add(m[1]);
    }
    for (const m of html.matchAll(/data-i18n(?:-html|-placeholder|-title)?="([^"]+)"/g)) keys.add(m[1]);

    it('finds the keys', () => expect(keys.size).toBeGreaterThan(100));
    it.each([...keys])('%s exists in en and de', (key) => {
        expect(en).toHaveProperty([key]);
        expect(de).toHaveProperty([key]);
    });
});
