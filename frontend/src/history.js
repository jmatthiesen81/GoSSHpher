// Undo/redo for the document. Every change of S.config goes through
// scheduleSync (sync.js), which calls recordChange. The history keeps
// snapshots of the document *before* each change.
//
// Typing in the same field within COALESCE_MS counts as one step; structural
// changes (move, group, delete, …) are always separate steps.

import {$, S} from './state';
import {renderAll, scheduleSync} from './sync';

const MAX_STEPS = 200;
const COALESCE_MS = 1500;

const H = {
    undo: [],         // snapshots before each change, oldest first
    redo: [],         // snapshots undone, most recent last
    base: null,       // snapshot of the current state (before the next change)
    lastTarget: null, // input element of the last change, for coalescing
    lastTime: 0,
    restoring: false, // true while a snapshot is applied
};

const snapshot = () => ({config: structuredClone(S.config), selected: S.selected});

// resetHistory starts a new history, e.g. after loading a file.
export function resetHistory() {
    H.undo = [];
    H.redo = [];
    H.base = snapshot();
    H.lastTarget = null;
    updateButtons();
}

// recordChange is called after S.config was changed. target is the input
// element the user is typing in (for coalescing) or null.
export function recordChange(target = null) {
    if (H.restoring) return;
    if (!H.base) {
        H.base = snapshot();
        return;
    }
    const now = Date.now();
    const coalesce = target && target === H.lastTarget && now - H.lastTime < COALESCE_MS;
    if (!coalesce) {
        H.undo.push(H.base);
        if (H.undo.length > MAX_STEPS) H.undo.shift();
    }
    H.redo = [];
    H.lastTarget = target;
    H.lastTime = now;
    H.base = snapshot();
    updateButtons();
}

export function undo() {
    if (!H.undo.length) return;
    H.redo.push(snapshot());
    restore(H.undo.pop());
}

export function redo() {
    if (!H.redo.length) return;
    H.undo.push(snapshot());
    restore(H.redo.pop());
}

function restore(snap) {
    H.restoring = true;
    try {
        S.config = structuredClone(snap.config);
        // keep the current selection (usually the block just changed); fall
        // back to the selection of the snapshot if that block is gone
        const exists = (id) => S.config.blocks.some((b) => b.id === id);
        if (!exists(S.selected) && exists(snap.selected)) S.selected = snap.selected;
        H.base = snapshot();
        H.lastTarget = null;
        renderAll();
        scheduleSync(0);
    } finally {
        H.restoring = false;
    }
    updateButtons();
}

function updateButtons() {
    const u = $('btn-undo'), r = $('btn-redo');
    if (u) u.disabled = !H.undo.length;
    if (r) r.disabled = !H.redo.length;
}
