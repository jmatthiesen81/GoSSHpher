// Colour scheme and loading screen.
//
// The Go side decides the theme (theme.go): /theme.js sets data-theme on <html>
// before the first paint, and the "theme:changed" event reports later changes
// of the system theme. The prefers-color-scheme media query is only the
// fallback when the page runs without the Go side (plain `vite` in a browser);
// WebKitGTK 6.0 with older GTK4 versions reports it wrongly.
import {Events} from '@wailsio/runtime';

const THEME_EVENT = 'theme:changed';

export function applyTheme(name) {
    document.documentElement.dataset.theme = name === 'dark' ? 'dark' : 'light';
}

export function setupTheme() {
    if (!document.documentElement.dataset.theme) {
        applyTheme(window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    }
    Events.On(THEME_EVENT, (ev) => applyTheme(ev.data));
}

// Fades the loading screen out and removes it.
export function hideSplash() {
    const el = document.getElementById('splash');
    if (!el || el.classList.contains('done')) return;
    el.addEventListener('transitionend', () => el.remove(), {once: true});
    setTimeout(() => el.remove(), 1000); // in case no transition runs
    el.classList.add('done');
}
