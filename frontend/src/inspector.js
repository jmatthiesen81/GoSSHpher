// Inspector: hints panel and effective configuration.

import * as Go from '../wailsjs/go/main/App';
import {esc, t, th} from './i18n';
import {focusEntry, select} from './editor';
import {$, blockIndex, blockTitle, isWildcard, S, selectedBlock, splitPatterns} from './state';
import {showError, syncPromise} from './sync';
import {collectExecs, expandedValue, fileName, shortLabel} from './effective';
import {issueText, modal, noteText, toast} from './ui';

// ---- issues panel ----

export function renderIssues() {
    const panel = $('panel-issues');
    if (!S.issues.length) {
        panel.innerHTML = `<div class="empty">${th('issues.none')}</div>`;
        return;
    }
    const order = {error: 0, warning: 1, info: 2};
    const sorted = [...S.issues].sort((a, b) =>
        order[a.severity] - order[b.severity] || blockIndex(a.blockId) - blockIndex(b.blockId));
    panel.innerHTML = sorted.map((i) => {
        const b = S.config.blocks.find((x) => x.id === i.blockId);
        return `<button class="issue-item ${i.severity}" data-block="${esc(i.blockId)}" data-entry="${i.entry}">
            <span class="where">${esc(b ? blockTitle(b) : '?')}</span>
            <span class="msg">${esc(issueText(i))}</span></button>`;
    }).join('');
    panel.querySelectorAll('.issue-item').forEach((el) => el.addEventListener('click', () => {
        select(el.dataset.block);
        const entry = Number(el.dataset.entry);
        if (entry >= 0) focusEntry(entry, 'value');
    }));
}

// ---- effective config ----

export let effTimer = null;

export function renderEffective() {
    const b = selectedBlock();
    const chips = $('eff-patterns');
    let candidates = [];
    if (b && b.kind === 'host') candidates = splitPatterns(b.patterns).filter((p) => !isWildcard(p));
    chips.innerHTML = candidates.map((p) =>
        `<button class="chip lit ${p === $('eff-host').value ? 'active' : ''}" data-p="${esc(p)}">${esc(p)}</button>`).join('');
    chips.querySelectorAll('.chip').forEach((c) => c.addEventListener('click', () => {
        $('eff-host').value = c.dataset.p;
        S.effPattern = c.dataset.p;
        renderEffective();
    }));
    // a newly selected host block pre-fills its first alias
    if (S.effPattern === null && candidates.length) {
        S.effPattern = candidates[0];
        $('eff-host').value = S.effPattern;
    }
    chips.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c.dataset.p === $('eff-host').value.trim()));
    scheduleResolve(50);
}

export function scheduleResolve(delay) {
    clearTimeout(effTimer);
    effTimer = setTimeout(resolveNow, delay);
}

