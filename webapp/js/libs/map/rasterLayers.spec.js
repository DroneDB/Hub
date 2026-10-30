import { describe, it, expect, vi } from 'vitest';
import { Group as LayerGroup, Tile as TileLayer } from 'ol/layer';
import { ViewZoomCap, rasterLayerPath } from './rasterLayers';
import { OL_DEFAULT_MAX_ZOOM, SOURCE_MIN_ZOOM } from './rasterZoom';

function fakeMap({ busy = false } = {}) {
    const handlers = [];
    const view = {
        busy,
        setMaxZoom: vi.fn(),
        getAnimating: () => view.busy,
        getInteracting: () => false,
        once: (type, fn) => { handlers.push(fn); return { type, fn }; },
        fireMoveEnd: () => handlers.splice(0).forEach(fn => fn())
    };
    return { view, map: { getView: () => view } };
}

const raster = native => {
    const l = new TileLayer();
    l.set('rasterNativeZoom', native);
    return l;
};
const flush = () => new Promise(r => queueMicrotask(r));

describe('ViewZoomCap', () => {
    it('applies one cap per burst of layer changes', async () => {
        const { map, view } = fakeMap();
        const group = new LayerGroup();
        const cap = new ViewZoomCap(map, [group]);
        group.getLayers().push(raster(18));
        group.getLayers().push(raster(20));
        await flush();
        expect(view.setMaxZoom).toHaveBeenCalledTimes(1);
        expect(view.setMaxZoom.mock.calls[0][0]).toBeGreaterThanOrEqual(20);
        cap.dispose();
    });

    it('never caps below the tile source minimum and resets without rasters', async () => {
        const { map, view } = fakeMap();
        const group = new LayerGroup();
        const cap = new ViewZoomCap(map, [group]);
        group.getLayers().push(raster(3));
        await flush();
        expect(view.setMaxZoom).toHaveBeenLastCalledWith(SOURCE_MIN_ZOOM);
        group.getLayers().pop();
        await flush();
        expect(view.setMaxZoom).toHaveBeenLastCalledWith(OL_DEFAULT_MAX_ZOOM);
        cap.dispose();
    });

    it('waits for the view to settle', async () => {
        const { map, view } = fakeMap({ busy: true });
        const group = new LayerGroup();
        new ViewZoomCap(map, [group]);
        group.getLayers().push(raster(18));
        await flush();
        expect(view.setMaxZoom).not.toHaveBeenCalled();
        view.busy = false;
        view.fireMoveEnd();
        expect(view.setMaxZoom).toHaveBeenCalledTimes(1);
    });

    it('stops listening after dispose', async () => {
        const { map, view } = fakeMap();
        const group = new LayerGroup();
        new ViewZoomCap(map, [group]).dispose();
        group.getLayers().push(raster(18));
        await flush();
        expect(view.setMaxZoom).not.toHaveBeenCalled();
    });
});

describe('rasterLayerPath', () => {
    it('is the dataset path of the file a raster tile layer shows, null for another layer', () => {
        const layer = new TileLayer();
        layer.file = { path: 'ddb://h/o/d/odm_dem/dsm.tif', entry: { path: 'odm_dem/dsm.tif' } };
        expect(rasterLayerPath(layer)).toBe('odm_dem/dsm.tif');
        expect(rasterLayerPath(new TileLayer())).toBeNull();
        expect(rasterLayerPath(null)).toBeNull();
    });
});
