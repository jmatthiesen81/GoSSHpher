// Dialog to create or edit a group: name plus hosts as tokens with autocompletion.

import * as Go from '../wailsjs/go/main/App';
import {esc, t, th} from './i18n';
import {afterStructureChange, groupKey, groupMembers, groupNameError, ungroup} from './groups';
import {$, blockIndex, collator, optionValue, S, splitPatterns, store} from './state';
import {flush, showError} from './sync';
import {toast} from './ui';
import {groupTemplates, openApplyDialog} from './templateDialogs';

// ---- group dialog (name + hosts as tokens with autocompletion) ----

export const GD = {
    oldName: '',      // '' for a new group
    members: [],      // block ids
    active: -1,       // highlighted suggestion
    suggestions: [],  // blocks
    confirmed: false, // effect changes acknowledged
    open: false,      // suggestion list visible
};

export function blockLabel(b) {
    if (b.kind === 'match') return 'Match ' + b.patterns;
    return splitPatterns(b.patterns)[0] || t('block.noPatterns');
}

export function openGroupDialog({name = '', members = []} = {}) {
    GD.oldName = name;
    GD.members = members.filter((id) => S.config.blocks.some((b) => b.id === id && b.kind !== 'global'));
    GD.confirmed = false;
    $('gd-title').textContent = name ? t('gd.titleEdit', {name}) : t('gd.titleNew');
    $('gd-name').value = name;
    $('gd-input').value = '';
    $('gd-changes').hidden = true;
    const tpls = name ? [] : groupTemplates();
    $('gd-template-row').hidden = !tpls.length;
    $('gd-template').innerHTML = `<option value="">${th('gd.fromTemplate.none')}</option>` +
        tpls.map((x) => `<option value="${esc(x.name)}">${esc(x.name)}</option>`).join('');
    renderTokens();
    closeSuggest();
    gdValidate();
    $('gdialog').hidden = false;
    (name ? $('gd-input') : $('gd-name')).focus();
}

export function closeGroupDialog() {
    $('gdialog').hidden = true;
    closeSuggest();
}

export function gdValidate() {
    const err = groupNameError($('gd-name').value, GD.oldName);
    const show = err && $('gd-name').value.trim() !== '';
    $('gd-name-error').textContent = err;
    $('gd-name-error').hidden = !show;
    const noHosts = GD.members.length === 0;
    $('gd-ok').disabled = !!err || (noHosts && !GD.oldName);
    if (noHosts && GD.oldName) $('gd-ok').textContent = t('gd.dissolve');
    else $('gd-ok').textContent = t(GD.confirmed ? 'gd.applyAnyway' : (GD.oldName ? 'gd.apply' : 'gd.create'));
    return !err;
}

export function renderTokens() {
    const box = $('gd-tokens');
    box.querySelectorAll('.token').forEach((t) => t.remove());
    const input = $('gd-input');
    GD.members.forEach((id) => {
        const b = S.config.blocks.find((x) => x.id === id);
        if (!b) return;
        const others = splitPatterns(b.patterns).length - 1;
        const t = document.createElement('span');
        t.className = 'token';
        t.title = b.patterns;
        t.innerHTML = `${esc(blockLabel(b))}${others > 0 ? ` <small>+${others}</small>` : ''} <small>#${blockIndex(b.id)}</small>
            <button type="button" tabindex="-1" title="${th('gd.remove')}" aria-label="${th('gd.removeAria', {name: blockLabel(b)})}">×</button>`;
        t.querySelector('button').addEventListener('click', () => removeMember(id));
        box.insertBefore(t, input);
    });
}

export function addMember(id) {
    if (!GD.members.includes(id)) GD.members.push(id);
    GD.confirmed = false;
    $('gd-changes').hidden = true;
    $('gd-input').value = '';
    renderTokens();
    gdValidate();
    closeSuggest();
}

export function removeMember(id) {
    GD.members = GD.members.filter((x) => x !== id);
    GD.confirmed = false;
    $('gd-changes').hidden = true;
    renderTokens();
    gdValidate();
    $('gd-input').focus();
}