export async function resolveNow() {
    const host = $('eff-host').value.trim();
    const user = $('eff-user').value.trim();
    const out = $('eff-result');
    if (!host) {
        out.innerHTML = `<div class="empty">${th('eff.empty_html')}</div>`;
        return;
    }
    await syncPromise;
    let res;
    try {
        res = await Go.Resolve(host, user, S.execAssume);
    } catch (e) {
        return showError(e);
    }
    const sel = S.selected;
    const short = (label) => shortLabel(label, t('block.preamble'));
    // values from included files open that file in a new window
    const srcLink = (s) => s.file
        ? `<button class="src ext" data-file="${esc(s.file)}" title="${th('eff.openFile')}: ${esc(s.file)}">${esc(fileName(s.file))}: ${esc(short(s.label))} ↗</button>`
        : `<button class="src ${s.blockId === sel ? 'self' : ''}" data-block="${esc(s.blockId)}" title="${esc(s.label)}">#${s.blockIndex} ${esc(short(s.label))}</button>`;
    const valueHtml = (o, v, i) => {
        const exp = expandedValue(o, i);
        return `<code>${esc(v)}</code>${exp ? `<div class="expanded" title="${th('eff.expanded.title')}">→ <code>${esc(exp)}</code></div>` : ''}`;
    };

    const rows = res.options.map((o) => {
        const vals = o.values.map((v, i) => `<div class="v"><div>${valueHtml(o, v, i)}</div> ${srcLink(o.sources[i])}</div>`).join('');
        const ign = (o.ignored || []).map((x) =>
            `<div class="v ignored" title="${th('eff.ignored')}"><code>${esc(x.value)}</code> ${srcLink(x.source)}</div>`).join('');
        return `<tr><th>${esc(o.key)}${o.multi ? ` <span class="tag">${th('tag.cumulative')}</span>` : ''}</th><td>${vals}${ign}</td></tr>`;
    }).join('');
    const matched = res.blocks.filter((x) => x.matched);
    const notes = (res.notes || []).map((n) => `<div class="issue info">${esc(noteText(n))}</div>`).join('');
    // exec notes are replaced by the Match exec section
    const blockNotes = (x) => (x.notes || []).filter((n) => n.code !== 'match.execAssumed').map(noteText).join('; ');
    const execs = collectExecs(res);
    const execHtml = execs.map((e, i) => {
        const run = S.execRuns[e.expanded];
        const state = e.assumed ? (e.result ? 'true' : 'false') : 'false';
        return `<div class="exec" data-i="${i}">
            <code>${e.negated ? '!' : ''}exec "${esc(e.expanded)}"</code>
            <div class="exec-row">
                <select class="exec-assume" aria-label="${th('eff.exec.assume')}">
                    <option value="false" ${state === 'false' ? 'selected' : ''}>${th('eff.exec.assumeFalse')}</option>
                    <option value="true" ${state === 'true' ? 'selected' : ''}>${th('eff.exec.assumeTrue')}</option>
                </select>
                <button class="exec-run">${th('eff.exec.run')}</button>
                ${run ? `<small class="exec-result" title="${esc(run.output || '')}">${th(run.timedOut ? 'eff.exec.timedOut' : 'eff.exec.ran', {code: run.exitCode})}</small>` : ''}
            </div></div>`;
    }).join('');
    out.innerHTML = `
        <div class="eff-cmd"><code>ssh ${esc(user ? user + '@' : '')}${esc(host)}</code></div>
        ${rows ? `<table class="eff">${rows}</table>` : `<div class="empty">${th('eff.noOptions')}</div>`}
        ${execs.length ? `<h3>${th('eff.exec.title')}</h3><div class="hint">${th('eff.exec.hint')}</div>${execHtml}` : ''}
        <h3>${th('eff.matched')}</h3>
        <div class="matched">${matched.length ? matched.map((x) => srcLink(x) + (blockNotes(x) ? ` <small>${esc(blockNotes(x))}</small>` : '')).join('') : `<em>${th('eff.none')}</em>`}</div>
        ${res.blocks.filter((x) => blockNotes(x) && !x.matched).map((x) => `<div class="issue info">${esc(short(x.label))}: ${esc(blockNotes(x))}</div>`).join('')}
        ${notes}`;
    out.querySelectorAll('button.src[data-block]').forEach((btn) => btn.addEventListener('click', () => select(btn.dataset.block)));
    out.querySelectorAll('button.src[data-file]').forEach((btn) => btn.addEventListener('click', () => openFileWindow(btn.dataset.file)));
    out.querySelectorAll('.exec').forEach((el) => {
        const e = execs[Number(el.dataset.i)];
        el.querySelector('.exec-assume').addEventListener('change', (ev) => {
            S.execAssume = {...S.execAssume, [e.expanded]: ev.target.value === 'true'};
            delete S.execRuns[e.expanded];
            scheduleResolve(0);
        });
        el.querySelector('.exec-run').addEventListener('click', () => runExec(host, user, e));
    });
}

// runExec runs a "Match exec" command after confirmation and uses its result
// as assumption for this and later evaluations.
async function runExec(host, user, check) {
    const ok = await modal(t('exec.confirm.title'), t('exec.confirm.text', {host, command: check.expanded}),
        [t('exec.confirm.ok'), t('common.cancel')]);
    if (ok !== 0) return;
    try {
        const r = await Go.RunMatchExec(host, user, check.command);
        S.execRuns = {...S.execRuns, [r.command]: r};
        S.execAssume = {...S.execAssume, [r.command]: r.success};
        scheduleResolve(0);
    } catch (e) {
        showError(e);
    }
}

export async function openFileWindow(path) {
    try {
        await Go.OpenWindow(path);
        toast(t('toast.windowOpened', {file: fileName(path)}));
    } catch (e) {
        showError(e);
    }
}

export function inspectorTab(name) {
    $('itab-eff').classList.toggle('active', name === 'eff');
    $('itab-issues').classList.toggle('active', name === 'issues');
    $('panel-eff').hidden = name !== 'eff';
    $('panel-issues').hidden = name !== 'issues';
}
