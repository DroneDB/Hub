/**
 * Cut items are dimmed until they are pasted (FR-EXP-16): the tiles of the grid get a `cut` class and the rows of the
 * table a `row-cut` class, for the paths that the clipboard of this dataset holds as a cut; a copy dims nothing, and
 * neither does a cut of another dataset. The opacity (.5) is in the sources of the tile and of the table.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { reactive } from 'vue';
import PrimeVue from 'primevue/config';
import { createPinia, setActivePinia } from 'pinia';
import ddb from 'ddb';
import { readSource, ruleOf } from '@/specs/cssSource';

vi.mock('@/libs/build/buildManager', () => ({
    default: { getBuildState: () => null, hasActiveBuild: () => false, on: vi.fn(), off: vi.fn() },
    BUILD_STATES: {}
}));
vi.mock('@/libs/build/buildHelpers', () => ({
    isBuildableFile: () => false, hasActiveBuild: () => false, isFileBuilt: vi.fn(), buildFile: vi.fn(), isBuildComplete: () => false,
    isBuildLoading: () => false, getBuildBadge: () => null, getBuildBadgeTooltip: () => ''
}));

const DatasetExplorer = (await import('./DatasetExplorer.vue')).default;
const TableView = (await import('./TableView.vue')).default;
const { useClipboardStore } = await import('@/stores/clipboard');

const items = () => ['a.bin', 'b.bin', 'c.bin'].map(name => reactive({
    label: name, path: `ddb://h/o/d/${name}`, icon: 'fa-solid fa-file', selected: false,
    entry: { path: name, type: ddb.entry.type.GENERIC, size: 10, mtime: 1, hash: `h-${name}` }
}));

let w;
let clipboard;
const here = { orgSlug: 'o', dsSlug: 'd', basePath: '' };

function mountView(component) {
    setActivePinia(createPinia());
    clipboard = useClipboardStore();
    w = mount(component, {
        props: { files: items(), dataset: { org: 'o', ds: 'd' }, canWrite: true },
        attachTo: document.body,
        global: { plugins: [PrimeVue], stubs: { ContextMenu: true, Toolbar: true, PathBreadcrumb: true } }
    });
}
const cutTiles = () => w.findAll('.thumbnail.cut').map(t => t.text());
const cutRows = () => w.findAll('tbody tr.row-cut').map(r => r.text());

beforeEach(() => {
    sessionStorage.clear();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { w?.unmount(); vi.restoreAllMocks(); });

describe('the tiles of a cut', () => {
    it('dims only the tiles whose path is cut, and undims them when the clipboard is cleared', async () => {
        mountView(DatasetExplorer);
        await flushPromises();
        expect(cutTiles()).toEqual([]);

        clipboard.cut(here, [{ entry: { path: 'b.bin', type: 1, size: 10 } }]);
        await flushPromises();
        expect(cutTiles()).toEqual(['b.bin']);
        expect(w.findAll('.thumbnail')).toHaveLength(3);

        clipboard.clear();
        await flushPromises();
        expect(cutTiles()).toEqual([]);
    });

    it('does not dim a copy, nor a cut of another dataset', async () => {
        mountView(DatasetExplorer);
        await flushPromises();
        clipboard.copy(here, [{ entry: { path: 'a.bin', type: 1, size: 10 } }]);
        await flushPromises();
        expect(cutTiles()).toEqual([]);

        clipboard.cut({ orgSlug: 'o', dsSlug: 'other', basePath: '' }, [{ entry: { path: 'a.bin', type: 1, size: 10 } }]);
        await flushPromises();
        expect(cutTiles()).toEqual([]);
    });

    it('dims at half opacity', () => {
        expect(ruleOf(readSource(__dirname, 'EntryThumbnail.vue'), '.thumbnail.cut')).toContain('opacity: 0.5;');
    });
});

describe('the rows of a cut', () => {
    it('dims only the rows whose path is cut', async () => {
        mountView(TableView);
        await flushPromises();
        expect(cutRows()).toEqual([]);

        clipboard.cut(here, [{ entry: { path: 'a.bin', type: 1, size: 10 } }, { entry: { path: 'c.bin', type: 1, size: 10 } }]);
        await flushPromises();
        expect(cutRows().map(t => t.slice(0, 5))).toEqual(['a.bin', 'c.bin']);

        clipboard.clear();
        await flushPromises();
        expect(cutRows()).toEqual([]);
    });

    it('dims at half opacity', () => {
        expect(ruleOf(readSource(__dirname, 'TableView.vue'), 'tr.row-cut')).toContain('opacity: 0.5;');
    });
});
