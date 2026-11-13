// Host list: rows in file order or sorted, groups, drag and drop.

import {esc, t, th} from './i18n';
import {blockAction, connectHost, moveBlockTo, select} from './editor';
import {groupKey, groupMembers, groupNames, moveGroupTo, renameGroup, setBlockGroup, markRange, toggleGroup, toggleMark, ungroup} from './groups';
import {$, blockIndex, collator, hasPreamble, isGlobalHost, optionValue, preambleHasOptions, S, splitPatterns} from './state';
import {issuesFor, matchesFilter, worstSeverity} from './sync';
import {toast} from './ui';
import {hostTemplates, saveGroupAsTemplate} from './templateDialogs';

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

// ---- marking (Ctrl/⌘+click): a contiguous run of hosts for "+ Group" ----

// markSequence is the host list as shown, with null for rows a marked run
// cannot span: global blocks and collapsed groups.
export function markSequence() {
    return sidebarRows()
        .filter((r) => r.type === 'block' || (r.type === 'group' && r.collapsed))
        .map((r) => (r.type === 'block' && r.b.kind !== 'global' ? r.b.id : null));
}

// markedIds returns the marked hosts that still exist, in list order.
export function markedIds() {
    const seq = markSequence();
    return S.marked.filter((id) => seq.includes(id)).sort((a, b) => seq.indexOf(a) - seq.indexOf(b));
}

export function clearMarks() {
    if (!S.marked.length) return;
    S.marked = [];
    renderSidebar();
}

