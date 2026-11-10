// Translations for the UI. The catalogs live in internal/i18n/locales/*.json
// and are loaded through the Go bindings (Translations, Languages).

let catalog = {};
let current = 'en';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

export function setCatalog(lang, texts) {
    current = lang;
    catalog = texts || {};
    document.documentElement.lang = lang;
}

export const language = () => current;

// t returns the plain text of a key with {placeholders} filled in. Unknown
// keys are returned as they are, so missing translations stay visible.
export function t(key, params = {}) {
    let s = catalog[key] ?? key;
    for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v ?? ''));
    return s;
}

// th returns HTML: keys ending in "_html" contain markup and only their
// parameters are escaped; all other texts are escaped completely.
export function th(key, params = {}) {
    if (!key.endsWith('_html')) return esc(t(key, params));
    const escaped = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, esc(v)]));
    return t(key, escaped);
}

// applyStatic translates the static markup of index.html:
//   data-i18n="key"             → textContent
//   data-i18n-html="key"        → innerHTML (key must end in _html)
//   data-i18n-placeholder="key" → placeholder
//   data-i18n-title="key"       → title
export function applyStatic(root = document) {
    root.querySelectorAll('[data-i18n]').forEach((el) => (el.textContent = t(el.dataset.i18n)));
    root.querySelectorAll('[data-i18n-html]').forEach((el) => (el.innerHTML = th(el.dataset.i18nHtml)));
    root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => (el.placeholder = t(el.dataset.i18nPlaceholder)));
    root.querySelectorAll('[data-i18n-title]').forEach((el) => (el.title = t(el.dataset.i18nTitle)));
}
