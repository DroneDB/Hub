/**
 * An empty folder (FR-EXP-37, FR-XC-20): somebody who may write is told where files come from ('Drop files here or
 * click Upload') and has the Upload and Import from URL buttons, in the grid and in the table; a reader has the plain
 * text only.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import { createPinia, setActivePinia } from 'pinia';

vi.mock('@/libs/build/buildManager', () => ({
    default: { getBuildState: () => null, hasActiveBuild: () => false, on: vi.fn(), off: vi.fn() },
    BUILD_STATES: {}
}));
vi.mock('@/libs/build/buildHelpers', () => ({
    isBuildableFile: () => false, hasActiveBuild: () => false, isFileBuilt: vi.fn(), buildFile: vi.fn(), isBuildComplete: () => false,
    isBuildLoading: () => false, getBuildBadge: () => null, getBuildBadgeTooltip: () => ''
}));

const FolderEmptyState = (await import('./FolderEmptyState.vue')).default;
const DatasetExplorer = (await import('./DatasetExplorer.vue')).default;
const TableView = (await import('./TableView.vue')).default;

let w;
beforeEach(() => vi.spyOn(console, 'warn').mockImplementation(() => {}));
afterEach(() => { w?.unmount(); vi.restoreAllMocks(); });

const buttons = () => w.findAll('.empty-state-actions button').map(b => b.text());
const stubs = { ContextMenu: true, Toolbar: true, PathBreadcrumb: true };

describe('FolderEmptyState', () => {
    it('tells a writer to drop files or click Upload, with the two buttons that do it', async () => {
        w = mount(FolderEmptyState, { props: { canWrite: true }, global: { plugins: [PrimeVue] } });
        expect(w.find('h3').text()).toBe('This folder is empty');
        expect(w.text()).toContain('Drop files here or click Upload.');
        expect(buttons()).toEqual(['Upload', 'Import from URL']);

        await w.findAll('.empty-state-actions button')[0].trigger('click');
        await w.findAll('.empty-state-actions button')[1].trigger('click');
        expect(w.emitted('upload')).toHaveLength(1);
        expect(w.emitted('importFromUrl')).toHaveLength(1);
    });

    it('is the plain text for a reader', () => {
        w = mount(FolderEmptyState, { props: { canWrite: false }, global: { plugins: [PrimeVue] } });
        expect(w.text()).toBe('This folder is empty');
        expect(w.find('button').exists()).toBe(false);
    });
});

describe('the empty file list', () => {
    it('has the buttons in the grid, which run the dataset actions through its events', async () => {
        setActivePinia(createPinia());
        w = mount(DatasetExplorer, { props: { files: [], dataset: { org: 'o', ds: 'd' }, canWrite: true }, attachTo: document.body, global: { plugins: [PrimeVue], stubs } });
        await flushPromises();
        expect(buttons()).toEqual(['Upload', 'Import from URL']);
        await w.findAll('.empty-state-actions button')[1].trigger('click');
        await w.findAll('.empty-state-actions button')[0].trigger('click');
        expect(w.emitted('importFromUrl')).toHaveLength(1);
        expect(w.emitted('upload')).toHaveLength(1);
    });

    it('is not a listbox while the folder is empty, so its buttons are not inside one; files make it one again', async () => {
        setActivePinia(createPinia());
        w = mount(DatasetExplorer, { props: { files: [], dataset: { org: 'o', ds: 'd' }, canWrite: true }, attachTo: document.body, global: { plugins: [PrimeVue], stubs } });
        await flushPromises();
        const explorer = w.find('#explorer');
        expect(explorer.attributes('role')).toBeUndefined();
        expect(explorer.attributes('tabindex')).toBeUndefined();
        expect(explorer.attributes('aria-multiselectable')).toBeUndefined();
        expect(w.find('[role="listbox"]').exists()).toBe(false);
        expect(w.findAll('.empty-state-actions button').filter(b => b.element.closest('[role="listbox"]'))).toHaveLength(0);
        // The empty folder is still where files are dropped
        expect(explorer.attributes('data-file-list')).toBeDefined();

        await w.setProps({ files: [{ label: 'a.tif', path: 'ddb://h/o/d/a.tif', icon: 'fa-solid fa-file', selected: false, entry: { path: 'a.tif', type: 1, size: 1, hash: 'h' } }] });
        await flushPromises();
        expect(explorer.attributes('role')).toBe('listbox');
        expect(explorer.attributes('tabindex')).toBe('0');
        expect(explorer.attributes('aria-label')).toBe('Files');
        expect(w.find('.empty-state').exists()).toBe(false);
    });

    it('has the buttons in the table', async () => {
        setActivePinia(createPinia());
        w = mount(TableView, { props: { files: [], dataset: { org: 'o', ds: 'd' }, canWrite: true }, attachTo: document.body, global: { plugins: [PrimeVue], stubs } });
        await flushPromises();
        expect(buttons()).toEqual(['Upload', 'Import from URL']);
        await w.findAll('.empty-state-actions button')[1].trigger('click');
        expect(w.emitted('importFromUrl')).toHaveLength(1);
    });

    it('has no buttons for a reader, in the grid and in the table', async () => {
        setActivePinia(createPinia());
        w = mount(DatasetExplorer, { props: { files: [], dataset: { org: 'o', ds: 'd' }, canWrite: false }, attachTo: document.body, global: { plugins: [PrimeVue], stubs } });
        await flushPromises();
        expect(w.find('.empty-state button').exists()).toBe(false);
        expect(w.find('.empty-state').text()).toBe('This folder is empty');
        w.unmount();
        w = mount(TableView, { props: { files: [], dataset: { org: 'o', ds: 'd' }, canWrite: false }, attachTo: document.body, global: { plugins: [PrimeVue], stubs } });
        await flushPromises();
        expect(w.find('.empty-state button').exists()).toBe(false);
    });
});
