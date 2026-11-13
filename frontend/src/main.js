import './style.css';
import * as Go from '../wailsjs/go/main/App';
import {t} from './i18n';
import {addBlock, blockAction, select} from './editor';
import {applyText, closeSaveMenu, confirmDiscard, doSave, setupSaveMenu, setView} from './files';
import {openGroupDialog, setupGroupDialog} from './groupDialog';
import {newGroupFor} from './groups';
import {inspectorTab, renderEffective, scheduleResolve} from './inspector';
import {loadLanguage, setupSettings} from './settings';
import {clearMarks, markedIds, renderSidebar} from './sidebar';
import {setupSplitters} from './splitters';
import {$, DEFAULT_WIDTHS, S, selectedBlock, store} from './state';
import {applyState, matchesFilter, renderAll, showError} from './sync';
import {setupDatalists, toast} from './ui';
import {redo, resetHistory, undo} from './history';
import {checkForUpdate, setupUpdateNotice} from './update';

// ---------------------------------------------------------------- init ---

async function init() {
    S.settingsInfo = await Go.GetSettings();
    S.languages = await Go.Languages();
    await loadLanguage(S.settingsInfo.settings.language, {render: false});
    S.ui = S.settingsInfo.settings.ui || {};
    setupSettings();
    S.sort = store.get('sort', 'file');
    S.collapsed = new Set(store.get('collapsed', []));
    S.widths = {...DEFAULT_WIDTHS, ...store.get('widths', {})};
    setupSplitters();
    setupGroupDialog();
    $('sort').addEventListener('change', (ev) => {
        S.sort = ev.target.value;
        store.set('sort', S.sort);
        renderSidebar();
    });
    $('btn-add-group').addEventListener('click', () => {
        // marked hosts (Ctrl/⌘+click) take precedence over the selected one
        const marked = markedIds();
        if (marked.length) openGroupDialog({members: marked});
        else newGroupFor(selectedBlock());
    });
    S.keywords = await Go.Keywords();
    S.keywords.forEach((k) => S.kwIndex.set(k.name.toLowerCase(), k));
    setupDatalists(S.keywords);
    S.ready = true;
    applyState(await Go.GetState());
    resetHistory();
    renderAll();
    setupUpdateNotice();
    checkForUpdate(); // not awaited: must never delay or block the start

    $('btn-save').addEventListener('click', () => doSave(false));
    $('btn-saveas').addEventListener('click', () => {
        closeSaveMenu();
        doSave(true);
    });
    setupSaveMenu();
    $('btn-undo').addEventListener('click', undo);
    $('btn-redo').addEventListener('click', redo);
    $('btn-reload').addEventListener('click', async () => {
        if (!(await confirmDiscard())) return;
        try {
            applyState(await Go.Reload());
            resetHistory();
            renderAll();
            toast(t('toast.reloaded'));
        } catch (e) {
            showError(e);
        }
    });
    $('btn-open').addEventListener('click', async () => {
        if (!(await confirmDiscard())) return;
        try {
            const st = await Go.Open();
            S.selected = null;
            applyState(st);
            resetHistory();
            renderAll();
        } catch (e) {
            showError(e);
        }
    });
    $('btn-add-host').addEventListener('click', () => addBlock('host'));
    $('btn-add-match').addEventListener('click', () => addBlock('match'));
    $('filter').addEventListener('input', (ev) => {
        S.filter = ev.target.value;
        renderSidebar();
    });
    $('tab-editor').addEventListener('click', () => setView('editor'));
    $('tab-text').addEventListener('click', () => setView('text'));
    $('text').addEventListener('input', () => (S.textDirty = true));
    $('btn-apply-text').addEventListener('click', applyText);

    $('itab-eff').addEventListener('click', () => inspectorTab('eff'));
    $('itab-issues').addEventListener('click', () => inspectorTab('issues'));
    $('eff-form').addEventListener('submit', (ev) => ev.preventDefault());
    $('eff-host').addEventListener('input', () => {
        S.effPattern = $('eff-host').value.trim();
        scheduleResolve(200);
    });
    $('eff-user').addEventListener('input', () => scheduleResolve(200));
    $('editor').addEventListener('click', (ev) => {
        const chip = ev.target.closest('#pattern-chips .chip.lit');
        if (!chip) return;
        $('eff-host').value = chip.dataset.pattern;
        S.effPattern = chip.dataset.pattern;
        inspectorTab('eff');
        renderEffective();
    });

    document.addEventListener('keydown', (ev) => {
        const mod = ev.ctrlKey || ev.metaKey;
        if (mod && ev.key.toLowerCase() === 's') {
            ev.preventDefault();
            if (S.view === 'text' && S.textDirty) applyText().then(() => doSave(false));
            else doSave(false);
        } else if (mod && ['z', 'y'].includes(ev.key.toLowerCase()) && S.view === 'editor' && !(ev.target instanceof Element && ev.target.closest('.modal'))) {
            // the app history replaces the input fields' own undo in the editor
            ev.preventDefault();
            if (ev.key.toLowerCase() === 'y' || ev.shiftKey) redo();
            else undo();
        } else if (mod && ev.key.toLowerCase() === 'f' && S.view === 'editor') {
            ev.preventDefault();
            $('filter').focus();
            $('filter').select();
        } else if (ev.altKey && (ev.key === 'ArrowUp' || ev.key === 'ArrowDown') && S.view === 'editor') {
            const b = selectedBlock();
            if (!b || b.kind === 'global') return;
            ev.preventDefault();
            blockAction(ev.key === 'ArrowUp' ? 'up' : 'down');
        } else if (ev.key === 'Escape' && S.marked.length && !(ev.target instanceof Element && ev.target.closest('.modal, input, textarea, select'))) {
            clearMarks();
        }
    });
    $('filter').addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') {
            const first = S.config.blocks.find((b) => b.kind !== 'global' && matchesFilter(b));
            if (first) select(first.id);
        }
    });
}

init().catch(showError);
