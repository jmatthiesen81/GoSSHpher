// Test helpers: a small document model like the one Go sends to the UI.
import {S} from '../src/state';

export function host(id, patterns, group = '', entries = [{type: 'option', key: 'User', value: 'x'}]) {
    return {id, kind: 'host', keyword: 'Host', patterns, headerRaw: '', leading: [], entries, group};
}

// load replaces the document with a global preamble plus the given blocks.
export function load(...blocks) {
    S.config = {
        newline: '\n',
        finalNewline: true,
        blocks: [{id: 'g', kind: 'global', leading: [], entries: []}, ...blocks],
    };
    S.selected = blocks[0]?.id ?? 'g';
    S.collapsed = new Set();
    S.ui = {};
}

// order lists the blocks as "id:group" in file order (without the preamble).
export const order = () => S.config.blocks.slice(1).map((b) => (b.group ? `${b.id}:${b.group}` : b.id));
