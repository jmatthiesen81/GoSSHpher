// Host list: rows in file order or sorted, groups, drag and drop.

import {esc, t, th} from './i18n';
import {moveBlockTo, select} from './editor';
import {groupKey, groupMembers, groupNames, moveGroupTo, renameGroup, setBlockGroup, toggleGroup, ungroup} from './groups';
import {$, blockIndex, collator, hasPreamble, isGlobalHost, optionValue, preambleHasOptions, S, splitPatterns} from './state';
import {issuesFor, matchesFilter, worstSeverity} from './sync';

// ---- sidebar ----


export function sortKey(b) {
    const first = splitPatterns(b.patterns)[0] || '';
    // effective Hostname, so "Host github-work" sorts by the Hostname it
    // inherits from a shared block
    if (S.sort === 'hostname') return (S.hostnames[b.id] || optionValue(b, 'Hostname') || first).toLowerCase();
    return first.toLowerCase();
}


export function sidebarRows() {
    const blocks = S.config.blocks;
    const filtering = S.filter.trim() !== '';
    const groupHit = (name) => filtering && S.filter.trim().toLowerCase().split(/\s+/).every((t) => name.toLowerCase().includes(t));
    const visible = (b) => !filtering || matchesFilter(b) || (b.group && groupHit(b.group));
    const rows = [];

    const pushGroup = (name, members) => {
        const shown = members.filter(visible);
        if (filtering && !shown.length) return;
        const collapsed = S.collapsed.has(groupKey(name)) && !filtering;
        rows.push({type: 'group', name, count: members.length, collapsed});
        if (!collapsed) shown.forEach((b) => rows.push({type: 'block', b, inGroup: true}));
    };

    if (S.sort === 'file') {
        for (let i = 0; i < blocks.length; i++) {
            const b = blocks[i];
            if (b.kind === 'global') {
                if (hasPreamble(b) && visible(b)) rows.push({type: 'block', b});
                continue;
            }
            if (b.group) {
                const run = [b];
                while (i + 1 < blocks.length && groupKey(blocks[i + 1].group) === groupKey(b.group)) run.push(blocks[++i]);
                pushGroup(b.group.trim(), run);
                continue;
            }
            if (visible(b)) rows.push({type: 'block', b});
        }
        return rows;
    }

    const bySort = (a, b) => collator.compare(sortKey(a), sortKey(b)) || blockIndex(a.id) - blockIndex(b.id);
    const globals = blocks.filter((b) => (hasPreamble(b) || isGlobalHost(b)) && !b.group && visible(b));
    globals.forEach((b) => rows.push({type: 'block', b}));
    groupNames().sort(collator.compare).forEach((name) => pushGroup(name, groupMembers(name).sort(bySort)));
    const rest = blocks.filter((b) => b.kind !== 'global' && !b.group && !isGlobalHost(b) && visible(b)).sort(bySort);
    if (groupNames().length && rest.length) rows.push({type: 'nogroup', count: rest.length});
    rest.forEach((b) => rows.push({type: 'block', b}));
    return rows;
}

export let dragData = null; // {kind: 'block'|'group', id|name}

export function dropPosition(li, ev) {
    const r = li.getBoundingClientRect();
    return ev.clientY > r.top + r.height / 2;
}

export function clearDropMarks() {
    document.querySelectorAll('.drop-before, .drop-after, .drop-into').forEach((el) =>
        el.classList.remove('drop-before', 'drop-after', 'drop-into'));
}

