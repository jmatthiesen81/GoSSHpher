// Update notice: asks the backend for a newer GitHub release after start-up.

import * as Go from '../wailsjs/go/main/App';
import {BrowserOpenURL} from '../wailsjs/runtime/runtime';
import {t} from './i18n';
import {$, store} from './state';

let current = null; // UpdateInfo shown in the notice

// checkForUpdate runs in the background: init does not wait for it, and
// errors (no network, rate limit) are ignored, there is just no notice.
export async function checkForUpdate() {
    let info;
    try {
        info = await Go.CheckUpdate();
    } catch {
        return;
    }
    if (!info?.available || store.get('dismissedUpdate', '') === info.latest) return;
    current = info;
    renderUpdateNotice();
    $('update-note').hidden = false;
}

// renderUpdateNotice fills in the texts (again after a language change).
export function renderUpdateNotice() {
    if (!current) return;
    $('update-title').textContent = t('update.available', {latest: current.latest});
    $('update-sub').textContent = t('update.current', {current: current.current});
}

export function setupUpdateNotice() {
    $('update-open').addEventListener('click', () => {
        if (current?.url) BrowserOpenURL(current.url);
    });
    $('update-dismiss').addEventListener('click', () => {
        $('update-note').hidden = true;
        if (current) store.set('dismissedUpdate', current.latest);
    });
}
