import './mocks';
import {beforeEach, describe, expect, it} from 'vitest';
import {groupNameError, groupRun, inferGroup, moveGroupTo, setBlockGroup} from '../src/groups';
import {planGroup} from '../src/groupDialog';
import {S} from '../src/state';
import {host, load, order} from './helpers';

describe('groupRun', () => {
    it('returns the first contiguous run of a group (case-insensitive)', () => {
        load(host('a', 'a'), host('b', 'b', 'G'), host('c', 'c', 'g'), host('d', 'd'));
        expect(groupRun('G')).toEqual([2, 3]);
        expect(groupRun('missing')).toBeNull();
    });
});

describe('groupNameError', () => {
    beforeEach(() => load(host('a', 'a', 'GitHub')));
    it('rejects empty, bracketed, too long and duplicate names', () => {
        expect(groupNameError('  ')).toBe('group.error.empty');
        expect(groupNameError('a[b]')).toBe('group.error.brackets');
        expect(groupNameError('x'.repeat(81))).toBe('group.error.tooLong');
        expect(groupNameError('github')).toBe('group.error.exists');
    });
    it('accepts new names and the own name when renaming', () => {
        expect(groupNameError('GitLab')).toBe('');
        expect(groupNameError('GITHUB', 'GitHub')).toBe('');
    });
});

describe('inferGroup', () => {
    it('joins the group of both neighbours', () => {
        load(host('a', 'a', 'G'), host('x', 'x'), host('b', 'b', 'G'));
        inferGroup(2);
        expect(order()).toEqual(['a:G', 'x:G', 'b:G']);
    });
    it('keeps its own group at the edge of that group', () => {
        load(host('a', 'a', 'G'), host('x', 'x', 'G'), host('b', 'b'));
        inferGroup(2);
        expect(S.config.blocks[2].group).toBe('G');
    });
    it('leaves a group it was moved away from', () => {
        load(host('a', 'a'), host('x', 'x', 'G'), host('b', 'b', 'H'));
        inferGroup(2);
        expect(S.config.blocks[2].group).toBe('');
    });
});

describe('setBlockGroup', () => {
    it('moves a joining block to the end of the group', () => {
        load(host('x', 'x'), host('a', 'a', 'G'), host('b', 'b', 'G'), host('c', 'c'));
        setBlockGroup(S.config.blocks[1], 'G');
        expect(order()).toEqual(['a:G', 'b:G', 'x:G', 'c']);
    });
    it('moves a block leaving from the middle behind the group', () => {
        load(host('a', 'a', 'G'), host('x', 'x', 'G'), host('b', 'b', 'G'), host('c', 'c'));
        setBlockGroup(S.config.blocks[2], '');
        expect(order()).toEqual(['a:G', 'b:G', 'x', 'c']);
    });
    it('only drops the group of a block at the edge', () => {
        load(host('a', 'a', 'G'), host('b', 'b', 'G'), host('c', 'c'));
        setBlockGroup(S.config.blocks[2], '');
        expect(order()).toEqual(['a:G', 'b', 'c']);
    });
});

describe('moveGroupTo', () => {
    it('moves the whole group and never splits another group', () => {
        load(host('a', 'a', 'G'), host('b', 'b', 'G'), host('c', 'c', 'H'), host('d', 'd', 'H'), host('e', 'e'));
        // drop G "before" the second member of H: snaps before H
        moveGroupTo('G', 'd', false);
        expect(order()).toEqual(['a:G', 'b:G', 'c:H', 'd:H', 'e']);
        // drop G after e
        moveGroupTo('G', 'e', true);
        expect(order()).toEqual(['c:H', 'd:H', 'e', 'a:G', 'b:G']);
        // drop G after the first member of H: snaps behind H
        moveGroupTo('G', 'c', true);
        expect(order()).toEqual(['c:H', 'd:H', 'a:G', 'b:G', 'e']);
    });
});

describe('planGroup', () => {
    it('gathers the members in file order at the position of the first one', () => {
        load(host('a', 'a'), host('m1', 'm1'), host('b', 'b'), host('m2', 'm2'), host('c', 'c'));
        const before = order();
        const blocks = planGroup('New', '', ['m2', 'm1']);
        expect(blocks.slice(1).map((b) => (b.group ? `${b.id}:${b.group}` : b.id)))
            .toEqual(['a', 'm1:New', 'm2:New', 'b', 'c']);
        expect(order()).toEqual(before); // the current document is untouched
    });
    it('puts removed members directly behind the group', () => {
        load(host('a', 'a', 'G'), host('b', 'b', 'G'), host('c', 'c', 'G'), host('d', 'd'));
        const blocks = planGroup('G', 'G', ['a', 'c']);
        expect(blocks.slice(1).map((b) => (b.group ? `${b.id}:${b.group}` : b.id)))
            .toEqual(['a:G', 'c:G', 'b', 'd']);
    });
    it('never lands inside another group', () => {
        // m is taken out of the middle of H; inserting at its old position
        // would split H, so the new group goes behind H
        load(host('h1', 'h1', 'H'), host('m', 'm', 'H'), host('h2', 'h2', 'H'), host('x', 'x'));
        const blocks = planGroup('N', '', ['m', 'x']);
        expect(blocks.slice(1).map((b) => (b.group ? `${b.id}:${b.group}` : b.id)))
            .toEqual(['h1:H', 'h2:H', 'm:N', 'x:N']);
    });
});
