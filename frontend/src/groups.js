// Group logic: a group is always one contiguous run of blocks in the file.

import {t} from './i18n';
import {ensureSeparators, renderEditor} from './editor';
import {openGroupDialog} from './groupDialog';
import {renderEffective} from './inspector';
import {renderSidebar} from './sidebar';
import {blockIndex, S, store} from './state';
import {scheduleSync} from './sync';
import {modal} from './ui';

// ---- groups ----

export const groupKey = (g) => String(g || '').trim().toLowerCase();

export function groupNames() {
    const seen = new Map();
    S.config.blocks.forEach((b) => {
        if (b.kind !== 'global' && b.group && !seen.has(groupKey(b.group))) seen.set(groupKey(b.group), b.group.trim());
    });
    return [...seen.values()];
}

export function groupMembers(name) {
    return S.config.blocks.filter((b) => b.kind !== 'global' && b.group && groupKey(b.group) === groupKey(name));
}

// groupRun returns [first, last] index of the (first) run of a group.
export function groupRun(name) {
    let first = -1, last = -1;
    S.config.blocks.forEach((b, i) => {
        if (b.kind !== 'global' && b.group && groupKey(b.group) === groupKey(name)) {
            if (first < 0) first = i;
            if (first >= 0 && last === i - 1 || last < 0) last = i;
        }
    });
    return first < 0 ? null : [first, last];
}

export function groupNameError(name, except = '') {
    const n = String(name || '').trim();
    if (!n) return t('group.error.empty');
    if (/[[\]\r\n]/.test(n)) return t('group.error.brackets');
    if (n.length > 80) return t('group.error.tooLong');
    if (groupKey(n) !== groupKey(except) && groupNames().some((g) => groupKey(g) === groupKey(n))) {
        return t('group.error.exists', {name: n});
    }
    return '';
}

// inferGroup decides the group of a block after it was moved to idx, so that
// every group stays one contiguous run of blocks.
export function inferGroup(idx) {
    const blocks = S.config.blocks;
    const b = blocks[idx];
    const prev = idx > 1 ? groupKey(blocks[idx - 1].group) : '';
    const next = idx + 1 < blocks.length ? groupKey(blocks[idx + 1].group) : '';
    if (prev === next) {
        b.group = prev ? blocks[idx - 1].group : '';
        return;
    }
    const own = groupKey(b.group);
    if (own && (own === prev || own === next)) return;
    b.group = '';
}

// placeBlock moves a block to a position in the list without the block.
export function placeBlock(b, index, group) {
    const blocks = S.config.blocks;
    blocks.splice(blockIndex(b.id), 1);
    blocks.splice(Math.max(1, Math.min(blocks.length, index)), 0, b);
    b.group = group;
}

// setBlockGroup moves a block into a group (at its end), out of a group
// (behind it, if the block sits in the middle) or into a new group.
export function setBlockGroup(b, name) {
    const idx = blockIndex(b.id);
    name = String(name || '').trim();
    if (groupKey(name) === groupKey(b.group)) return;
    const own = b.group ? groupRun(b.group) : null;
    const insideOwn = own && idx > own[0] && idx < own[1];
    if (!name) {
        if (insideOwn) placeBlock(b, own[1], '');
        else b.group = '';
    } else {
        const run = groupRun(name);
        if (run) {
            placeBlock(b, idx < run[0] ? run[1] : run[1] + 1, groupNames().find((g) => groupKey(g) === groupKey(name)));
        } else if (insideOwn) {
            placeBlock(b, own[1], name);
        } else {
            b.group = name;
        }
    }
    afterStructureChange(b.id);
}

export function moveGroupTo(name, targetId, after) {
    const members = groupMembers(name);
    if (!members.length || members.some((m) => m.id === targetId)) return;
    const rest = S.config.blocks.filter((b) => !members.includes(b));
    let t = rest.findIndex((b) => b.id === targetId);
    if (t < 0) return;
    const tg = groupKey(rest[t].group);
    if (tg && rest[t].kind !== 'global') {
        // never split another group: snap to its boundary
        const idxs = rest.map((b, i) => (groupKey(b.group) === tg ? i : -1)).filter((i) => i >= 0);
        t = after ? idxs[idxs.length - 1] + 1 : idxs[0];
    } else {
        t = after ? t + 1 : t;
    }
    rest.splice(Math.max(1, t), 0, ...members);
    S.config.blocks = rest;
    afterStructureChange(S.selected);
}

export function renameGroup(name) {
    openGroupDialog({name, members: groupMembers(name).map((b) => b.id)});
}

export async function ungroup(name) {
    const r = await modal(t('group.dissolve.title'), t('group.dissolve.text', {name}), [t('group.dissolve.ok'), t('common.cancel')]);
    if (r !== 0) return;
    groupMembers(name).forEach((b) => (b.group = ''));
    afterStructureChange(S.selected);
}

export function newGroupFor(b) {
    openGroupDialog({members: b && b.kind !== 'global' ? [b.id] : []});
}

export function afterStructureChange(selectId) {
    ensureSeparators();
    if (selectId) S.selected = selectId;
    renderSidebar();
    renderEditor();
    renderEffective();
    scheduleSync(0);
}

export function toggleGroup(name) {
    const k = groupKey(name);
    if (S.collapsed.has(k)) S.collapsed.delete(k); else S.collapsed.add(k);
    store.set('collapsed', [...S.collapsed]);
    renderSidebar();
}
