// Settings dialog and switching of the UI language.

import * as Go from '../wailsjs/go/main/App';
import {applyStatic, esc, language, setCatalog, t} from './i18n';
import {gdValidate} from './groupDialog';
import {$, S, setCollator} from './state';
import {renderAll, showError} from './sync';
import {setupDatalists, toast} from './ui';
import {renderUpdateNotice} from './update';

// ---- settings dialog ----

export function openSettings() {
    const info = S.settingsInfo;
    $('set-language').innerHTML = S.languages.map((l) =>
        `<option value="${esc(l.code)}" ${l.code === info.settings.language ? 'selected' : ''}>${esc(l.name)}</option>`).join('');
    $('set-backup').checked = info.settings.backup.enabled;
    $('set-keep').value = info.settings.backup.keep;
    $('set-keep').disabled = !info.settings.backup.enabled;
    $('set-terminal').value = info.settings.terminal || '';
    $('set-update').checked = info.settings.updateCheck;
    $('set-path').textContent = info.path || t('settings.noDir');
    $('set-error').textContent = info.error ? t('settings.readError', {error: info.error}) : '';
    $('set-error').hidden = !info.error;
    $('settings').hidden = false;
    $('set-language').focus();
}

export function closeSettings() {
    $('settings').hidden = true;
}

export async function submitSettings() {
    const keep = Math.max(0, Math.min(1000, parseInt($('set-keep').value, 10) || 0));
    try {
        const lang = $('set-language').value;
        const changed = lang !== language();
        S.settingsInfo = await Go.SaveSettings({
            ...S.settingsInfo.settings,
            language: lang,
            backup: {enabled: $('set-backup').checked, keep},
            terminal: $('set-terminal').value,
            updateCheck: $('set-update').checked,
        });
        closeSettings();
        if (changed) await loadLanguage(S.settingsInfo.settings.language);
        toast(t('settings.saved'));
    } catch (e) {
        showError(e);
    }
}

export function setupSettings() {
    $('btn-settings').addEventListener('click', openSettings);
    $('set-backup').addEventListener('change', () => ($('set-keep').disabled = !$('set-backup').checked));
    $('set-ok').addEventListener('click', submitSettings);
    $('set-cancel').addEventListener('click', closeSettings);
    $('settings').addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape') {
            ev.stopPropagation();
            closeSettings();
        } else if (ev.key === 'Enter') {
            ev.preventDefault();
            submitSettings();
        }
    });
}

// loadLanguage switches the UI language at runtime.
export async function loadLanguage(lang, {render = true} = {}) {
    setCatalog(lang, await Go.Translations(lang));
    setCollator(lang);
    applyStatic();
    if (!render || !S.ready) return;
    setupDatalists(S.keywords);
    renderAll();
    renderUpdateNotice();
    if (!$('gdialog').hidden) gdValidate();
}
