// Template dialogs: the template manager (create, edit, delete) and the dialog
// that applies a template to a host or creates a group from a template.

import * as Go from '../wailsjs/go/main/App';
import {esc, t, th} from './i18n';
import {afterStructureChange, groupKey, groupNameError} from './groups';
import {renderEditor} from './editor';
import {$, blockTitle, isGlobalHost, kw, S, splitPatterns, store} from './state';
import {flush, renderAll, scheduleSync, showError} from './sync';
import {modal, toast} from './ui';
import {
    applyEntries, hasConfig, hasPlaceholders, instantiateGroup, instantiateHost, newHostBlock, parseTemplateText,
    templateFromBlock, templateFromGroup, templateText, templateVariables, usesAlias,
} from './templates';

// ---- loading ----

export async function loadTemplates() {
    try {
        const info = await Go.GetTemplates();
        S.templates = info.templates || [];
        S.templatesInfo = info;
    } catch (e) {
        showError(e);
    }
    return S.templates;
}

export const hostTemplates = () => S.templates.filter((x) => x.kind !== 'group');
export const groupTemplates = () => S.templates.filter((x) => x.kind === 'group');

// uniqueName appends " (2)", " (3)" … until no template of the kind has the name.
function uniqueName(list, name, kind) {
    const taken = (n) => list.some((x) => x.kind === kind && x.name.trim().toLowerCase() === n.toLowerCase());
    let n = name || t(kind === 'group' ? 'tm.newGroup.name' : 'tm.newHost.name');
    for (let i = 2; taken(n); i++) n = `${name || t(kind === 'group' ? 'tm.newGroup.name' : 'tm.newHost.name')} (${i})`;
    return n;
}

// ======================================================= template manager ===

const TM = {
    items: [],   // working copies: {name, kind, group, text}
    index: -1,   // edited item
    dirty: false,
    error: '',   // file could not be read: saving is disabled
};

const toItem = (tpl) => ({name: tpl.name, kind: tpl.kind || 'host', group: tpl.group || '', text: templateText(tpl)});

// openTemplateManager opens the manager; add is a template to add and edit
// (from "Save as template").
export async function openTemplateManager({add = null} = {}) {
    await loadTemplates();
    TM.items = S.templates.map(toItem);
    TM.error = S.templatesInfo?.error || '';
    TM.dirty = false;
    TM.index = TM.items.length ? 0 : -1;
    if (add) {
        TM.items.push(toItem({...add, name: uniqueName(TM.items, add.name, add.kind)}));
        TM.index = TM.items.length - 1;
        TM.dirty = true;
    }
    $('tm-path').textContent = S.templatesInfo?.path || t('settings.noDir');
    $('tm-error').textContent = TM.error ? t('template.error.unreadable', {path: S.templatesInfo.path, error: TM.error}) : '';
    $('tm-error').hidden = !TM.error;
    $('tm-ok').disabled = !!TM.error;
    renderManager();
    $('tmanager').hidden = false;
    if (add) {
        $('tm-name').focus();
        $('tm-name').select();
    } else {
        (TM.index >= 0 ? $('tm-name') : $('tm-new-host')).focus();
    }
}

async function closeManager({force = false} = {}) {
    if (TM.dirty && !force) {
        const r = await modal(t('tm.discard.title'), t('tm.discard.text'), [t('tm.discard.ok'), t('common.cancel')]);
        if (r !== 0) return;
    }
    $('tmanager').hidden = true;
}

