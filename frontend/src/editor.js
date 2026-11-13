// Block editor (patterns, group, comment, options) and block operations.

import * as Go from '../wailsjs/go/main/App';
import {esc, t, th} from './i18n';
import {afterStructureChange, groupKey, groupNames, inferGroup, newGroupFor, renameGroup, setBlockGroup} from './groups';
import {fileName} from './effective';
import {openFileWindow, renderEffective} from './inspector';
import {renderSidebar} from './sidebar';
import {$, blockIndex, blockTitle, isGlobalHost, isWildcard, kw, preambleHasOptions, S, selectedBlock, splitPatterns} from './state';
import {flush, issuesFor, renderAll, scheduleSync, showError, worstSeverity} from './sync';
import {doSave} from './files';
import {issueText, kwDesc, kwDescHtml, modal, toast} from './ui';
import {openApplyDialog, saveBlockAsTemplate, toggleTemplateMenu} from './templateDialogs';

// Small line icons (stroke follows the text colour); emoji such as 🗑 render
// inconsistently across platforms and fonts.
const svg = (body) => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const ICONS = {
    play: svg('<polygon points="7 4 20 12 7 20 7 4"/>'),
    copy: svg('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'),
    trash: svg('<path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/>'),
};

export function select(id, {pattern = null} = {}) {
    if (S.selected !== id) {
        S.selected = id;
        S.effPattern = pattern;
    }
    if (S.view !== 'editor') return;
    renderSidebar();
    renderEditor();
    renderEffective();
    const el = document.querySelector(`.block-item[data-id="${id}"]`);
    el?.scrollIntoView({block: 'nearest'});
}

// ---- editor ----

