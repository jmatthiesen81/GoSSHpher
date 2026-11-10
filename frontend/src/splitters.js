// Resizable panes and option column.

import {$, DEFAULT_WIDTHS, S, store} from './state';

// ---- resizable columns ----

export function setupSplitters() {
    const layout = $('view-editor');
    const apply = () => {
        layout.style.setProperty('--w-side', S.widths.side + 'px');
        layout.style.setProperty('--w-insp', S.widths.insp + 'px');
        $('editor').style.setProperty('--w-key', S.widths.key + 'px');
    };
    apply();
    const drag = (onMove) => (ev) => {
        ev.preventDefault();
        document.body.classList.add('resizing');
        const move = (e) => {
            onMove(e);
            apply();
        };
        const up = () => {
            document.removeEventListener('mousemove', move);
            document.removeEventListener('mouseup', up);
            document.body.classList.remove('resizing');
            store.set('widths', S.widths);
        };
        document.addEventListener('mousemove', move);
        document.addEventListener('mouseup', up);
    };
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const sideSplit = document.querySelector('[data-split="side"]');
    const inspSplit = document.querySelector('[data-split="insp"]');
    sideSplit.addEventListener('mousedown', drag((e) => {
        const r = layout.getBoundingClientRect();
        S.widths.side = clamp(e.clientX - r.left, 180, Math.min(700, r.width - S.widths.insp - 320));
    }));
    inspSplit.addEventListener('mousedown', drag((e) => {
        const r = layout.getBoundingClientRect();
        S.widths.insp = clamp(r.right - e.clientX, 240, Math.min(800, r.width - S.widths.side - 320));
    }));
    const reset = (key) => () => {
        S.widths[key] = DEFAULT_WIDTHS[key];
        apply();
        store.set('widths', S.widths);
    };
    sideSplit.addEventListener('dblclick', reset('side'));
    inspSplit.addEventListener('dblclick', reset('insp'));
    // option name column inside the editor table
    $('editor').addEventListener('mousedown', (ev) => {
        if (!ev.target.classList.contains('col-resizer')) return;
        const startX = ev.clientX, start = S.widths.key;
        drag((e) => (S.widths.key = clamp(start + e.clientX - startX, 120, 480)))(ev);
    });
    $('editor').addEventListener('dblclick', (ev) => {
        if (ev.target.classList.contains('col-resizer')) reset('key')();
    });
}
