import './mocks';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {recordChange, redo, resetHistory, undo} from '../src/history';
import {S} from '../src/state';
import {host, load} from './helpers';

const user = () => S.config.blocks[1].entries[0].value;
const setUser = (v, target = null) => {
    S.config.blocks[1].entries[0].value = v;
    recordChange(target);
};

describe('history', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        load(host('a', 'a'));
        resetHistory();
    });

    it('undoes and redoes structural changes step by step', () => {
        setUser('one');
        setUser('two');
        undo();
        expect(user()).toBe('one');
        undo();
        expect(user()).toBe('x');
        redo();
        redo();
        expect(user()).toBe('two');
    });

    it('coalesces typing in the same field within 1.5 s', () => {
        const field = {};
        for (const v of ['p', 'po', 'pos']) {
            setUser(v, field);
            vi.advanceTimersByTime(300);
        }
        vi.advanceTimersByTime(2000);
        setUser('post', field); // after a long pause: new step
        undo();
        expect(user()).toBe('pos');
        undo();
        expect(user()).toBe('x');
    });

    it('does not coalesce typing in different fields', () => {
        setUser('a', {});
        setUser('b', {});
        undo();
        expect(user()).toBe('a');
    });

    it('clears redo after a new change', () => {
        setUser('one');
        undo();
        setUser('other');
        redo();
        expect(user()).toBe('other');
    });

    it('keeps the current selection if the block still exists', () => {
        S.config.blocks.push(host('b', 'b'));
        recordChange();
        S.selected = 'b';
        setUser('changed');
        undo();
        expect(S.selected).toBe('b');
    });

    it('keeps snapshots independent of the live document', () => {
        setUser('one');
        undo();
        // editing the restored document must not alter the redo snapshot
        S.config.blocks[1].entries[0].value = 'mutated';
        redo();
        expect(user()).toBe('one');
    });
});
