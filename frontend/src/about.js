// Info card: name, version, update state, publisher and links.

import * as Go from '../bindings/gosshpher/app.js';
import {Browser} from '@wailsio/runtime';
import {esc, language, t} from './i18n';
import {$} from './state';
import {checkForUpdate, dismissUpdate, onUpdateChange, openRelease, upd, updateBadge} from './update';

let about = null; // AboutInfo, loaded on first open
let opener = null; // element focused before the card opened

const strip = (url) => String(url || '').replace(/^https:\/\//, '');

// links open in the system browser
function links(a) {
    const repo = a.repoUrl || '';
    return [
        {key: 'about.website', text: strip(a.website), url: a.website},
        {key: 'about.source', text: strip(repo), url: repo},
        {key: 'about.docs', text: t('about.docsLink'), url: `${repo}/tree/main/docs/${language() === 'de' ? 'de' : 'en'}`},
        {key: 'about.license', text: a.license, url: `${repo}/blob/main/LICENSE`},
        {key: 'about.changelog', text: t('about.changelogLink'), url: `${repo}/blob/main/CHANGELOG.md`},
    ];
}

// updateHtml: symbol and text, never colour alone
function updateHtml() {
    const info = upd.info;
    const line = (sym, text) => `<span aria-hidden="true">${sym}</span> <span>${esc(text)}</span>`;
    let html;
    if (upd.state === 'checking') html = line('◐', t('about.update.checking'));
    else if (upd.state === 'failed') html = line('○', t('about.update.failed'));
    else if (info?.skipped === 'dev') html = line('○', t('about.update.dev'));
    else if (info?.skipped === 'disabled') html = line('○', t('about.update.disabled'));
    else if (info?.available) {
        return line('★', t('update.available', {latest: info.latest})) +
            '<span class="spacer"></span>' +
            `<button class="primary" data-act="open">${esc(t('update.open'))}</button>` +
            (updateBadge() ? `<button data-act="dismiss">${esc(t('update.dismiss'))}</button>` : '');
    } else if (upd.state === 'done') html = line('●', t('about.update.current'));
    else html = line('○', t('about.update.idle'));
    html += '<span class="spacer"></span>';
    if (info?.skipped !== 'dev') {
        html += `<button class="link" data-act="check" ${upd.state === 'checking' ? 'disabled' : ''}>${esc(t('about.update.again'))}</button>`;
    }
    return html;
}

export function renderAbout() {
    if ($('about').hidden || !about) return;
    const a = about;
    $('about-name').textContent = a.name;
    $('about-version').textContent = a.version;
    const box = $('about-update');
    box.className = 'about-update' + (upd.info?.available ? ' new' : '');
    box.innerHTML = updateHtml();
    const build = [a.platform, a.go, a.wails && `Wails ${a.wails}`].filter(Boolean).join(' · ');
    $('about-list').innerHTML =
        `<dt>${esc(t('about.publisher'))}</dt><dd>${esc(a.publisher)}</dd>` +
        links(a).map((l, i) =>
            `<dt>${esc(t(l.key))}</dt><dd><button class="link" data-link="${i}">${esc(l.text)}</button></dd>`).join('') +
        `<dt>${esc(t('about.build'))}</dt><dd class="mono small">${esc(build)}</dd>`;
    $('about-copy').textContent = `© ${Math.max(2026, new Date().getFullYear())} ${a.publisher}`;
}

export async function openAbout() {
    opener = document.activeElement;
    if (!about) about = await Go.About();
    $('about').hidden = false;
    renderAbout();
    $('about-close').focus();
    // a failed or never run check (setting off at start) is repeated here
    if (upd.state === 'idle' || upd.state === 'failed') checkForUpdate({notice: false});
}

export function closeAbout() {
    $('about').hidden = true;
    if (opener instanceof HTMLElement) opener.focus();
}

export function setupAbout() {
    onUpdateChange(renderAbout);
    $('btn-about').addEventListener('click', () => openAbout().catch(() => {}));
    $('about-close').addEventListener('click', closeAbout);
    $('about').addEventListener('click', (ev) => {
        if (ev.target === $('about')) return closeAbout();
        const btn = ev.target.closest('button[data-act], button[data-link]');
        if (!btn) return;
        if (btn.dataset.link) {
            const l = links(about)[Number(btn.dataset.link)];
            if (l?.url) Browser.OpenURL(l.url);
        } else if (btn.dataset.act === 'open') openRelease();
        else if (btn.dataset.act === 'dismiss') dismissUpdate();
        else if (btn.dataset.act === 'check') checkForUpdate({notice: false});
    });
    $('about').addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape') {
            ev.stopPropagation();
            closeAbout();
        }
    });
}