function renderManager() {
    $('tm-items').innerHTML = TM.items.length
        ? TM.items.map((it, i) => `<li data-i="${i}" class="${i === TM.index ? 'active' : ''}" role="option" aria-selected="${i === TM.index}">
            <span class="tag ${it.kind === 'group' ? 'group' : ''}">${th(it.kind === 'group' ? 'tm.kind.group' : 'tm.kind.host')}</span>
            <span class="tm-item-name">${esc(it.name || t('tm.unnamed'))}</span></li>`).join('')
        : `<li class="none">${th('tm.empty')}</li>`;
    $('tm-items').querySelectorAll('li[data-i]').forEach((li) => li.addEventListener('click', () => {
        TM.index = Number(li.dataset.i);
        renderManager();
    }));
    const it = TM.items[TM.index];
    $('tm-edit').hidden = !it;
    $('tm-noselection').hidden = !!it;
    if (!it) return;
    const group = it.kind === 'group';
    $('tm-name').value = it.name;
    $('tm-group-row').hidden = !group;
    $('tm-group').value = it.group;
    $('tm-text-label').textContent = t(group ? 'tm.text.group' : 'tm.text.host');
    $('tm-text').placeholder = t(group ? 'tm.text.group.placeholder' : 'tm.text.host.placeholder');
    $('tm-text').value = it.text;
    renderProblems();
}

// itemTemplate turns a working copy into a template; errors as i18n texts.
function itemTemplate(it, all = TM.items) {
    const errors = [];
    const name = it.name.trim();
    if (!name) errors.push(t('template.error.name', {name}));
    else if (all.some((o) => o !== it && o.kind === it.kind && o.name.trim().toLowerCase() === name.toLowerCase())) {
        errors.push(t('template.error.duplicate', {name}));
    }
    const parsed = parseTemplateText(it.text, it.kind);
    parsed.errors.forEach((e) => errors.push(e.line ? t('tpl.error.line', {line: e.line, error: t(e.code)}) : t(e.code)));
    if (it.kind === 'group' && !it.group.trim()) errors.push(t('template.error.group', {name}));
    const tpl = it.kind === 'group'
        ? {name, kind: 'group', group: it.group.trim(), hosts: parsed.hosts}
        : {name, kind: 'host', options: parsed.options};
    return {tpl, errors};
}

function renderProblems() {
    const it = TM.items[TM.index];
    if (!it) return;
    const {tpl, errors} = itemTemplate(it);
    const options = tpl.kind === 'group' ? tpl.hosts.flatMap((h) => h.options) : tpl.options;
    const unknown = [...new Set(options.map((o) => o.key).filter((k) => !kw(k)))];
    const vars = templateVariables(tpl);
    $('tm-problems').innerHTML = [
        ...errors.map((e) => `<div class="issue error">${esc(e)}</div>`),
        unknown.length ? `<div class="issue warning">${th('tm.unknownKeys', {keys: unknown.join(', ')})}</div>` : '',
    ].join('');
    $('tm-vars').innerHTML = vars.length
        ? th('tm.vars_html', {vars: vars.map((v) => v.def ? `${v.name} = ${v.def}` : v.name).join(', ')})
        : th('tm.noVars');
}

function updateItem(field, value) {
    const it = TM.items[TM.index];
    if (!it) return;
    it[field] = value;
    TM.dirty = true;
    if (field === 'name') {
        const li = $('tm-items').querySelector(`li[data-i="${TM.index}"] .tm-item-name`);
        if (li) li.textContent = value || t('tm.unnamed');
    }
    renderProblems();
}

function addItem(kind) {
    // a new group template starts with an example that shows the placeholders
    TM.items.push({
        name: uniqueName(TM.items, '', kind),
        kind,
        group: kind === 'group' ? t('tm.example.group') : '',
        text: kind === 'group' ? t('tm.example.hosts') : '',
    });
    TM.index = TM.items.length - 1;
    TM.dirty = true;
    renderManager();
    $('tm-name').focus();
    $('tm-name').select();
}

async function deleteItem() {
    const it = TM.items[TM.index];
    if (!it) return;
    const r = await modal(t('tm.delete.title'), t('tm.delete.text', {name: it.name}), [t('editor.delete'), t('common.cancel')]);
    if (r !== 0) return;
    TM.items.splice(TM.index, 1);
    TM.index = Math.min(TM.index, TM.items.length - 1);
    TM.dirty = true;
    renderManager();
}

