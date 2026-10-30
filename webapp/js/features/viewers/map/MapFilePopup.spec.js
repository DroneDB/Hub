import { describe, it, expect, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import ddb from 'ddb';

vi.mock('ddb', async importOriginal => {
    const actual = await importOriginal();
    return { ...actual, thumbs: { fetch: () => '/thumb.webp' } };
});

const { default: MapFilePopup } = await import('./MapFilePopup.vue');

const photo = name => ({
    path: `ddb://localhost/org/ds/${name}`,
    entry: { path: name, type: ddb.entry.type.GEOIMAGE, properties: {}, point_geom: { type: 'Point', coordinates: [9, 45, 100] } }
});

async function popupOf(file) {
    const map = { addOverlay: vi.fn(), removeOverlay: vi.fn() };
    const w = mount(MapFilePopup, { props: { map } });
    w.vm.show(file, [0, 0]);
    await flushPromises();
    return w;
}

describe('MapFilePopup', () => {
    it('closes when the map shows other files (another folder)', async () => {
        const a = photo('folder1/a.jpg');
        const w = await popupOf(a);
        expect(w.find('.image-popup-title').text()).toBe('a.jpg');

        expect(w.vm.closeUnlessIn([photo('folder2/b.jpg')])).toBe(true);
        await flushPromises();
        expect(w.find('.image-popup-title').text()).toBe('');
        expect(w.find('.image-popup').element.style.display).toBe('none');
        w.unmount();
    });

    it('stays open while its file is still on the map', async () => {
        const a = photo('folder1/a.jpg');
        const w = await popupOf(a);
        expect(w.vm.closeUnlessIn([photo('folder1/c.jpg'), { ...a }])).toBe(false);
        await flushPromises();
        expect(w.find('.image-popup-title').text()).toBe('a.jpg');
        w.unmount();
    });
});
