// Generic UI helpers (modal, toast) and texts for keywords, issues and notes.

import {esc, t, th} from './i18n';
import {$} from './state';

// ------------------------------------------------------------- helpers ---

export function modal(title, text, buttons) {
    return new Promise((resolve) => {
        $('modal-title').textContent = title;
        $('modal-text').textContent = text;
        const box = $('modal-buttons');
        box.innerHTML = '';
        buttons.forEach((label, i) => {
            const btn = document.createElement('button');
            btn.textContent = label;
            if (i === 0) btn.className = 'primary';
            btn.addEventListener('click', () => {
                $('modal').hidden = true;
                document.removeEventListener('keydown', onKey);
                resolve(i);
            });
            box.appendChild(btn);
        });
        const onKey = (ev) => {
            if (ev.key === 'Escape') {
                $('modal').hidden = true;
                document.removeEventListener('keydown', onKey);
                resolve(buttons.length - 1);
            }
        };
        document.addEventListener('keydown', onKey);
        $('modal').hidden = false;
        box.lastChild.focus();
    });
}

export let toastTimer;

export function toast(text, kind = 'ok') {
    const t = $('toast');
    t.textContent = text;
    t.className = 'toast ' + kind;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), kind === 'error' ? 6000 : 2000);
}

export function setupDatalists(keywords) {
    $('kw-list').innerHTML = keywords.map((k) => `<option value="${esc(k.name)}">${esc(kwDesc(k))}</option>`).join('');
    $('datalists').innerHTML = keywords.filter((k) => k.values?.length).map((k) =>
        `<datalist id="vals-${esc(k.name)}">${k.values.map((v) => `<option value="${esc(v)}">`).join('')}</datalist>`).join('');
}

// ----------------------------------------------------------- i18n glue ---

export const kwDesc = (k) => (k ? t('kw.' + k.name) : '');

export function kwDescHtml(k) {
    if (!k) return '';
    return esc(kwDesc(k)) + (k.multi ? ` <span class="tag">${th('tag.cumulative')}</span>` : '');
}

// issueText renders a language-neutral issue from internal/sshconfig.
export function issueText(i) {
    const params = {...(i.params || {})};
    if (params.reason) params.reason = t(params.reason);
    if (params.hint) params.hint = t(`issue.${i.code}.hint.${params.hint}`);
    if (i.items) {
        params.items = i.items.map((it) => t(it.file ? `issue.${i.code}.itemFile` : `issue.${i.code}.item`,
            {...it, label: it.label || t('block.preamble')})).join(', ');
    }
    return t('issue.' + i.code, params);
}

export const noteText = (n) => t('note.' + n.code, n.params || {});