function duplicateItem() {
    const it = TM.items[TM.index];
    if (!it) return;
    TM.items.splice(TM.index + 1, 0, {...it, name: uniqueName(TM.items, it.name, it.kind)});
    TM.index++;
    TM.dirty = true;
    renderManager();
    $('tm-name').focus();
    $('tm-name').select();
}

async function submitManager() {
    const list = [];
    for (let i = 0; i < TM.items.length; i++) {
        const {tpl, errors} = itemTemplate(TM.items[i]);
        if (errors.length) {
            TM.index = i;
            renderManager();
            return toast(t('tm.fixErrors', {name: tpl.name || t('tm.unnamed')}), 'error');
        }
        list.push(tpl);
    }
    try {
        const info = await Go.SaveTemplates(list);
        S.templates = info.templates || [];
        S.templatesInfo = info;
    } catch (e) {
        return showError(e);
    }
    await closeManager({force: true});
    if (S.view === 'editor') renderEditor();
    toast(t('tm.saved'));
}

// ============================================================ apply dialog ===

const TA = {
    mode: 'host',    // host | group
    blockId: null,   // host mode: the block the template is applied to
    values: {},      // variable values by name (kept when switching templates)
    confirmed: false,
};

const templatesFor = (mode) => (mode === 'group' ? groupTemplates() : hostTemplates());
const currentTemplate = () => templatesFor(TA.mode).find((x) => x.name === $('ta-template').value);
const targetBlock = () => S.config.blocks.find((b) => b.id === TA.blockId);

// applyTemplateTo applies a host template to a block. Without placeholders
// and on a host that has no values yet it is applied at once, otherwise the
// dialog asks for the values and shows what will be overwritten.
export function applyTemplateTo(b, name = '') {
    const tpl = hostTemplates().find((x) => x.name === name);
    if (tpl && !hasPlaceholders(tpl) && !hasConfig(b) && b.entries.every((e) => e.type !== 'comment')) {
        applyEntries(b, instantiateHost(tpl, {patterns: b.patterns, group: b.group}));
        renderAll();
        scheduleSync(0);
        return toast(t('ta.applied', {name: tpl.name}));
    }
    openApplyDialog({mode: 'host', blockId: b.id, name});
}

export function openApplyDialog({mode = 'host', blockId = null, name = ''} = {}) {
    const list = templatesFor(mode);
    if (!list.length) {
        toast(t(mode === 'group' ? 'ta.noGroupTemplates' : 'ta.noHostTemplates'), 'error');
        return openTemplateManager();
    }
    TA.mode = mode;
    TA.blockId = blockId;
    TA.confirmed = false;
    const b = targetBlock();
    $('ta-title').textContent = mode === 'group' ? t('ta.title.group') : t('ta.title.host', {name: blockTitle(b)});
    $('ta-template').innerHTML = list.map((x) => `<option value="${esc(x.name)}">${esc(x.name)}</option>`).join('');
    $('ta-template').value = list.some((x) => x.name === name) ? name : list[0].name;
    $('ta-alias-row').hidden = mode !== 'host';
    $('ta-alias').value = b ? b.patterns : '';
    $('tapply').hidden = false;
    renderApply();
    const first = $('ta-vars').querySelector('input') || (mode === 'host' && !b?.patterns.trim() ? $('ta-alias') : $('ta-template'));
    first.focus();
}

function closeApply() {
    $('tapply').hidden = true;
}

// renderApply renders the variable fields; the preview follows the values.
function renderApply() {
    const tpl = currentTemplate();
    if (!tpl) return;
    TA.confirmed = false;
    $('ta-changes').hidden = true;
    const vars = templateVariables(tpl);
    $('ta-vars').innerHTML = vars.map((v) => `<label class="field-label" for="ta-var-${esc(v.name)}">${esc(v.name)}</label>
        <input id="ta-var-${esc(v.name)}" data-var="${esc(v.name)}" autocomplete="off" spellcheck="false"
            value="${esc(TA.values[v.name] ?? v.def)}" placeholder="${esc(v.def)}">`).join('');
    $('ta-vars').querySelectorAll('input[data-var]').forEach((input) => input.addEventListener('input', () => {
        TA.values[input.dataset.var] = input.value;
        TA.confirmed = false;
        $('ta-changes').hidden = true;
        renderPreview();
    }));
    vars.forEach((v) => (TA.values[v.name] ??= v.def));
    renderPreview();
}

