/**
 * Hit testing and file selection on the dataset map (HQ-07, out of Map.vue): what was
 * clicked, what a lasso polygon covers, and the Ctrl/right-click selection toggle.
 * Features carry their explorer item as `feature.file` and vector layers as `layer.file`;
 * selecting means setting `file.selected` (the explorer item, shared with the file list).
 */

/**
 * The top-most feature at a pixel among the layers `layerFilter` accepts.
 * @param {import('ol').Map} map
 * @param {number[]} pixel
 * @param {(layer: any) => boolean} [layerFilter]
 * @returns {{ feature: any, layer: any } | null}
 */
export function featureAt(map, pixel, layerFilter) {
    let hit = null;
    map.forEachFeatureAtPixel(pixel, (feature, layer) => {
        hit = { feature, layer };
        return true;
    }, layerFilter ? { layerFilter } : undefined);
    return hit;
}

/**
 * Explorer items of a feature: every shot of a cluster, or the feature's own file.
 * @returns {any[]}
 */
export function filesOfFeature(feature) {
    const clustered = feature.get && feature.get('features');
    if (clustered) return clustered.map(f => f.file).filter(Boolean);
    return feature.file ? [feature.file] : [];
}

/**
 * Toggles the selection of what is under the pixel: a vector file first (it draws on
 * top), else a shot cluster (all on, or all off when any was on) or a raster extent.
 * @param {import('ol').Map} map
 * @param {number[]} pixel
 * @param {any[]} vectorLayers
 * @returns {any|null} the item to scroll the file list to (newly selected), if any
 */
export function toggleSelectionAt(map, pixel, vectorLayers) {
    const vectorHit = featureAt(map, pixel, l => vectorLayers.includes(l) && !!l.file);
    if (vectorHit) {
        const file = vectorHit.layer.file;
        file.selected = !file.selected;
        return file.selected ? file : null;
    }
    const hit = featureAt(map, pixel);
    if (!hit) return null;
    const files = filesOfFeature(hit.feature);
    if (!files.length) return null;
    const select = !files.some(f => f.selected);
    files.forEach(f => { f.selected = select; });
    return select && hit.feature.get && hit.feature.get('features') ? files[0] : null;
}

/**
 * Explorer items a lasso polygon covers: shots inside it, raster extents and vector files
 * it intersects. Each item appears once, in that order.
 * @param {import('ol/geom/Polygon').default} polygon
 * @param {{ shots: any[], extents: any[], vectorLayers: any[] }} sources  shots/extents: OL features
 * @returns {any[]}
 */
export function filesInPolygon(polygon, { shots, extents, vectorLayers }) {
    const hits = new Set();
    for (const feat of shots) {
        const geom = feat.getGeometry();
        if (feat.file && geom && polygon.intersectsCoordinate(geom.getCoordinates())) hits.add(feat.file);
    }
    for (const feat of extents) {
        const geom = feat.getGeometry();
        if (feat.file && geom && polygon.intersectsExtent(geom.getExtent())) hits.add(feat.file);
    }
    const extent = polygon.getExtent();
    for (const layer of vectorLayers) {
        const source = layer.file && layer.getSource();
        if (!source || !source.forEachFeatureInExtent) continue;
        let inside = false;
        source.forEachFeatureInExtent(extent, feature => {
            const geom = feature.getGeometry();
            if (geom && polygon.intersectsExtent(geom.getExtent())) inside = true;
        });
        if (inside) hits.add(layer.file);
    }
    return [...hits];
}