export function updateSuggest({showAll = false} = {}) {
    const q = $('gd-input').value.trim().toLowerCase();
    if (!q && !showAll) return closeSuggest();
    const terms = q.split(/\s+/).filter(Boolean);
    const candidates = S.config.blocks.filter((b) => b.kind !== 'global' && !GD.members.includes(b.id));
    const hay = (b) => [b.patterns, optionValue(b, 'Hostname'), optionValue(b, 'User'), b.group || ''].join(' ').toLowerCase();
    const score = (b) => {
        const first = blockLabel(b).toLowerCase();
        if (!q) return 3;
        if (first.startsWith(q)) return 0;
        if (splitPatterns(b.patterns).some((p) => p.toLowerCase().startsWith(q))) return 1;
        return 2;
    };
    GD.suggestions = candidates
        .filter((b) => terms.every((t) => hay(b).includes(t)))
        .sort((a, b) => score(a) - score(b) || collator.compare(blockLabel(a), blockLabel(b)))
        .slice(0, 50);
    GD.active = GD.suggestions.length ? 0 : -1;
    renderSuggest();
}

export function renderSuggest() {
    const ul = $('gd-suggest');
    if (!GD.suggestions.length) {
        ul.innerHTML = $('gd-input').value.trim() ? `<li class="none">${th('gd.noMatch')}</li>` : '';
        ul.hidden = !$('gd-input').value.trim();
        GD.open = !ul.hidden;
        $('gd-input').setAttribute('aria-expanded', String(!ul.hidden));
        return;
    }
    ul.innerHTML = GD.suggestions.map((b, i) => {
        const pats = splitPatterns(b.patterns);
        const hn = optionValue(b, 'Hostname'), user = optionValue(b, 'User');
        const idf = !user ? optionValue(b, 'IdentityFile').split('/').pop() : '';
        const inGroup = b.group && groupKey(b.group) !== groupKey(GD.oldName);
        return `<li role="option" data-i="${i}" class="${i === GD.active ? 'active' : ''}" aria-selected="${i === GD.active}">
            <span class="s-main"><strong>${esc(blockLabel(b))}</strong>${pats.slice(1).map((p) => ` <span class="alias">${esc(p)}</span>`).join('')}</span>
            <span class="s-sub">${esc([user && user + '@', hn].filter(Boolean).join(''))}${idf ? ` <span class="alias">🔑 ${esc(idf)}</span>` : ''}
            ${inGroup ? `<span class="tag">${th('gd.fromGroup', {group: b.group})}</span>` : ''} <span class="idx">#${blockIndex(b.id)}</span></span></li>`;
    }).join('');
    ul.hidden = false;
    GD.open = true;
    $('gd-input').setAttribute('aria-expanded', 'true');
    ul.querySelectorAll('li[data-i]').forEach((li) => {
        // mousedown keeps the focus in the input
        li.addEventListener('mousedown', (ev) => {
            ev.preventDefault();
            addMember(GD.suggestions[Number(li.dataset.i)].id);
        });
    });
    ul.querySelector('li.active')?.scrollIntoView({block: 'nearest'});
}

export function closeSuggest() {
    GD.open = false;
    $('gd-suggest').hidden = true;
    $('gd-input').setAttribute('aria-expanded', 'false');
    GD.active = -1;
}

// planGroup computes the new block order and groups without touching the
// current config. Members are gathered (in file order) at the position of
// the first of them; hosts removed from an existing group are put directly
// behind it.
export function planGroup(name, oldName, memberIds) {
    const blocks = S.config.blocks;
    const set = new Set(memberIds);
    const removed = oldName ? groupMembers(oldName).filter((b) => !set.has(b.id)) : [];
    const members = blocks.filter((b) => set.has(b.id));
    const moving = new Set([...members, ...removed]);
    const groupOf = new Map();
    members.forEach((b) => groupOf.set(b.id, name));
    removed.forEach((b) => groupOf.set(b.id, ''));

    const rest = blocks.filter((b) => !moving.has(b));
    const anchor = blocks.findIndex((b) => moving.has(b));
    let t = blocks.slice(0, anchor).filter((b) => !moving.has(b)).length;
    // never land inside another group
    while (t > 0 && t < rest.length && rest[t].kind !== 'global' && rest[t].group &&
           groupKey(rest[t - 1].group) === groupKey(rest[t].group)) t++;
    rest.splice(Math.max(1, t), 0, ...members, ...removed);
    return rest.map((b) => (groupOf.has(b.id) ? {...b, group: groupOf.get(b.id)} : b));
}