export function renderSidebar() {
    const list = $('blocks');
    list.innerHTML = '';
    const fileOrder = S.sort === 'file';

    for (const row of sidebarRows()) {
        const li = document.createElement('li');

        if (row.type === 'group' || row.type === 'nogroup') {
            const name = row.name || '';
            li.className = 'group-head' + (row.type === 'nogroup' ? ' nogroup' : '') + (row.collapsed ? ' collapsed' : '');
            li.innerHTML = row.type === 'group'
                ? `<button class="twisty" title="${th('group.toggle')}">${row.collapsed ? '▸' : '▾'}</button>
                   <span class="gname">${esc(name)}</span><span class="gcount">${row.count}</span>
                   <span class="gactions">
                     <button data-gact="rename" title="${th('group.edit')}">✎</button>
                     <button data-gact="ungroup" title="${th('group.ungroup')}">⊘</button>
                   </span>`
                : `<span class="gname">${th('group.none')}</span><span class="gcount">${row.count}</span>`;
            if (row.type === 'group') {
                li.querySelector('.twisty').addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    toggleGroup(name);
                });
                li.addEventListener('dblclick', () => renameGroup(name));
                li.addEventListener('click', (ev) => {
                    const act = ev.target.closest('[data-gact]')?.dataset.gact;
                    if (act === 'rename') renameGroup(name);
                    else if (act === 'ungroup') ungroup(name);
                    else if (!ev.target.closest('button')) toggleGroup(name);
                });
                if (fileOrder) {
                    li.draggable = true;
                    li.addEventListener('dragstart', (ev) => {
                        dragData = {kind: 'group', name};
                        ev.dataTransfer.setData('text/plain', 'group:' + name);
                        ev.dataTransfer.effectAllowed = 'move';
                    });
                }
            }
            li.addEventListener('dragover', (ev) => {
                if (!dragData) return;
                if (dragData.kind === 'group' && (row.type !== 'group' || !fileOrder)) return;
                ev.preventDefault();
                clearDropMarks();
                if (dragData.kind === 'block') li.classList.add('drop-into');
                else li.classList.add(dropPosition(li, ev) ? 'drop-after' : 'drop-before');
            });
            li.addEventListener('dragleave', () => li.classList.remove('drop-before', 'drop-after', 'drop-into'));
            li.addEventListener('drop', (ev) => {
                ev.preventDefault();
                const after = li.classList.contains('drop-after');
                clearDropMarks();
                const d = dragData;
                dragData = null;
                if (!d) return;
                if (d.kind === 'block') {
                    const b = S.config.blocks.find((x) => x.id === d.id);
                    if (b) setBlockGroup(b, row.type === 'group' ? name : '');
                } else if (d.name !== name) {
                    const members = groupMembers(name);
                    moveGroupTo(d.name, (after ? members[members.length - 1] : members[0]).id, after);
                }
            });
            list.appendChild(li);
            continue;
        }

        const b = row.b;
        const idx = blockIndex(b.id);
        li.className = 'block-item' + (row.inGroup ? ' in-group' : '');
        if (b.id === S.selected) li.classList.add('selected');
        if ((b.kind === 'global' && preambleHasOptions(b)) || isGlobalHost(b)) li.classList.add('global');
        li.dataset.id = b.id;
        li.draggable = b.kind !== 'global';

        const sev = worstSeverity(issuesFor(b.id).filter((i) => i.severity !== 'info'));
        const patterns = splitPatterns(b.patterns);
        const hn = optionValue(b, 'Hostname'), user = optionValue(b, 'User'), port = optionValue(b, 'Port');
        let title, sub;
        if (b.kind === 'global' && !preambleHasOptions(b)) {
            title = th('sidebar.fileHeader');
            sub = th('sidebar.commentCount', {count: b.entries.filter((e) => e.type === 'comment').length});
        } else if (b.kind === 'global') {
            title = `<span class="tag">${th('tag.global')}</span> ${th('sidebar.preamble')}`;
            sub = th('sidebar.optionCount', {count: b.entries.filter((e) => e.type === 'option').length});
        } else if (b.kind === 'match') {
            title = '<span class="tag match">Match</span> ' + esc(b.patterns);
            sub = '';
        } else if (S.sort === 'hostname' && (S.hostnames[b.id] || hn) && !isGlobalHost(b)) {
            title = `<strong>${esc(S.hostnames[b.id] || hn)}</strong>${port ? `<span class="alias">:${esc(port)}</span>` : ''}`;
            sub = (user ? esc(user) + ' · ' : '') + patterns.map(esc).join(' ');
        } else {
            title = (isGlobalHost(b) ? `<span class="tag">${th('tag.global')}</span> ` : '') +
                `<strong>${esc(patterns[0] || t('block.noPatterns'))}</strong>` +
                patterns.slice(1).map((p) => ` <span class="alias">${esc(p)}</span>`).join('');
            sub = [user && esc(user) + '@', hn && esc(hn), port && ':' + esc(port)].filter(Boolean).join('');
            if (!sub) sub = b.entries.filter((e) => e.type === 'option').slice(0, 2).map((e) => esc(e.key)).join(', ');
        }
        li.innerHTML = `<span class="idx" title="${th('sidebar.position')}">${idx}</span>
            <div class="block-text"><div class="block-title">${title}</div><div class="block-sub">${sub}</div></div>
            ${sev ? `<span class="dot ${sev}" title="${th('sidebar.hasHints')}"></span>` : ''}`;
        li.addEventListener('click', () => select(b.id));
        if (li.draggable) {
            li.addEventListener('dragstart', (ev) => {
                dragData = {kind: 'block', id: b.id};
                ev.dataTransfer.setData('text/plain', 'block:' + b.id);
                ev.dataTransfer.effectAllowed = 'move';
                li.classList.add('dragging');
            });
            li.addEventListener('dragend', () => {
                li.classList.remove('dragging');
                clearDropMarks();
            });
        }
        li.addEventListener('dragover', (ev) => {
            if (!dragData) return;
            if (!fileOrder && dragData.kind === 'group') return;
            ev.preventDefault();
            clearDropMarks();
            if (!fileOrder) {
                li.classList.add('drop-into');
                return;
            }
            const after = dropPosition(li, ev) || b.kind === 'global';
            li.classList.add(after ? 'drop-after' : 'drop-before');
        });
        li.addEventListener('dragleave', () => li.classList.remove('drop-before', 'drop-after', 'drop-into'));
        li.addEventListener('drop', (ev) => {
            ev.preventDefault();
            const after = li.classList.contains('drop-after');
            clearDropMarks();
            const d = dragData;
            dragData = null;
            if (!d) return;
            if (d.kind === 'group') return moveGroupTo(d.name, b.id, after);
            if (d.id === b.id) return;
            const moved = S.config.blocks.find((x) => x.id === d.id);
            if (!moved) return;
            if (!fileOrder) {
                // sorted view: dropping on a host means "same group as this host"
                return setBlockGroup(moved, b.group || '');
            }
            moveBlockTo(d.id, blockIndex(b.id) + (after ? 1 : 0));
        });
        list.appendChild(li);
    }
    $('sort').value = S.sort;
}
