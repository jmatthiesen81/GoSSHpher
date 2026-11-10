// Synchronisation with the Go backend and rendering of the status line.

import * as Go from '../wailsjs/go/main/App';
import {t} from './i18n';
import {renderEditor, renderIssueSlots} from './editor';
import {renderEffective, renderIssues} from './inspector';
import {renderSidebar} from './sidebar';
import {$, optionValue, S} from './state';
import {toast} from './ui';
import {recordChange} from './history';

// ------------------------------------------------------------- backend ---

export function applyState(st, {replaceConfig = true} = {}) {
    S.path = st.path;
    if (replaceConfig) {
        S.config = st.config;
        S.config.blocks.forEach((b) => {
            b.leading = b.leading || [];
            b.entries = b.entries || [];
        });
    }
    S.text = st.text;
    S.dirty = st.dirty;
    S.issues = st.issues || [];
    S.hostnames = st.hostnames || {};
    if (!S.config.blocks.some((b) => b.id === S.selected)) {
        S.selected = (S.config.blocks.find((b) => b.kind !== 'global') || S.config.blocks[0]).id;
        S.effPattern = null;
    }
}

export let syncTimer = null;
export let syncPromise = Promise.resolve();

// scheduleSync sends the edited config to Go (debounced) and refreshes
// everything that depends on it, without touching the focused inputs.
export function scheduleSync(delay = 250) {
    // typing (delayed sync) in the same field is coalesced into one undo step
    recordChange(delay > 0 ? document.activeElement : null);
    S.dirty = true;
    renderStatus();
    clearTimeout(syncTimer);
    syncTimer = setTimeout(sync, delay);
}

export function sync() {
    clearTimeout(syncTimer);
    syncPromise = syncPromise.then(async () => {
        const st = await Go.Update(S.config);
        applyState(st, {replaceConfig: false});
        renderStatus();
        renderSidebar();
        renderIssueSlots();
        renderIssues();
        renderEffective();
    }).catch(showError);
    return syncPromise;
}

export async function flush() {
    if (syncTimer) await sync();
    await syncPromise;
}

export function showError(err) {
    console.error(err);
    toast(String(err?.message || err), 'error');
}

// --------------------------------------------------------------- render ---

export function renderAll() {
    renderStatus();
    renderSidebar();
    renderEditor();
    renderIssues();
    renderEffective();
}

export function renderStatus() {
    $('path').textContent = S.path;
    $('dirty').hidden = !S.dirty;
    const n = S.issues.filter((i) => i.severity !== 'info').length;
    $('issue-count').textContent = S.issues.length ? String(S.issues.length) : '';
    $('issue-count').className = 'count' + (n ? ' warn' : '');
}

export function issuesFor(blockId, entry) {
    return S.issues.filter((i) => i.blockId === blockId && (entry === undefined || i.entry === entry));
}

export function worstSeverity(list) {
    if (list.some((i) => i.severity === 'error')) return 'error';
    if (list.some((i) => i.severity === 'warning')) return 'warning';
    return list.length ? 'info' : '';
}

export function matchesFilter(b) {
    const f = S.filter.trim().toLowerCase();
    if (!f) return true;
    if (b.kind === 'global') return t('block.global').toLowerCase().includes(f);
    const hay = [b.patterns, optionValue(b, 'Hostname'), optionValue(b, 'User'),
        ...b.leading.map((e) => e.text || '')].join(' ').toLowerCase();
    return f.split(/\s+/).every((t) => hay.includes(t));
}
