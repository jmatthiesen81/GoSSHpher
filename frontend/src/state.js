// Shared state, small helpers about blocks and the persistence of view settings.

import * as Go from '../wailsjs/go/main/App';
import {t} from './i18n';
import {showError} from './sync';

// ---------------------------------------------------------------- state ---

export const S = {
    path: '',
    config: null,      // {blocks:[], newline, finalNewline}
    text: '',
    dirty: false,
    issues: [],
    hostnames: {},         // block id -> effective Hostname (from Go)
    execAssume: {},        // Match exec: expanded command -> assumed success
    execRuns: {},          // Match exec: expanded command -> result of a run
    keywords: [],
    kwIndex: new Map(), // lower name -> keyword
    selected: null,    // block id
    filter: '',
    view: 'editor',
    textDirty: false,
    effPattern: null,
    sort: 'file',          // file | alias | hostname
    collapsed: new Set(),  // collapsed group keys
    widths: null,
    ui: {},                // view settings from the settings file
    settingsInfo: null,    // {settings, path, error}
    languages: [],         // [{code, name}]
    ready: false,
};

export const DEFAULT_WIDTHS = {side: 300, insp: 380, key: 220};

export const $ = (id) => document.getElementById(id);

export function splitPatterns(s) {
    return (s || '').trim().split(/\s+/).filter(Boolean);
}

export const isWildcard = (p) => /[*?!]/.test(p);
export const blockIndex = (id) => S.config.blocks.findIndex((b) => b.id === id);
export const selectedBlock = () => S.config.blocks.find((b) => b.id === S.selected) || null;
export const kw = (name) => S.kwIndex.get(String(name || '').toLowerCase());

export function isGlobalHost(b) {
    return b.kind === 'host' && splitPatterns(b.patterns).every((p) => p === '*');
}

export function blockTitle(b) {
    if (b.kind === 'global') return t('block.global');
    if (b.kind === 'match') return 'Match ' + (b.patterns || '');
    return b.patterns || t('block.noPatterns');
}

export const hasPreamble = (b) => b.kind === 'global' && b.entries.some((e) => e.type !== 'blank');
// a preamble without options is only the file header (comments)
export const preambleHasOptions = (b) => b.entries.some((e) => e.type === 'option');

export function optionValue(b, key) {
    const e = b.entries.find((e) => e.type === 'option' && e.key.toLowerCase() === key.toLowerCase());
    return e ? e.value : '';
}

// sorting of host names, follows the UI language
export let collator = new Intl.Collator('en', {numeric: true, sensitivity: 'base'});

export function setCollator(lang) {
    collator = new Intl.Collator(lang, {numeric: true, sensitivity: 'base'});
}

// ---- persistence (per-viewer UI settings) ----

// View settings (sort, collapsed groups, widths) live in the settings file in
// the user's config directory (see settings.go), saved debounced.
export let uiSaveTimer = null;

export const store = {
    get(key, def) {
        const v = S.ui[key];
        return v === undefined || v === null ? def : v;
    },
    set(key, value) {
        S.ui = {...S.ui, [key]: value};
        clearTimeout(uiSaveTimer);
        uiSaveTimer = setTimeout(() => Go.SaveUISettings(S.ui).catch(showError), 400);
    },
};
