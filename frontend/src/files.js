// File actions (save, reload), editor/text views and the save split button.

import * as Go from '../wailsjs/go/main/App';
import {t} from './i18n';
import {$, blockIndex, S} from './state';
import {applyState, flush, renderAll, renderStatus, showError} from './sync';
import {modal, toast} from './ui';
import {recordChange, resetHistory} from './history';

// ---------------------------------------------------------- file actions ---

// doSave saves the file and returns whether it was saved.
export async function doSave(saveAs = false) {
    await flush();
    try {
        const st = saveAs ? await Go.SaveAs() : await Go.Save();
        applyState(st, {replaceConfig: false});
        renderStatus();
        toast(saveAs ? t('toast.savedAs', {path: S.path}) : t('toast.saved'));
        return true;
    } catch (e) {
        const msg = String(e?.message || e);
        if (msg.includes('CONFLICT')) {
            const r = await modal(t('conflict.title'), t('conflict.text'),
                [t('conflict.overwrite'), t('conflict.reload'), t('common.cancel')]);
            if (r === 0) {
                const st = await Go.SaveForce();
                applyState(st, {replaceConfig: false});
                renderStatus();
                toast(t('toast.saved'));
                return true;
            } else if (r === 1) {
                applyState(await Go.Reload());
                resetHistory();
                renderAll();
            }
        } else {
            showError(e);
        }
        return false;
    }
}

export async function confirmDiscard() {
    await flush();
    if (!S.dirty) return true;
    return (await modal(t('discard.title'), t('discard.text'), [t('discard.ok'), t('common.cancel')])) === 0;
}

// --------------------------------------------------------------- views ---

export async function setView(view) {
    if (view === S.view) return;
    if (view === 'text') {
        await flush();
        $('text').value = S.text;
        S.textDirty = false;
    } else if (S.textDirty) {
        await applyText();
    }
    S.view = view;
    $('view-editor').hidden = view !== 'editor';
    $('view-text').hidden = view !== 'text';
    $('tab-editor').classList.toggle('active', view === 'editor');
    $('tab-text').classList.toggle('active', view === 'text');
    if (view === 'editor') renderAll();
}

export async function applyText() {
    const keepIdx = blockIndex(S.selected);
    const st = await Go.ParseText($('text').value);
    applyState(st);
    recordChange(null); // applying the text view is one undo step
    const b = S.config.blocks[Math.min(keepIdx, S.config.blocks.length - 1)];
    if (keepIdx >= 0 && b) S.selected = b.id;
    S.textDirty = false;
    $('text').value = S.text;
    renderStatus();
    toast(t('toast.textApplied'));
}

// ---- save split button ----

export function closeSaveMenu() {
    $('save-menu').hidden = true;
    $('btn-save-menu').setAttribute('aria-expanded', 'false');
}

export function setupSaveMenu() {
    $('btn-save-menu').addEventListener('click', (ev) => {
        ev.stopPropagation();
        const open = $('save-menu').hidden;
        $('save-menu').hidden = !open;
        $('btn-save-menu').setAttribute('aria-expanded', String(open));
        if (open) $('btn-saveas').focus();
    });
    document.addEventListener('click', (ev) => {
        if (!ev.target.closest('#save-split')) closeSaveMenu();
    });
    $('save-split').addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape' && !$('save-menu').hidden) {
            ev.stopPropagation();
            closeSaveMenu();
            $('btn-save-menu').focus();
        }
    });
}