export function renderEditor() {
    const ed = $('editor');
    const b = selectedBlock();
    if (!b) {
        ed.innerHTML = `<div class="empty">${th('editor.none')}</div>`;
        return;
    }
    const idx = blockIndex(b.id);
    const last = S.config.blocks.length - 1;
    const commentText = b.leading.filter((e) => e.type === 'comment')
        .map((e) => e.text.replace(/^#\s?/, '')).join('\n');

    let header = '';
    if (b.kind === 'global' && !preambleHasOptions(b)) {
        header = `<h1>${th('editor.header.title')}</h1>
        <p class="hint">${th('editor.header.explain_html')}</p>`;
    } else if (b.kind === 'global') {
        header = `<h1>${th('editor.global.title')} <small>${th('editor.global.sub')}</small></h1>
        <p class="explain">${th('editor.global.explain_html')}</p>`;
    } else {
        const isMatch = b.kind === 'match';
        header = `<div class="block-head">
            <label class="kw-label">${isMatch ? 'Match' : 'Host'}</label>
            <input id="ed-patterns" class="patterns" value="${esc(b.patterns)}" spellcheck="false" autocomplete="off"
                placeholder="${th(isMatch ? 'editor.patterns.match' : 'editor.patterns.host')}">
            <div class="block-actions">
                ${isMatch ? '' : `<button id="btn-template" class="template-btn" aria-haspopup="menu" aria-expanded="false"
                    title="${th('editor.template.title')}">${th('editor.template')} ▾</button>
                <button data-act="connect" class="icon-btn" ${connectHost(b) ? '' : 'disabled'}
                    title="${th(connectHost(b) ? 'menu.connect' : 'menu.connect.disabled')}" aria-label="${th('menu.connect')}">${ICONS.play}</button>`}
                <button data-act="dup" class="icon-btn" title="${th('editor.duplicate')}" aria-label="${th('editor.duplicate')}">${ICONS.copy}</button>
                <span class="action-sep" aria-hidden="true"></span>
                <button data-act="first" ${idx <= 1 ? 'disabled' : ''} title="${th('editor.first')}" aria-label="${th('editor.first')}">⇈</button>
                <button data-act="up" ${idx <= 1 && !b.group ? 'disabled' : ''} title="${th('editor.up')}" aria-label="${th('editor.up')}">↑</button>
                <button data-act="down" ${idx >= last && !b.group ? 'disabled' : ''} title="${th('editor.down')}" aria-label="${th('editor.down')}">↓</button>
                <button data-act="last" ${idx >= last ? 'disabled' : ''} title="${th('editor.last')}" aria-label="${th('editor.last')}">⇊</button>
                <span class="action-sep" aria-hidden="true"></span>
                <button data-act="del" class="icon-btn danger" title="${th('editor.delete.title')}" aria-label="${th('editor.delete')}">${ICONS.trash}</button>
            </div>
        </div>
        <div class="hint">${th(isMatch ? 'editor.hint.match_html' : 'editor.hint.host_html')}</div>
        <div id="pattern-chips" class="chips">${renderPatternChips(b)}</div>
        <div class="group-row">
            <label for="ed-group">${th('editor.group')}</label>
            <select id="ed-group">
                <option value="">${th('editor.group.none')}</option>
                ${groupNames().map((g) => `<option value="${esc(g)}" ${groupKey(g) === groupKey(b.group) ? 'selected' : ''}>${esc(g)}</option>`).join('')}
                <option value="__new">${th('editor.group.new')}</option>
            </select>
            ${b.group ? `<button id="btn-rename-group" class="link">${th('editor.group.edit')}</button>` : ''}
        </div>
        <div class="issue-slot" data-slot="-1"></div>`;
        if (isGlobalHost(b)) {
            const atEnd = idx === last;
            header += `<p class="explain">${atEnd
                ? th('editor.globalHost.atEnd_html')
                : th('editor.globalHost.notAtEnd_html', {position: idx})}</p>`;
        }
    }

    ed.innerHTML = `${header}
        ${b.kind === 'global' ? '' : `<label class="field-label" for="ed-comment">${th('editor.comment')} <small>${th('editor.comment.sub')}</small></label>
        <textarea id="ed-comment" class="comment" rows="${Math.max(1, Math.min(6, commentText.split('\n').length))}" spellcheck="false"
            placeholder="${th('editor.comment.placeholder')}">${esc(commentText)}</textarea>`}
        <table class="entries">
            <thead><tr><th class="c-key">${th('editor.col.option')}<span class="col-resizer" title="${th('splitter.title')}"></span></th><th class="c-val">${th('editor.col.value')}</th><th class="c-act"></th></tr></thead>
            <tbody id="entries"></tbody>
        </table>
        <div class="entry-add">
            <button id="btn-add-opt">${th('editor.addOption')}</button>
            <button id="btn-add-comment">${th('editor.addComment')}</button>
            <span class="quick">${th('editor.quick')}
                ${['Hostname', 'User', 'Port', 'IdentityFile', 'ProxyJump', 'RemoteCommand', 'RequestTTY', 'LocalForward']
                    .map((k) => `<button class="link" data-quick="${k}">${k}</button>`).join(' ')}
            </span>
        </div>`;

    renderEntries();
    renderIssueSlots();

    // header events
    const pat = $('ed-patterns');
    if (pat) {
        pat.addEventListener('input', () => {
            b.patterns = pat.value;
            $('pattern-chips').innerHTML = renderPatternChips(b);
            scheduleSync();
        });
    }
    const grp = $('ed-group');
    if (grp) {
        grp.addEventListener('change', async () => {
            if (grp.value === '__new') {
                grp.value = b.group || '';
                return newGroupFor(b);
            }
            setBlockGroup(b, grp.value);
        });
        $('btn-rename-group')?.addEventListener('click', () => renameGroup(b.group));
    }
    $('btn-template')?.addEventListener('click', (ev) => {
        ev.stopPropagation();
        toggleTemplateMenu(b, ev.currentTarget);
    });
    ed.querySelectorAll('.block-actions button[data-act]').forEach((btn) =>
        btn.addEventListener('click', () => blockAction(btn.dataset.act)));
    $('ed-comment')?.addEventListener('input', (ev) => {
        setLeadingComment(b, ev.target.value);
        ev.target.rows = Math.max(1, Math.min(6, ev.target.value.split('\n').length));
        scheduleSync();
    });
    $('btn-add-opt').addEventListener('click', () => addEntry({type: 'option', key: '', value: ''}));
    $('btn-add-comment').addEventListener('click', () => addEntry({type: 'comment', text: '# '}));
    ed.querySelectorAll('[data-quick]').forEach((btn) => btn.addEventListener('click', () => {
        const name = btn.dataset.quick;
        const k = kw(name);
        const existing = b.entries.findIndex((e) => e.type === 'option' && e.key.toLowerCase() === name.toLowerCase());
        if (existing >= 0 && !k?.multi) {
            focusEntry(existing, 'value');
            return;
        }
        addEntry({type: 'option', key: name, value: ''}, 'value');
    }));
}

export function renderPatternChips(b) {
    if (b.kind !== 'host') return '';
    return splitPatterns(b.patterns).map((p) => {
        const cls = p.startsWith('!') ? 'neg' : isWildcard(p) ? 'wild' : 'lit';
        const title = th(p.startsWith('!') ? 'chip.excluded' : isWildcard(p) ? 'chip.pattern' : 'chip.show');
        return `<button class="chip ${cls}" data-pattern="${esc(p)}" title="${title}">${esc(p)}</button>`;
    }).join('');
}

export function setLeadingComment(b, text) {
    const blanks = [];
    for (const e of b.leading) {
        if (e.type !== 'blank') break;
        blanks.push(e);
    }
    const old = b.leading.filter((e) => e.type === 'comment');
    const lines = text === '' ? [] : text.split('\n');
    const comments = lines.map((line, i) => {
        const t = line.trim() === '' ? '#' : '# ' + line;
        // keep raw formatting of unchanged comment lines
        if (old[i] && old[i].text.replace(/^#\s?/, '') === line) return old[i];
        return {type: 'comment', text: t};
    });
    b.leading = [...blanks, ...comments];
}

export function renderEntries() {
    const b = selectedBlock();
    const body = $('entries');
    if (!body) return;
    body.innerHTML = '';
    b.entries.forEach((e, i) => {
        const tr = document.createElement('tr');
        tr.dataset.index = i;
        tr.className = 'entry ' + e.type;
        const actions = `<td class="c-act">
            <button data-eact="up" title="${th('entry.up')}" ${i === 0 ? 'disabled' : ''}>↑</button>
            <button data-eact="down" title="${th('entry.down')}" ${i === b.entries.length - 1 ? 'disabled' : ''}>↓</button>
            <button data-eact="del" class="danger" title="${th('entry.remove')}">✕</button></td>`;
        if (e.type === 'option') {
            const k = kw(e.key);
            const listId = k?.values?.length ? 'vals-' + k.name : '';
            tr.innerHTML = `<td class="c-key"><input class="key" list="kw-list" value="${esc(e.key)}" spellcheck="false" autocomplete="off" placeholder="${th('entry.keyPlaceholder')}"></td>
                <td class="c-val"><input class="val" ${listId ? `list="${listId}"` : ''} value="${esc(e.value)}" spellcheck="false" autocomplete="off" placeholder="${esc(kwDesc(k))}">
                <div class="desc">${kwDescHtml(k)}</div>
                <div class="include-files"></div>
                <div class="issue-slot" data-slot="${i}"></div></td>${actions}`;
            const keyIn = tr.querySelector('.key'), valIn = tr.querySelector('.val');
            const showIncludes = () => renderIncludeFiles(tr.querySelector('.include-files'), e);
            showIncludes();
            keyIn.addEventListener('input', () => {
                e.key = keyIn.value.trim();
                const k2 = kw(e.key);
                tr.querySelector('.desc').innerHTML = kwDescHtml(k2);
                if (k2?.values?.length) valIn.setAttribute('list', 'vals-' + k2.name); else valIn.removeAttribute('list');
                valIn.placeholder = kwDesc(k2);
                scheduleSync();
            });
            keyIn.addEventListener('change', () => {
                const k2 = kw(keyIn.value.trim());
                if (k2 && keyIn.value !== k2.name && !e.raw) {
                    keyIn.value = k2.name;
                    e.key = k2.name;
                    scheduleSync();
                }
            });
            valIn.addEventListener('input', () => {
                e.value = valIn.value;
                scheduleSync();
                clearTimeout(tr.includeTimer);
                tr.includeTimer = setTimeout(showIncludes, 300);
            });
            valIn.addEventListener('keydown', (ev) => {
                if (ev.key === 'Enter' && i === b.entries.length - 1) {
                    ev.preventDefault();
                    addEntry({type: 'option', key: '', value: ''});
                }
            });
        } else if (e.type === 'comment') {
            tr.innerHTML = `<td colspan="2"><input class="comment-in" value="${esc(e.text)}" spellcheck="false"></td>${actions}`;
            const ci = tr.querySelector('input');
            ci.addEventListener('input', () => {
                e.text = ci.value.trim().startsWith('#') ? ci.value : '# ' + ci.value;
                scheduleSync();
            });
        } else {
            tr.innerHTML = `<td colspan="2" class="blank-line">${th('entry.blank')}</td>${actions}`;
        }
        tr.querySelectorAll('[data-eact]').forEach((btn) => btn.addEventListener('click', () => entryAction(i, btn.dataset.eact)));
        body.appendChild(tr);
    });
}

export function renderIssueSlots() {
    const b = selectedBlock();
    if (!b) return;
    document.querySelectorAll('#editor .issue-slot').forEach((slot) => {
        const list = issuesFor(b.id, Number(slot.dataset.slot));
        slot.innerHTML = list.map((i) => `<div class="issue ${i.severity}">${esc(issueText(i))}</div>`).join('');
    });
    document.querySelectorAll('#entries tr.entry').forEach((tr) => {
        const sev = worstSeverity(issuesFor(b.id, Number(tr.dataset.index)));
        tr.classList.remove('sev-error', 'sev-warning', 'sev-info');
        if (sev) tr.classList.add('sev-' + sev);
    });
}

export function focusEntry(i, which = 'key') {
    const tr = document.querySelector(`#entries tr[data-index="${i}"]`);
    const input = tr?.querySelector(which === 'value' ? '.val' : '.key, .comment-in');
    input?.focus();
}

export function addEntry(entry, focus = 'key') {
    const b = selectedBlock();
    // insert before trailing blank lines (they separate this block from the next)
    let at = b.entries.length;
    while (at > 0 && b.entries[at - 1].type === 'blank') at--;
    b.entries.splice(at, 0, entry);
    renderEntries();
    renderIssueSlots();
    focusEntry(at, entry.key ? focus : 'key');
    scheduleSync();
}

export function entryAction(i, act) {
    const b = selectedBlock();
    const list = b.entries;
    if (act === 'del') list.splice(i, 1);
    if (act === 'up' && i > 0) [list[i - 1], list[i]] = [list[i], list[i - 1]];
    if (act === 'down' && i < list.length - 1) [list[i + 1], list[i]] = [list[i], list[i + 1]];
    renderEntries();
    renderIssueSlots();
    scheduleSync(0);
}

// ---- block operations ----

export function moveBlockTo(id, target) {
    const blocks = S.config.blocks;
    const from = blockIndex(id);
    if (from < 1) return;
    target = Math.max(1, Math.min(blocks.length, target));
    const [b] = blocks.splice(from, 1);
    if (target > from) target--;
    blocks.splice(target, 0, b);
    inferGroup(target);
    afterStructureChange(id);
}

// Blocks moved around should keep a blank line in front of them, except
// the first block of an otherwise empty file start.
export function ensureSeparators() {
    const blocks = S.config.blocks;
    blocks.forEach((b, i) => {
        if (b.kind === 'global') return;
        const prev = blocks[i - 1];
        const prevEmpty = i === 1 && prev.entries.length === 0;
        const prevEndsBlank = prev.entries.length && prev.entries[prev.entries.length - 1].type === 'blank';
        const hasBlank = b.leading.length && b.leading[0].type === 'blank';
        if (!hasBlank && !prevEmpty && !prevEndsBlank) b.leading.unshift({type: 'blank'});
        if (hasBlank && prevEmpty) b.leading.shift();
    });
}

// connectHost is the host name "Connect in terminal" uses: the first pattern
// of a Host block that is neither a wildcard nor negated, or '' if none.
export function connectHost(b) {
    if (!b || b.kind !== 'host') return '';
    return splitPatterns(b.patterns).find((p) => !isWildcard(p)) || '';
}

// connectBlock opens a terminal with "ssh <host>". ssh reads the file from
// disk, so unsaved changes are saved first if the user wants.
export async function connectBlock(b) {
    const host = connectHost(b);
    if (!host) return;
    await flush();
    if (S.dirty) {
        const r = await modal(t('connect.unsaved.title'), t('connect.unsaved.text'),
            [t('connect.saveAndConnect'), t('connect.connectAnyway'), t('common.cancel')]);
        if (r === 2) return;
        if (r === 0 && !(await doSave(false))) return;
    }
    try {
        await Go.OpenTerminal(host);
        toast(t('toast.terminalOpened', {host}));
    } catch (e) {
        showError(e);
    }
}

// blockAction runs a block action on the selected block or on the given one
// (actions from the host list menu).
export async function blockAction(act, b = selectedBlock()) {
    if (!b) return;
    const idx = blockIndex(b.id);
    switch (act) {
        case 'first': return moveBlockTo(b.id, 1);
        case 'up': {
            // at a group edge the first step leaves / enters the group in place
            const prev = S.config.blocks[idx - 1];
            if (b.group && groupKey(prev.group) !== groupKey(b.group)) {
                b.group = '';
                return afterStructureChange(b.id);
            }
            if (!b.group && prev.kind !== 'global' && prev.group) {
                b.group = prev.group;
                return afterStructureChange(b.id);
            }
            return moveBlockTo(b.id, idx - 1);
        }
        case 'down': {
            const next = S.config.blocks[idx + 1];
            if (b.group && (!next || groupKey(next.group) !== groupKey(b.group))) {
                b.group = '';
                return afterStructureChange(b.id);
            }
            if (!b.group && next && next.group) {
                b.group = next.group;
                return afterStructureChange(b.id);
            }
            return moveBlockTo(b.id, idx + 2);
        }
        case 'last': return moveBlockTo(b.id, S.config.blocks.length);
        case 'dup': {
            const copy = JSON.parse(JSON.stringify(b));
            copy.id = await Go.NewID();
            copy.headerRaw = '';
            copy.groupStartRaw = '';
            copy.groupEndRaw = '';
            copy.groupStartPos = 0;
            S.config.blocks.splice(idx + 1, 0, copy);
            ensureSeparators();
            S.selected = copy.id;
            renderAll();
            $('ed-patterns')?.focus();
            return scheduleSync(0);
        }
        case 'del': {
            const ok = await modal(t('block.delete.title'), t('block.delete.text', {name: blockTitle(b)}), [t('editor.delete'), t('common.cancel')]);
            if (ok !== 0) return;
            S.config.blocks.splice(idx, 1);
            if (S.selected === b.id) {
                const next = S.config.blocks[Math.min(idx, S.config.blocks.length - 1)];
                S.selected = next.id;
            }
            renderAll();
            return scheduleSync(0);
        }
        case 'connect': return connectBlock(b);
        case 'tplSave': return saveBlockAsTemplate(b);
        case 'tplApply': return openApplyDialog({mode: 'host', blockId: b.id});
    }
}

export async function addBlock(kind) {
    const cur = selectedBlock();
    let at = cur ? blockIndex(cur.id) + 1 : S.config.blocks.length;
    // new hosts should not end up behind a trailing "Host *" defaults block
    const lastBlock = S.config.blocks[S.config.blocks.length - 1];
    if (at === S.config.blocks.length && isGlobalHost(lastBlock) && S.config.blocks.length > 1) at--;
    const b = {
        id: await Go.NewID(),
        kind,
        keyword: kind === 'match' ? 'Match' : 'Host',
        patterns: '',
        headerRaw: '',
        leading: [],
        entries: kind === 'match'
            ? [{type: 'option', key: '', value: ''}]
            : [
                {type: 'option', key: 'Hostname', value: ''},
                {type: 'option', key: 'Port', value: ''},
                {type: 'option', key: 'User', value: ''},
                {type: 'option', key: 'IdentityFile', value: ''},
            ],
    };
    S.config.blocks.splice(at, 0, b);
    if (cur && at === blockIndex(cur.id) + 1 && cur.kind !== 'global') b.group = cur.group || '';
    else inferGroup(at);
    ensureSeparators();
    S.selected = b.id;
    S.filter = '';
    $('filter').value = '';
    renderAll();
    $('ed-patterns')?.focus();
    scheduleSync(0);
}

// renderIncludeFiles lists the files an Include line refers to; a click opens
// one in a new window.
async function renderIncludeFiles(el, entry) {
    if (!el) return;
    if (entry.key.toLowerCase() !== 'include' || !entry.value.trim()) {
        el.innerHTML = '';
        return;
    }
    let files = [];
    try {
        files = await Go.IncludeFiles(entry.value);
    } catch (e) {
        return showError(e);
    }
    el.innerHTML = files.length
        ? `${th('editor.include.files')} ${files.map((f) =>
            `<button class="link include-link" data-file="${esc(f)}" title="${th('eff.openFile')}: ${esc(f)}">${esc(fileName(f))} ↗</button>`).join(' ')}`
        : `<span class="muted">${th('editor.include.none')}</span>`;
    el.querySelectorAll('.include-link').forEach((b) => b.addEventListener('click', () => openFileWindow(b.dataset.file)));
}
