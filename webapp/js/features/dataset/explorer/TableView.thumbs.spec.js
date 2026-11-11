/**
 * The previews of the expanded table are requested at the size they are shown, pixel ratio included
 * (FR-EXP-41): the 48 px box that `object-fit: cover` fills along the long side of a 16:9 photo is 86 CSS px,
 * so 128 px at ratio 1 and 256 px at ratio 2 - not the 48 px bitmap that was blurry at 200%.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { reactive } from 'vue';
import PrimeVue from 'primevue/config';
import { createPinia, setActivePinia } from 'pinia';
import ddb, { thumbs } from 'ddb';

vi.mock('@/libs/build/buildManager', () => ({
    default: { getBuildState: () => null, hasActiveBuild: () => false, on: vi.fn(), off: vi.fn() },
    BUILD_STATES: {}
}));
vi.mock('@/libs/build/buildHelpers', () => ({
    isBuildableFile: () => false, hasActiveBuild: () => false, isFileBuilt: vi.fn(), buildFile: vi.fn(), isBuildComplete: () => false,
    isBuildLoading: () => false, getBuildBadge: () => null, getBuildBadgeTooltip: () => ''
}));

const TableView = (await import('./TableView.vue')).default;

const photo = name => reactive({
    label: name, path: `ddb://h/o/d/${name}`, icon: 'fa-solid fa-image', selected: false,
    entry: { path: name, type: ddb.entry.type.GEOIMAGE, size: 10, mtime: 1, hash: `hash-${name}` }
});

let w;
async function mountTable(ratio) {
    vi.stubGlobal('devicePixelRatio', ratio);
    setActivePinia(createPinia());
    w = mount(TableView, {
        props: { files: [photo('a.jpg'), photo('b.jpg')], dataset: { org: 'o', ds: 'd' }, canWrite: true, expandedGrid: true },
        attachTo: document.body,
        global: { plugins: [PrimeVue], stubs: { ContextMenu: true, Toolbar: true, PathBreadcrumb: true } }
    });
    await flushPromises();
}

beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(thumbs, 'fetch').mockImplementation((uri, size) => `/thumb?size=${size}`);
});
afterEach(() => { w?.unmount(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('TableView previews (FR-EXP-41)', () => {
    it('requests 128 px at ratio 1', async () => {
        await mountTable(1);
        expect(thumbs.fetch.mock.calls.map(c => c[1])).toEqual([128, 128]);
        expect(w.findAll('img.thumb-preview').map(i => i.attributes('src'))).toEqual(['/thumb?size=128', '/thumb?size=128']);
    });

    it('requests 256 px at ratio 2', async () => {
        await mountTable(2);
        expect(thumbs.fetch.mock.calls.map(c => c[1])).toEqual([256, 256]);
    });

    it('passes the hash of the entry, so a changed file is another bitmap', async () => {
        await mountTable(1);
        expect(thumbs.fetch.mock.calls.map(c => c[2])).toEqual(['hash-a.jpg', 'hash-b.jpg']);
    });
});
