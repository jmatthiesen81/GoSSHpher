// Module mocks shared by the tests: no Go backend, no DOM rendering.
import {vi} from 'vitest';

vi.mock('../wailsjs/go/main/App', () => ({}));
vi.mock('../src/sidebar', () => ({renderSidebar: vi.fn(), sortKey: vi.fn()}));
vi.mock('../src/inspector', () => ({renderEffective: vi.fn(), renderIssues: vi.fn(), inspectorTab: vi.fn()}));
vi.mock('../src/sync', () => ({
    scheduleSync: vi.fn(), renderAll: vi.fn(), renderStatus: vi.fn(), flush: vi.fn(), showError: vi.fn(),
    applyState: vi.fn(), issuesFor: () => [], worstSeverity: () => '', matchesFilter: () => true,
}));
vi.mock('../src/editor', async (importOriginal) => ({
    ...(await importOriginal()),
    renderEditor: vi.fn(),
    renderIssueSlots: vi.fn(),
    renderEntries: vi.fn(),
}));