function varValues() {
    const tpl = currentTemplate();
    return Object.fromEntries(templateVariables(tpl).map((v) => [v.name, TA.values[v.name] ?? v.def]));
}

const lines = (entries, indent) => entries.map((e) => `${indent}${e.key} ${e.value}`.trimEnd());

// plan computes what applying does, without changing the document:
// host mode {patterns, entries, errors, warnings}, group mode {group, hosts, errors, warnings}.
function plan() {
    const tpl = currentTemplate();
    const errors = [], warnings = [];
    if (TA.mode === 'host') {
        const b = targetBlock();
        const patterns = splitPatterns($('ta-alias').value).join(' ');
        const entries = instantiateHost(tpl, {patterns, group: b?.group, vars: varValues()});
        if (!patterns && usesAlias(tpl)) errors.push(t('ta.error.alias'));
        if (b && hasConfig(b)) warnings.push(t('ta.warning.overwrite', {name: blockTitle(b)}));
        const comments = b ? b.entries.filter((e) => e.type === 'comment').length : 0;
        if (comments) warnings.push(t('ta.warning.comments', {count: comments}));
        return {patterns, entries, errors, warnings};
    }
    const inst = instantiateGroup(tpl, varValues());
    const nameError = groupNameError(inst.group);
    if (nameError) errors.push(t('ta.error.group', {group: inst.group, error: t(nameError)}));
    inst.hosts.forEach((h, i) => { if (!h.patterns) errors.push(t('ta.error.hostPatterns', {n: i + 1})); });
    const existing = new Set(S.config.blocks.filter((b) => b.kind === 'host').flatMap((b) => splitPatterns(b.patterns).map((p) => p.toLowerCase())));
    const dupes = [...new Set(inst.hosts.flatMap((h) => splitPatterns(h.patterns)).filter((p) => existing.has(p.toLowerCase())))];
    if (dupes.length) warnings.push(t('ta.warning.exists', {aliases: dupes.join(', ')}));
    return {...inst, errors, warnings};
}

function renderPreview() {
    const p = plan();
    const text = TA.mode === 'host'
        ? [`Host ${p.patterns}`, ...lines(p.entries, '    ')].join('\n')
        : [`# [${p.group}] start`, ...p.hosts.map((h) => [`Host ${h.patterns}`, ...lines(h.entries, '    ')].join('\n')), `# [${p.group}] end`].join('\n\n');
    $('ta-preview').textContent = text;
    $('ta-problems').innerHTML = [
        ...p.errors.map((e) => `<div class="issue error">${esc(e)}</div>`),
        ...p.warnings.map((w) => `<div class="issue warning">${esc(w)}</div>`),
    ].join('');
    $('ta-ok').disabled = p.errors.length > 0;
    const overwrite = TA.mode === 'host' && targetBlock() && hasConfig(targetBlock());
    $('ta-ok').textContent = t(TA.confirmed ? 'gd.applyAnyway' : (TA.mode === 'group' ? 'ta.create' : (overwrite ? 'ta.overwrite' : 'ta.apply')));
    return p;
}

// insertAt is where new blocks go: at the end, but before a trailing
// "Host *" defaults block.
function insertAt() {
    const blocks = S.config.blocks;
    const last = blocks[blocks.length - 1];
    return blocks.length > 1 && isGlobalHost(last) && !last.group ? blocks.length - 1 : blocks.length;
}

