// Pure helpers for the effective configuration view (testable without DOM).

// collectExecs returns the "Match exec" checks of a resolution, one per
// expanded command, in evaluation order.
export function collectExecs(res) {
    const seen = new Map();
    for (const b of res.blocks || []) {
        for (const e of b.execs || []) {
            if (!seen.has(e.expanded)) seen.set(e.expanded, {...e, blocks: []});
            seen.get(e.expanded).blocks.push(b);
        }
    }
    return [...seen.values()];
}

// expandedValue returns the value ssh uses at connect time if it differs
// from the written one, otherwise ''.
export const expandedValue = (option, i) => (option.expanded && option.expanded[i]) || '';

const MAX_LABEL = 40;

// shortLabel shortens "Host a b c" to "Host a +2" and long labels (Match
// criteria) to MAX_LABEL characters; the full label is shown as tooltip.
export function shortLabel(label, preamble) {
    if (!label) return preamble;
    const [kwd, ...rest] = label.split(/\s+/);
    if (kwd === 'Host' && rest.length > 1) label = `Host ${rest[0]} +${rest.length - 1}`;
    return label.length > MAX_LABEL ? label.slice(0, MAX_LABEL - 1) + '…' : label;
}

// fileName returns the last path element for display.
export const fileName = (path) => path.split(/[\\/]/).pop();
