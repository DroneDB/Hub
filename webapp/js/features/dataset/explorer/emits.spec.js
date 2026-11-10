/**
 * The events that the explorer views raise are declared (FR-EXP-28): the context menu emits `alignGeoRaster`, and an
 * undeclared event is a Vue warning on every dataset page load.
 */
import { describe, it, expect, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import PrimeVue from 'primevue/config';
import ddb from 'ddb';

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

describe('the events of the explorer views', () => {
    it.each([['DatasetExplorer', DatasetExplorer], ['TableView', TableView]])('%s declares alignGeoRaster', (name, component) => {
        expect(component.emits).toContain('alignGeoRaster');
    });

    it.each([['DatasetExplorer', DatasetExplorer], ['TableView', TableView]])('%s raises it from the context menu without a Vue warning', async (name, component) => {
        setActivePinia(createPinia());
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const raster = { label: 'a.tif', path: 'ddb://h/o/d/a.tif', icon: 'fa-solid fa-file', selected: true, entry: { path: 'a.tif', type: ddb.entry.type.GENERIC, size: 10, mtime: 1, hash: 'h' } };
        const w = mount(component, {
            props: { files: [raster], dataset: { org: 'o', ds: 'd' }, canWrite: true },
            global: { plugins: [PrimeVue], stubs: { ContextMenu: true, Toolbar: true, PathBreadcrumb: true } }
        });
        await flushPromises();
        w.vm.$emit('alignGeoRaster', raster);
        expect(w.emitted('alignGeoRaster')).toEqual([[raster]]);
        const messages = warn.mock.calls.map(c => String(c[0]));
        expect(messages.filter(m => m.includes('alignGeoRaster'))).toEqual([]);
        w.unmount();
        warn.mockRestore();
    });
});