export async function submitGroupDialog() {
    if (!gdValidate()) return;
    const name = $('gd-name').value.trim();
    if (!GD.members.length && GD.oldName) {
        closeGroupDialog();
        return ungroup(GD.oldName);
    }
    const blocks = planGroup(name, GD.oldName, GD.members);
    if (!GD.confirmed) {
        await flush();
        let changes = [];
        try {
            changes = await Go.PreviewChanges({...S.config, blocks});
        } catch (e) {
            return showError(e);
        }
        if (changes.length) {
            GD.confirmed = true;
            const shown = changes.slice(0, 12);
            $('gd-changes').innerHTML = `<div class="issue warning">${th('gd.changes.intro')}</div>
                <table class="eff">${shown.map((c) => `<tr><th>${esc(c.host)}</th><td><code>${esc(c.key)}</code>:
                <span class="before">${esc(c.before || '–')}</span> → <strong>${esc(c.after || '–')}</strong></td></tr>`).join('')}</table>
                ${changes.length > shown.length ? `<div class="hint">${th('gd.changes.more', {count: changes.length - shown.length})}</div>` : ''}`;
            $('gd-changes').hidden = false;
            gdValidate();
            return;
        }
    }
    S.config.blocks = blocks;
    if (GD.oldName && groupKey(GD.oldName) !== groupKey(name) && S.collapsed.has(groupKey(GD.oldName))) {
        S.collapsed.delete(groupKey(GD.oldName));
        S.collapsed.add(groupKey(name));
        store.set('collapsed', [...S.collapsed]);
    }
    closeGroupDialog();
    afterStructureChange(GD.members.includes(S.selected) || !GD.members.length ? S.selected : GD.members[0]);
    toast(t(GD.oldName ? 'toast.groupUpdated' : 'toast.groupCreated', {name}));
}

export function setupGroupDialog() {
    $('gd-name').addEventListener('input', gdValidate);
    $('gd-name').addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') {
            ev.preventDefault();
            $('gd-input').focus();
        }
    });
    const input = $('gd-input');
    input.addEventListener('input', () => updateSuggest());
    input.addEventListener('focus', () => updateSuggest());
    input.addEventListener('blur', () => setTimeout(closeSuggest, 100));
    input.addEventListener('keydown', (ev) => {
        const n = GD.suggestions.length;
        if (ev.key === 'ArrowDown' && !GD.open) {
            ev.preventDefault();
            updateSuggest({showAll: true});
        } else if (ev.key === 'ArrowDown' && n) {
            ev.preventDefault();
            GD.active = (GD.active + 1) % n;
            renderSuggest();
        } else if (ev.key === 'ArrowUp' && n) {
            ev.preventDefault();
            GD.active = (GD.active - 1 + n) % n;
            renderSuggest();
        } else if ((ev.key === 'Enter' || ev.key === 'Tab') && GD.open && GD.active >= 0 && GD.suggestions.length) {
            ev.preventDefault();
            addMember(GD.suggestions[GD.active].id);
        } else if (ev.key === 'Enter' && !input.value.trim() && !GD.open) {
            ev.preventDefault();
            submitGroupDialog();
        } else if (ev.key === 'Backspace' && !input.value && GD.members.length) {
            removeMember(GD.members[GD.members.length - 1]);
        } else if (ev.key === 'Escape' && GD.open) {
            ev.stopPropagation();
            closeSuggest();
        }
    });
    // paste several names at once: "a.example b.example, c.example"
    input.addEventListener('paste', (ev) => {
        const text = ev.clipboardData?.getData('text') || '';
        const names = text.split(/[\s,;]+/).map((s) => s.toLowerCase()).filter(Boolean);
        if (names.length < 2) return;
        ev.preventDefault();
        const missing = [];
        names.forEach((n) => {
            const b = S.config.blocks.find((x) => x.kind === 'host' && splitPatterns(x.patterns).some((p) => p.toLowerCase() === n));
            if (b) {
                if (!GD.members.includes(b.id)) GD.members.push(b.id);
            } else missing.push(n);
        });
        GD.confirmed = false;
        renderTokens();
        gdValidate();
        if (missing.length) toast(t('gd.notFound', {names: missing.join(', ')}), 'error');
    });
    $('gd-tokens').addEventListener('mousedown', (ev) => {
        if (ev.target === $('gd-tokens')) {
            ev.preventDefault();
            input.focus();
        }
    });
    $('gd-template').addEventListener('change', (ev) => {
        const name = ev.target.value;
        if (!name) return;
        closeGroupDialog();
        openApplyDialog({mode: 'group', name});
    });
    $('gd-ok').addEventListener('click', submitGroupDialog);
    $('gd-cancel').addEventListener('click', closeGroupDialog);
    $('gdialog').addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape') {
            ev.stopPropagation();
            closeGroupDialog();
        }
    });
}