// markClick handles Ctrl/⌘+click (add or remove one neighbour) and
// Shift+click (mark everything from the selected host to the clicked one).
function markClick(b, range) {
    if (b.kind === 'global') return;
    const seq = markSequence();
    let next;
    if (range) {
        // anchor: the selected host, else the first host of the current marks
        const anchor = seq.includes(S.selected) ? S.selected : markedIds()[0];
        next = markRange(seq, anchor, b.id);
        if (!next) return toast(t('sidebar.mark.rangeInterrupted'), 'error');
    } else {
        // the selected host starts the run, so Ctrl+click extends from it
        let marked = S.marked;
        if (!marked.length && S.selected !== b.id && seq.includes(S.selected)) marked = [S.selected];
        next = toggleMark(seq, marked, b.id);
        if (!next) return toast(t('sidebar.mark.adjacentOnly'), 'error');
    }
    S.marked = next;
    renderSidebar();
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
                     <button data-gact="template" title="${th('group.saveTemplate')}">☆</button>
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
                    else if (act === 'template') saveGroupAsTemplate(name);
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
        if (S.marked.includes(b.id)) li.classList.add('marked');
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
            ${sev ? `<span class="dot ${sev}" title="${th('sidebar.hasHints')}"></span>` : ''}
            ${b.kind === 'global' ? '' : `<button class="more" title="${th('menu.more')}" aria-label="${th('menu.more')}"
                aria-haspopup="menu" aria-expanded="${blockMenuFor === b.id}" draggable="false">⋮</button>`}`;
        if (blockMenuFor === b.id) li.classList.add('menu-open');
        li.querySelector('.more')?.addEventListener('click', (ev) => {
            ev.stopPropagation();
            if (blockMenuFor === b.id) closeBlockMenu();
            else openBlockMenu(b, ev.currentTarget);
        });
        // Shift+mousedown would otherwise select the text of the rows
        li.addEventListener('mousedown', (ev) => {
            if (ev.shiftKey) ev.preventDefault();
        });
        li.addEventListener('click', (ev) => {
            if (ev.shiftKey) return markClick(b, true);
            if (ev.ctrlKey || ev.metaKey) return markClick(b, false);
            S.marked = [];
            select(b.id);
        });
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

// ---- per-entry menu (⋮) ----

let blockMenuFor = null; // id of the block whose menu is open

export function closeBlockMenu() {
    const menu = $('block-menu');
    if (!menu || menu.hidden) return;
    menu.hidden = true;
    const li = document.querySelector(`.block-item[data-id="${blockMenuFor}"]`);
    li?.classList.remove('menu-open');
    li?.querySelector('.more')?.setAttribute('aria-expanded', 'false');
    blockMenuFor = null;
}

function setupBlockMenu() {
    const menu = document.createElement('div');
    menu.id = 'block-menu';
    menu.className = 'menu floating';
    menu.setAttribute('role', 'menu');
    menu.hidden = true;
    document.body.appendChild(menu);
    menu.addEventListener('click', (ev) => {
        const item = ev.target.closest('[data-act]');
        if (!item || item.disabled) return;
        const b = S.config.blocks.find((x) => x.id === blockMenuFor);
        const anchor = document.querySelector(`.block-item[data-id="${blockMenuFor}"] .more`);
        closeBlockMenu();
        anchor?.focus();
        if (b) blockAction(item.dataset.act, b);
    });
    menu.addEventListener('keydown', (ev) => {
        const items = [...menu.querySelectorAll('[role="menuitem"]:not(:disabled)')];
        const i = items.indexOf(document.activeElement);
        if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
            ev.preventDefault();
            const d = ev.key === 'ArrowDown' ? 1 : -1;
            items[(i + d + items.length) % items.length]?.focus();
        } else if (ev.key === 'Escape' || ev.key === 'Tab') {
            ev.preventDefault();
            ev.stopPropagation();
            const anchor = document.querySelector(`.block-item[data-id="${blockMenuFor}"] .more`);
            closeBlockMenu();
            anchor?.focus();
        }
    });
    document.addEventListener('click', (ev) => {
        if (!ev.target.closest('#block-menu')) closeBlockMenu();
    });
    $('blocks').addEventListener('scroll', closeBlockMenu);
    window.addEventListener('resize', closeBlockMenu);
    window.addEventListener('blur', closeBlockMenu);
    return menu;
}

export function openBlockMenu(b, anchor) {
    const menu = $('block-menu') || setupBlockMenu();
    closeBlockMenu();
    const host = connectHost(b);
    const item = (act, label, {disabled = false, title = '', cls = ''} = {}) =>
        `<button role="menuitem" data-act="${act}" class="${cls}" ${disabled ? 'disabled' : ''} ${title ? `title="${title}"` : ''}>${label}</button>`;
    menu.innerHTML = [
        b.kind === 'host' ? item('connect', `<span class="mi">▶</span>${th('menu.connect')}${host ? ` <code>${esc(host)}</code>` : ''}`,
            {disabled: !host, title: host ? '' : th('menu.connect.disabled')}) : '',
        item('dup', `<span class="mi">⧉</span>${th('editor.duplicate')}`),
        b.kind === 'host' ? '<div class="menu-sep" role="separator"></div>' : '',
        b.kind === 'host' ? item('tplApply', `<span class="mi">⇲</span>${th('menu.applyTemplate')}`,
            {disabled: !hostTemplates().length, title: hostTemplates().length ? '' : th('ta.noHostTemplates')}) : '',
        b.kind === 'host' ? item('tplSave', `<span class="mi">☆</span>${th('menu.saveTemplate')}`) : '',
        '<div class="menu-sep" role="separator"></div>',
        item('del', `<span class="mi">✕</span>${th('editor.delete')}`, {cls: 'danger'}),
    ].join('');
    blockMenuFor = b.id;
    anchor.closest('.block-item')?.classList.add('menu-open');
    anchor.setAttribute('aria-expanded', 'true');
    menu.hidden = false;
    // fixed position below the button, right-aligned, flipped up near the bottom
    const r = anchor.getBoundingClientRect();
    const m = menu.getBoundingClientRect();
    const left = Math.max(4, Math.min(r.right - m.width, window.innerWidth - m.width - 4));
    const top = r.bottom + 4 + m.height > window.innerHeight ? r.top - 4 - m.height : r.bottom + 4;
    menu.style.left = left + 'px';
    menu.style.top = Math.max(4, top) + 'px';
    menu.querySelector('[role="menuitem"]:not(:disabled)')?.focus();
}
