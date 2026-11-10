import './mocks';
import {beforeAll, describe, expect, it} from 'vitest';
import {collectExecs, expandedValue, fileName, shortLabel} from '../src/effective';
import {setCatalog, t} from '../src/i18n';
import {noteText} from '../src/ui';
import en from '../../internal/i18n/locales/en.json';
import de from '../../internal/i18n/locales/de.json';

describe('collectExecs', () => {
    const res = {
        blocks: [
            {blockId: 'm1', execs: [{command: 'nc -z %h 22', expanded: 'nc -z a 22', negated: true, result: false, assumed: false}]},
            {blockId: 'h'},
            {blockId: 'm2', execs: [
                {command: 'on-vpn', expanded: 'on-vpn', negated: false, result: true, assumed: true},
                {command: 'nc -z %h 22', expanded: 'nc -z a 22', negated: false, result: false, assumed: false},
            ]},
        ],
    };
    it('lists each expanded command once, in evaluation order', () => {
        const list = collectExecs(res);
        expect(list.map((e) => e.expanded)).toEqual(['nc -z a 22', 'on-vpn']);
        expect(list[0].blocks.map((b) => b.blockId)).toEqual(['m1', 'm2']);
        expect(list[0].negated).toBe(true); // first occurrence wins
    });
    it('handles resolutions without Match blocks', () => {
        expect(collectExecs({blocks: [{blockId: 'x'}]})).toEqual([]);
        expect(collectExecs({})).toEqual([]);
    });
});

describe('display helpers', () => {
    it('expandedValue returns the substituted value only if it differs', () => {
        const o = {values: ['~/.ssh/%h', 'plain'], expanded: ['/home/me/.ssh/a', '']};
        expect(expandedValue(o, 0)).toBe('/home/me/.ssh/a');
        expect(expandedValue(o, 1)).toBe('');
        expect(expandedValue({values: ['x']}, 0)).toBe('');
    });
    it('shortLabel shortens host labels', () => {
        expect(shortLabel('Host a b c', 'pre')).toBe('Host a +2');
        expect(shortLabel('Host a', 'pre')).toBe('Host a');
        expect(shortLabel('Match all', 'pre')).toBe('Match all');
        expect(shortLabel('', 'pre')).toBe('pre');
        const long = shortLabel('Match originalhost db01,db02,app01 !exec "nc -z -w 1 %h 22"', 'pre');
        expect(long).toHaveLength(40);
        expect(long.endsWith('…')).toBe(true);
    });
    it('fileName works with both path separators', () => {
        expect(fileName('/a/b/team.conf')).toBe('team.conf');
        expect(fileName('C:\\Users\\me\\.ssh\\x.conf')).toBe('x.conf');
    });
});

describe('texts for the new features', () => {
    beforeAll(() => setCatalog('en', en));
    it('renders the exec note and the confirmation text', () => {
        expect(noteText({code: 'match.execAssumed', params: {command: 'nc -z a 22'}}))
            .toBe('“exec nc -z a 22” was not run and is assumed to fail.');
        expect(t('exec.confirm.text', {host: 'db01', command: 'nc -z a 22'})).toContain('db01');
        expect(t('exec.confirm.text', {host: 'db01', command: 'nc -z a 22'})).toMatch(/\n\nnc -z a 22$/);
    });
    it('has German texts', () => {
        setCatalog('de', de);
        expect(t('eff.exec.assumeTrue')).toBe('Annahme: erfolgreich');
        expect(t('toast.windowOpened', {file: 'team.conf'})).toBe('team.conf in neuem Fenster geöffnet');
        setCatalog('en', en);
    });
});
