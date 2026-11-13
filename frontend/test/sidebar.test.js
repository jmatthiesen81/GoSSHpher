// The real sidebar module (mocks.js replaces it for the other tests).
import {vi, describe, expect, it} from 'vitest';
import {host, load} from './helpers';

vi.mock('../wailsjs/go/main/App', () => ({}));
vi.mock('../src/inspector', () => ({renderEffective: vi.fn(), renderIssues: vi.fn(), inspectorTab: vi.fn()}));
vi.mock('../src/sync', () => ({
    scheduleSync: vi.fn(), renderAll: vi.fn(), renderStatus: vi.fn(), flush: vi.fn(), showError: vi.fn(),
    applyState: vi.fn(), issuesFor: () => [], worstSeverity: () => '', matchesFilter: () => true,
}));

const {markSequence} = await import('../src/sidebar');
const {S} = await import('../src/state');

describe('markSequence', () => {
    it('stops runs at group boundaries, also without a header in between', () => {
        load(host('a', 'a'), host('b', 'b', 'G'), host('c', 'c', 'G'), host('d', 'd'), host('e', 'e', 'H'));
        S.sort = 'file';
        S.filter = '';
        // header G, b, c, (group change) d, header H, e
        expect(markSequence()).toEqual(['a', null, 'b', 'c', null, 'd', null, 'e']);
    });
    it('treats collapsed groups as a boundary', () => {
        load(host('a', 'a'), host('b', 'b', 'G'), host('c', 'c'));
        S.sort = 'file';
        S.filter = '';
        S.collapsed = new Set(['g']);
        expect(markSequence()).toEqual(['a', null, 'c']);
    });
});