async function submitApply() {
    const p = renderPreview();
    if (p.errors.length) return;
    const tpl = currentTemplate();
    if (TA.mode === 'host') {
        const b = targetBlock();
        if (!b) return closeApply();
        b.patterns = p.patterns;
        applyEntries(b, p.entries);
        closeApply();
        S.selected = b.id;
        renderAll();
        scheduleSync(0);
        return toast(t('ta.applied', {name: tpl.name}));
    }
    const blocks = [];
    for (const h of p.hosts) blocks.push(newHostBlock(await Go.NewID(), h.patterns, h.entries, p.group));
    const next = [...S.config.blocks];
    next.splice(insertAt(), 0, ...blocks);
    if (!TA.confirmed) {
        // new Host blocks only change hosts whose alias already exists
        const before = new Set(S.config.blocks.filter((b) => b.kind === 'host').flatMap((b) => splitPatterns(b.patterns).map((x) => x.toLowerCase())));
        await flush();
        let changes = [];
        try {
            changes = (await Go.PreviewChanges({...S.config, blocks: next})).filter((c) => before.has(c.host.toLowerCase()));
        } catch (e) {
            return showError(e);
        }
        if (changes.length) {
            TA.confirmed = true;
            const shown = changes.slice(0, 12);
            $('ta-changes').innerHTML = `<div class="issue warning">${th('ta.changes.intro')}</div>
                <table class="eff">${shown.map((c) => `<tr><th>${esc(c.host)}</th><td><code>${esc(c.key)}</code>:
                <span class="before">${esc(c.before || '–')}</span> → <strong>${esc(c.after || '–')}</strong></td></tr>`).join('')}</table>
                ${changes.length > shown.length ? `<div class="hint">${th('gd.changes.more', {count: changes.length - shown.length})}</div>` : ''}`;
            $('ta-changes').hidden = false;
            $('ta-ok').textContent = t('gd.applyAnyway');
            return;
        }
    }
    S.config.blocks = next;
    if (S.collapsed.delete(groupKey(p.group))) store.set('collapsed', [...S.collapsed]);
    closeApply();
    afterStructureChange(blocks[0].id);
    document.querySelector(`.block-item[data-id="${blocks[0].id}"]`)?.scrollIntoView({block: 'nearest'});
    toast(t('ta.groupCreated', {name: p.group, count: blocks.length}));
}

// ======================================================== save as template ===

export function saveBlockAsTemplate(b) {
    const name = splitPatterns(b.patterns)[0] || '';
    openTemplateManager({add: templateFromBlock(b, name)});
}

export function saveGroupAsTemplate(group) {
    const tpl = templateFromGroup(group);
    if (!tpl.hosts.length) return toast(t('tm.groupWithoutHosts', {name: group}), 'error');
    openTemplateManager({add: tpl});
}

// ===================================================================== setup ===

export function setupTemplateDialogs() {
    $('tm-name').addEventListener('input', (ev) => updateItem('name', ev.target.value));
    $('tm-group').addEventListener('input', (ev) => updateItem('group', ev.target.value));
    $('tm-text').addEventListener('input', (ev) => updateItem('text', ev.target.value));
    $('tm-new-host').addEventListener('click', () => addItem('host'));
    $('tm-new-group').addEventListener('click', () => addItem('group'));
    $('tm-dup').addEventListener('click', duplicateItem);
    $('tm-del').addEventListener('click', deleteItem);
    $('tm-ok').addEventListener('click', submitManager);
    $('tm-cancel').addEventListener('click', () => closeManager());
    $('tmanager').addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape') {
            ev.stopPropagation();
            closeManager();
        } else if (ev.key === 's' && (ev.ctrlKey || ev.metaKey)) {
            ev.preventDefault();
            ev.stopPropagation();
            submitManager();
        }
    });

    $('ta-template').addEventListener('change', renderApply);
    $('ta-alias').addEventListener('input', () => {
        TA.confirmed = false;
        renderPreview();
    });
    $('ta-manage').addEventListener('click', () => {
        closeApply();
        openTemplateManager();
    });
    $('ta-ok').addEventListener('click', submitApply);
    $('ta-cancel').addEventListener('click', closeApply);
    $('tapply').addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape') {
            ev.stopPropagation();
            closeApply();
        } else if (ev.key === 'Enter' && ev.target instanceof HTMLInputElement) {
            ev.preventDefault();
            submitApply();
        }
    });
}
