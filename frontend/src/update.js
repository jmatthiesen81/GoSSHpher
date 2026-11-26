// Update check: asks the backend for a newer GitHub release after start-up,
// shows the notice in the corner and marks the info button.

import * as Go from '../bindings/gosshpher/app.js';
import {Browser} from '@wailsio/runtime';
import {t} from './i18n';
import {$, store} from './state';

// upd is the state of the last check; the info card shows it too.
// state: 'idle' | 'checking' | 'done' | 'failed'
export const upd = {state: 'idle', info: null};

const listeners = new Set();
// onUpdateChange registers a function called after every state change.
export const onUpdateChange = (fn) => listeners.add(fn);
const changed = () => listeners.forEach((fn) => fn());

// updateBadge: a newer release exists that was not dismissed
export const updateBadge = () => !!upd.info?.available && store.get('dismissedUpdate', '') !== upd.info.latest;

// checkForUpdate runs in the background: init does not wait for it. Errors
// (no network, rate limit) never show a message in the corner; the info card
// says the check failed. With notice=false (check from the info card) the
// corner notice stays hidden, the card shows the result.
export async function checkForUpdate({notice = true} = {}) {
    if (upd.state === 'checking') return;
    upd.state = 'checking';
    changed();
    try {
        upd.info = await Go.CheckUpdate();
        upd.state = 'done';
    } catch {
        upd.state = 'failed';
    }
    renderBadge();
    changed();
    if (notice && updateBadge()) {
        renderUpdateNotice();
        $('update-note').hidden = false;
    }
}

// openRelease opens the release page of the newer version.
export function openRelease() {
    if (upd.info?.url) Browser.OpenURL(upd.info.url);
}

// dismissUpdate hides notice and badge until the next release.
export function dismissUpdate() {
    $('update-note').hidden = true;
    if (upd.info?.latest) store.set('dismissedUpdate', upd.info.latest);
    renderBadge();
    changed();
}

// renderBadge marks the info button and names the new version in its title.
export function renderBadge() {
    const btn = $('btn-about');
    const on = updateBadge();
    btn.classList.toggle('has-update', on);
    btn.title = on ? t('update.available', {latest: upd.info.latest}) : t('toolbar.about.title');
}

// renderUpdateNotice fills in the texts (again after a language change).
export function renderUpdateNotice() {
    renderBadge();
    if (!upd.info?.available) return;
    $('update-title').textContent = t('update.available', {latest: upd.info.latest});
    $('update-sub').textContent = t('update.current', {current: upd.info.current});
}

export function setupUpdateNotice() {
    $('update-open').addEventListener('click', openRelease);
    $('update-dismiss').addEventListener('click', dismissUpdate);
}
